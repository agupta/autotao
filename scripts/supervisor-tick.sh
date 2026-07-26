#!/usr/bin/env bash
# Tiered supervision tick — cron-driven babysitter for the solve pipeline.
# Install: see scripts/crontab.example (every 15 min). Idempotent; exits fast and
# free when everything is healthy. State lives under attempts/supervision/.
#
#   Tier 0 (pure bash, $0):   healthy-run detection, stalled-run kill, stale-lock
#                             cleanup, transient-crash relaunch (gated, max 2 per
#                             6h), crash-streak detection.
#   Tier 1 (haiku, ~cents):   triage a finished/crashed run: append its LOG.md
#                             line, decide RELAUNCH / ESCALATE / IDLE.
#   Tier 2 (fable; opus when fable's weekly tank ≥ T2_FABLE_CEILING): full
#                             supervision cycle per harness/supervisor.md — score,
#                             fix wiring, commit, relaunch. Max 1 per 2h.
#
# Every claude spawn here is sanitized (env-sanitize.sh) + setsid so it is a
# first-class root session — see the 2026-07-23 watchdog post-mortem in
# scripts/run-once.sh before changing any of that.
set -uo pipefail
cd "$(dirname "$0")/.."
source scripts/env-sanitize.sh

S=attempts/supervision; mkdir -p "$S" attempts/raw-logs
exec 9>"$S/.tick.flock"; flock -n 9 || exit 0     # one tick at a time
log(){ echo "[tick $(date +%F-%H:%M:%S)] $*" >> "$S/tick.log"; }

DISALLOWED="ScheduleWakeup,Monitor,CronCreate,CronDelete,CronList,PushNotification,SendMessage,RemoteTrigger,DesignSync,Workflow,WebFetch,WebSearch"
# Explicit allowlists rather than bypassing permission checks — see the ALLOW_BASE
# note in scripts/run-once.sh. Tier 1 only settles the books, so it gets no Task.
ALLOW_T1="Read,Glob,Grep,Edit,Write,Bash"
ALLOW_T2="Read,Glob,Grep,Edit,Write,Bash,Task,TodoWrite"

newest_log(){ ls -t attempts/raw-logs/*.log 2>/dev/null | head -1; }

# Campaign probes belong HERE, not in the console: the console re-renders every few
# seconds and must stay network-free, while a probe needs one remote listing. If you
# add one, make its failure non-fatal by construction — a probe that cannot reach
# the network keeps its previous value rather than reporting zero.

# Defer model spawns when the box is memory-starved: the state that made us
# want to spawn persists (marker/flag untouched), so the next tick retries.
mem_ok(){ local need="${1:-600}" avail; avail=$(free -m | awk '/^Mem:/{print $7}')
  [[ "${avail:-0}" -ge "$need" ]] && return 0
  log "deferring model spawn: ${avail}MB available < ${need}MB floor"; return 1; }

# result-line fields of a finished raw log ("" if none): is_error duration_ms
result_info(){ tail -c 65536 "$1" 2>/dev/null | tail -1 | python3 -c '
import sys, json
try:
    j = json.loads(sys.stdin.read().strip().splitlines()[-1])
    if j.get("type") == "result":
        print(("1" if j.get("is_error") else "0"), j.get("duration_ms", 0))
except Exception:
    pass' 2>/dev/null; }

# ---------- Tier 0 ----------
RLOCK=attempts/.run.lock
if [[ -f "$RLOCK" ]] && kill -0 "$(cat "$RLOCK" 2>/dev/null)" 2>/dev/null; then
  NL=$(newest_log); AGE=$(( $(date +%s) - $(stat -c %Y "$NL" 2>/dev/null || echo 0) ))
  if (( AGE < 2700 )); then exit 0; fi                    # healthy live run
  log "run pid=$(cat "$RLOCK") presumed hung: newest log static ${AGE}s — killing + escalating"
  kill "$(cat "$RLOCK")" 2>/dev/null; sleep 5
  echo "hung-run-killed $(date +%F-%H:%M)" >> "$S/ESCALATE"
fi
[[ -f "$RLOCK" ]] && ! kill -0 "$(cat "$RLOCK" 2>/dev/null)" 2>/dev/null && rm -f "$RLOCK"

NL=$(newest_log); [[ -n "${NL:-}" ]] || exit 0
MARK="$S/.processed"; PREV="$(cat "$MARK" 2>/dev/null || true)"

# crash streak = how many of the newest 3 logs ended is_error with <10 min duration
streak=0
for f in $(ls -t attempts/raw-logs/*.log 2>/dev/null | head -3); do
  read -r ERR DUR <<<"$(result_info "$f")" || true
  [[ "${ERR:-}" == "1" && "${DUR:-600000}" -lt 600000 ]] && streak=$((streak+1)) || break
done

# ---------- Tier 2: escalation (crash streak >= 2, or explicit ESCALATE flag) ----------
if [[ -f "$S/ESCALATE" ]] || (( streak >= 2 )); then
  LAST_T2=$(cat "$S/.last-t2" 2>/dev/null || echo 0)
  if (( $(date +%s) - LAST_T2 < 7200 )); then log "escalation pending but tier-2 in cooldown"; exit 0; fi
  FW=$(jq -r '.weekly_by_model.fable // 0 | floor' ~/.claude/rate_limits_v2.json 2>/dev/null || echo 0)
  T2_MODEL=$([[ "${FW:-0}" -ge "${T2_FABLE_CEILING:-45}" ]] && echo opus || echo fable)
  mem_ok 700 || exit 0
  log "TIER-2 ($T2_MODEL): streak=$streak escalate_flag=$([[ -f $S/ESCALATE ]] && echo yes || echo no)"
  date +%s > "$S/.last-t2"; mv -f "$S/ESCALATE" "$S/.escalate-consumed" 2>/dev/null || true
  setsid timeout 45m claude -p "$(cat harness/supervisor.md)

CONTEXT: you were invoked by scripts/supervisor-tick.sh because the pipeline needs
fixing (crash streak or explicit escalation — see attempts/supervision/tick.log and
the newest attempts/raw-logs/*.log). Execute ONE supervision cycle: diagnose, fix,
commit, and relaunch via 'bash scripts/should-run.sh && bash scripts/run-once.sh
claude' ONLY if the fix is verified. Do not start benchmarks. Keep attempts/LOG.md
current." \
    --model "$T2_MODEL" \
    --allowedTools "$ALLOW_T2" \
    --disallowedTools "$DISALLOWED" \
    >> "$S/tier2-$(date +%Y%m%d-%H%M%S).log" 2>&1 &
  echo "$NL" > "$MARK"; exit 0
fi

# ---------- Tier 1: newest run finished and not yet processed ----------
read -r ERR DUR <<<"$(result_info "$NL")" || true
if [[ "$NL" != "$PREV" && -n "${ERR:-}" ]]; then
  mem_ok 600 || exit 0
  log "TIER-1 (haiku): triaging $NL (is_error=$ERR duration_ms=${DUR:-?})"
  # LOG.md lines reference the ARTIFACT dir, not the raw-log stamp, so there is
  # no reliable string to grep for. Detect the append by line-count delta instead.
  LOGN_BEFORE=$(wc -l < attempts/LOG.md 2>/dev/null || echo 0)
  rm -f "$S/decision"
  setsid timeout 10m claude -p "$(cat harness/triage.md)" \
    --model claude-haiku-4-5 \
    --allowedTools "$ALLOW_T1" \
    --disallowedTools "$DISALLOWED" \
    >> "$S/tier1-$(date +%Y%m%d-%H%M%S).log" 2>&1

  # POST-CONDITION: a crashed run MUST end up with a LOG.md line. triage.md tells
  # the agent to append one, but nothing verified it did. On 2026-07-25 haiku
  # triaged a run with is_error=1 that had written no line, returned IDLE anyway
  # (IDLE means "completed cleanly and logged itself" — it had done neither), and
  # the crash sat unlogged for 8.5h with an orphaned 397MB artifact. That is the
  # same state attempt 4 was left in, which cost a whole later run to salvage.
  # The house rules make the LOG.md line non-negotiable, so enforce it here rather
  # than trusting the model: if no line references this run's stamp, append a
  # deterministic one from facts the script already has.
  LOGN_AFTER=$(wc -l < attempts/LOG.md 2>/dev/null || echo 0)
  if [[ "$ERR" == "1" ]] && (( LOGN_AFTER <= LOGN_BEFORE )); then
    SUB=$(tail -c 65536 "$NL" 2>/dev/null | tail -1 | python3 -c '
import sys, json
try: print(json.loads(sys.stdin.read().strip()).get("subtype") or "unknown")
except Exception: print("unknown")' 2>/dev/null || echo unknown)
    HRS=$(awk -v ms="${DUR:-0}" 'BEGIN{printf "%.2f", ms/3600000}')
    printf '| %s | (unknown — tier-1 fallback) | (unknown) | (see raw log %s) | ~%s | failed (%s; LOG.md line synthesized by supervisor-tick because tier-1 returned without appending one) | %s | tick-fallback |\n' \
      "$(date +%F)" "$(basename "$NL")" "$HRS" "$SUB" "(unknown — see raw log)" >> attempts/LOG.md
    log "WARNING: tier-1 left $NL unlogged — appended a fallback LOG.md line"
    git add attempts/LOG.md 2>/dev/null && git commit -q -m "triage fallback: log failed run $(basename "$NL")" 2>/dev/null || true
  fi

  echo "$NL" > "$MARK"
  case "$(cat "$S/decision" 2>/dev/null || echo IDLE)" in
    RELAUNCH)
      N6=$(grep -c "^relaunch" "$S/.relaunches" 2>/dev/null || echo 0)
      # prune relaunch ledger to the last 6h
      awk -v cut="$(( $(date +%s) - 21600 ))" '$2 >= cut' "$S/.relaunches" 2>/dev/null > "$S/.relaunches.new" && mv "$S/.relaunches.new" "$S/.relaunches" || true
      if (( $(wc -l < "$S/.relaunches" 2>/dev/null || echo 0) >= 2 )); then
        log "relaunch budget exhausted (2/6h) — escalating instead"
        echo "relaunch-budget $(date +%F-%H:%M)" >> "$S/ESCALATE"
      else
        echo "relaunch $(date +%s)" >> "$S/.relaunches"
        log "gated relaunch"
        # scripts/launch.sh is the one launch entrypoint (gate + preflight + detach);
        # it writes its own launch-<stamp>.log and returns a real exit code.
        LRC=0; bash scripts/launch.sh >> "$S/tick.log" 2>&1 || LRC=$?
        (( LRC == 0 )) || log "relaunch refused rc=$LRC — see the launch log"
      fi ;;
    ESCALATE) echo "tier1 $(date +%F-%H:%M)" >> "$S/ESCALATE"; log "tier-1 requested escalation" ;;
    *) log "tier-1 decision: idle" ;;
  esac
fi
exit 0
