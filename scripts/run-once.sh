#!/usr/bin/env bash
# One loop iteration, or one benchmark run.
# Usage:
#   run-once.sh [claude|codex]                  # live loop iteration (harness/loop.md)
#   run-once.sh [claude|codex] bench-<slug>     # calibration run (harness/benchmark.md
#                                               #  + benchmarks/bench-<slug>.md)
# Safe to call from cron; engine stdout goes to attempts/raw-logs/.
set -euo pipefail
cd "$(dirname "$0")/.."
source scripts/portable.sh
at_require_bash || exit 1

ENGINE="$(bash "$(dirname "$0")/run-engine.sh" "${1:-}")"
export RUN_ENGINE="$ENGINE"
BENCH="${2:-}"
STAMP="$(date +%Y%m%d-%H%M%S)"
mkdir -p attempts/raw-logs

# --- Session-context sanitization + process-group isolation (defense in depth; NOT
# the 2026-07-23 crash root cause — that was the watchdog/lock self-deadlock, see the
# watchdog block below). A headless `claude -p` launched from inside another Claude
# Code session inherits that session's context env (CLAUDE_CODE_CHILD_SESSION=1,
# CLAUDE_PID, CLAUDE_CODE_SESSION_ID, ...); strip the markers so the run is a
# first-class root session no matter who launched it, and setsid so parent-side
# job-control signals / tool timeouts can't reach the run's process group.
for v in CLAUDECODE CLAUDE_CODE_CHILD_SESSION CLAUDE_CODE_SESSION_ID \
         CLAUDE_CODE_BRIDGE_SESSION_ID CLAUDE_PID CLAUDE_CODE_ENTRYPOINT \
         CLAUDE_EFFORT AI_AGENT CLAUDE_CODE_SSE_PORT CLAUDE_CODE_TASK_ID; do
  unset "$v" 2>/dev/null || true
done
SETSID=("${AT_SETSID[@]}")

# One-run-at-a-time lock (paired with should-run.sh's OOM guard). Stale locks from a
# crashed run are cleared automatically (PID no longer alive).
LOCK="attempts/.run.lock"
if [[ -f "$LOCK" ]] && kill -0 "$(cat "$LOCK" 2>/dev/null)" 2>/dev/null; then
  echo "another run is active (lock $LOCK, pid $(cat "$LOCK")) — refusing to stack" >&2; exit 4
fi
echo $$ > "$LOCK"
trap 'rm -f "$LOCK"' EXIT

# Resolve the attempt model. Shared with usage.sh via scripts/run-model.sh so the
# gate can never check a different model's tank than the one actually launched.
read -r RESOLVED_MODEL _MODEL_KEY < <(bash "$(dirname "$0")/run-model.sh")

# --- Memory discipline for this 3.7GB box (OOM killed a run + the supervisor on
# 2026-07-23 when concurrent subagent processes multiplied past RAM). SCOPED to the
# headless run only — the user's global settings.json is untouched. Two distinct knobs:
#   MAX_CONCURRENT_SUBAGENTS (global default 20) — caps how many subagent PROCESSES run
#     at once. THIS is the memory multiplier; the load-bearing cap.
#   MAX_TOOL_USE_CONCURRENCY (global default 10) — caps parallel tool CALLS (incl. the
#     Python compute subprocesses each subagent spawns).
#   FORK_SUBAGENT=0 — fresh, isolated subagent context instead of inheriting the full
#     parent conversation (=1). The harness gives each subagent a self-contained task
#     brief, so fresh context loses nothing here and is lighter per process. (Exact
#     process/memory semantics are undocumented — these are conservative, memory-first,
#     and reversible via env on a bigger box.)
# Stamp every process this run spawns, however deeply. The env is inherited
# through fork/setsid/nohup, so anything the run detaches with `nohup ... &`
# still carries it after the run itself is killed at RUN_TIMEOUT_MIN. That
# makes pipeline-spawned compute precisely identifiable later — see
# scripts/reap-orphans.sh. Work YOU start by hand never carries it, so a reaper
# keyed on this can never touch your own long-lived operator processes.
export AUTOTAO_RUN_ID="${AUTOTAO_RUN_ID:-$(date +%Y%m%d-%H%M%S)-$$}"

export CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS="${CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS:-3}"
export CLAUDE_CODE_MAX_TOOL_USE_CONCURRENCY="${CLAUDE_CODE_MAX_TOOL_USE_CONCURRENCY:-3}"
export CLAUDE_CODE_FORK_SUBAGENT="${CLAUDE_CODE_FORK_SUBAGENT:-0}"

if [[ -n "$BENCH" ]]; then
  BFILE="benchmarks/${BENCH}.md"
  [[ -f "$BFILE" ]] || { echo "no such benchmark: $BFILE" >&2; exit 2; }
  PROMPT="$(cat harness/benchmark.md "$BFILE")"
  TAG="${BENCH}"
else
  PROMPT="$(cat harness/loop.md)"
  TAG="loop"
fi

# RESUME_SESSION=<session-id>: continue an interrupted run (rate-limit kill, watchdog
# kill, crash) with its full context instead of starting fresh. The original rules
# still bind; the prompt swaps to a continuation brief.
RESUME_ARGS=()
if [[ -n "${RESUME_SESSION:-}" ]]; then
  RESUME_ARGS=(--resume "$RESUME_SESSION")
  TAG="${TAG}-resume"
  PROMPT="You are being resumed after an interruption (usage-limit outage, watchdog
kill, or crash). Every rule from your original prompt still binds — zero network for
benchmarks, output contract, root-only LOG.md, no session-persistence tools. Your
background processes are DEAD, but their checkpoint files and code are on disk in
your artifact directory. First: reassess state from disk (checkpoints, logs, partial
results). Then restart your search lanes from checkpoints — do not rebuild from
scratch what already exists — and drive to the output contract. The no-continuation
rule applies to THIS invocation too: collect or kill every background task before
your final message."
fi

# RUN_TIMEOUT_MIN caps wall time (default: none for benchmarks, 90 min for loop
# iterations — keeps iterations reviewable and lets the usage gate breathe between
# runs — override by exporting RUN_TIMEOUT_MIN).
# Tools blocked for every run: session/orchestration tools that imply a
# persistent session or another party reading output later — neither exists in a
# one-shot headless run (see the --disallowedTools note at the claude invocation).
DISALLOW_BASE="ScheduleWakeup,Monitor,CronCreate,CronDelete,CronList,PushNotification,SendMessage,RemoteTrigger,DesignSync,Workflow"

# Explicit ALLOWLIST instead of --dangerously-skip-permissions. Same practical
# capability for an unattended run, but it FAILS CLOSED: a tool that is not named
# here is denied, including any tool a future CLI release adds. Bypassing all
# permission checks fails OPEN — every new capability is granted silently, and the
# only thing standing between the run and it is a prompt rule. Verified 2026-07-26
# that a headless `claude -p` with this allowlist runs Bash without prompting or
# hanging; permission-denied is a normal tool error, not a stall.
# Bash is allowed unscoped because runs compile, run python, and git-commit; the
# confinement is the harness's hard rules plus the repo boundary, not a flag.
ALLOW_BASE="Read,Glob,Grep,Edit,Write,Bash,Task,TodoWrite"

# WebFetch/WebSearch are blocked for BENCHMARK runs only. The zero-network rule
# in harness/benchmark.md exists because benchmark problems have published
# solutions and one fetch invalidates the run — that rationale does not apply to
# a live run on an open problem, where there is no answer key to find.
#
# Blocking them on live runs was actively harmful: the house rules require
# re-verifying that a problem is still open before attempting it, and problems/*.md
# carry RE-CONFIRM markers for exactly that, but the runs had no tool to do it.
# Three consecutive attempts hit the block, concluded "dead arXiv API", and that
# misdiagnosis was recorded in a problem file as external fact until it
# was fetched by hand on 2026-07-25 (arXiv:2410.22842, HTTP 200 first try).
# Pre-emption is a real risk here — De Loof 2010 covered the 1/3-2/3 work at n<=13
# after we did it — so literature access on live runs is a feature, not a leak.
#
# NOTE this was never airtight anyway: curl runs through Bash and is not blocked,
# so benchmark contamination is really prevented by the prompt rule in
# harness/benchmark.md plus the raw-log audit. This block is defense-in-depth on
# top of those, and belongs only where those rules apply.
if [[ -n "$BENCH" ]]; then
  DISALLOW="${DISALLOW_BASE},WebFetch,WebSearch"
  ALLOW="${ALLOW_BASE}"
else
  DISALLOW="${DISALLOW_BASE}"
  ALLOW="${ALLOW_BASE},WebFetch,WebSearch"
fi

# --- Watchdog preflight: never spend on a run the watchdog would kill immediately.
# Kept even though scripts/launch.sh asks the same question, because run-once.sh is
# also invoked directly (harness/supervisor.md) and this is the script that spends.
# Since budgets.conf derives the kill ceilings from the gate's, this is now an
# assertion rather than a live risk — see the 2026-07-26 note in that file.
if [[ "$ENGINE" == "claude" && -z "${SKIP_WATCHDOG_PREFLIGHT:-}" ]]; then
  wrc=0
  WPRE=$(bash "$(dirname "$0")/usage.sh" kill 2>&1 >/dev/null) || wrc=$?
  if [[ "$wrc" -eq 1 ]]; then
    echo "refusing to launch: the usage watchdog would kill this run at its first tick" >&2
    echo "  ${WPRE##*$'\n'}" >&2
    echo "  budgets.conf's kill ceilings should be derived from its gate ceilings —" >&2
    echo "  run scripts/selftest-budgets.sh; this state is supposed to be unrepresentable." >&2
    exit 3
  fi
fi

if [[ -z "${RUN_TIMEOUT_MIN:-}" && "$TAG" == "loop" ]]; then RUN_TIMEOUT_MIN=90; fi
TCMD=()
if [[ -n "${RUN_TIMEOUT_MIN:-}" ]]; then
  # The wall cap is load-bearing, not advisory: harness/loop.md's ship-by-halfway
  # discipline is derived from it, and a run that believes it has a deadline it
  # does not have will pace itself wrongly. Refuse rather than run uncapped.
  at_require_timeout || exit 3
  TCMD=("${AT_TIMEOUT[@]}" "${RUN_TIMEOUT_MIN}m")
fi

# --- Tell the run its own deadline. Until 2026-07-26 nothing did, and the run had
# no way to find out: `timeout` sends SIGTERM to the CLI, which cannot interrupt an
# in-flight model turn, so the cap is not a signal the run can handle — it is an
# instant death. Four loop iterations that day (06:16, 09:08, 13:34, 15:05) ended
# `error_during_execution` at duration_ms 5,399,1xx-5,399,3xx — 89.99 min, the cap
# itself, every one of them mid-work with proofs on disk and no RESULT.md, no
# LOG.md line, no LOOP_STATE update. Two of those cost a later iteration a full
# ~1.5h salvage run each (iters 21 and 26). The cure is self-pacing: the run must
# know the wall and ship a complete artifact before it, per harness/loop.md §4a.
# The number is INTERPOLATED from RUN_TIMEOUT_MIN, never written twice — same rule
# budgets.conf follows for the kill ceilings.
if [[ -n "${RUN_TIMEOUT_MIN:-}" ]]; then
  SHIP_BY_MIN=$(( RUN_TIMEOUT_MIN / 2 ))
  PROMPT="${PROMPT}

## WALL CLOCK (injected by scripts/run-once.sh — binding)

This process is killed with SIGTERM at **${RUN_TIMEOUT_MIN} minutes** wall time
(started ${STAMP}, hard stop $(at_deadline_utc "$RUN_TIMEOUT_MIN")). The kill is instant and
uncatchable: you get no final turn, no chance to write files, no chance to log.
Anything not on disk at that instant is lost, and salvaging it costs a later
iteration an entire run.

Therefore: **by minute ${SHIP_BY_MIN} you must have shipped a complete, honest,
as-of-now artifact** — RESULT.md, verify/, the \`attempts/LOG.md\` line, the
LOOP_STATE.md update, committed via \`scripts/commit-attempt.sh\`. Ship whatever
is true at that point, even if it is \`failed\` or a thin \`partial\`; a modest
shipped result beats a strong unshipped one. After that, keep working and
RE-SHIP in place (amend the artifact, re-commit) as you learn more. Budget any
single search lane so it finishes inside the remaining window, or bound its
scope until it does."
fi

case "$ENGINE" in
  claude)
    # Headless Claude Code, run under an explicit tool allowlist rather than
    # --dangerously-skip-permissions (see the ALLOW_BASE note above).
    # Pin the model: the user's settings.json defaults headless runs to sonnet,
    # but attempts should run on the strongest model (override via RUN_MODEL).
    # CLAUDE_CODE_PRINT_BG_WAIT_CEILING_MS=0: headless mode otherwise kills
    # still-running subagent/background work 600s after the root's last message.
    # --disallowedTools: the default toolset includes session/orchestration tools
    # (ScheduleWakeup, Monitor, Cron*, PushNotification, SendMessage, RemoteTrigger,
    # DesignSync, Workflow) that imply a persistent session or another party reading
    # output later — neither exists in a one-shot headless run. Run 3 (2026-07-20)
    # discovered ScheduleWakeup/Monitor were callable, used them to try to "come back
    # later" for three background search lanes, got one lucky wakeup, then the
    # process exited anyway — losing those lanes and leaving the output contract
    # half-finished. Hard-blocking beats a prompt rule the model can route around.
    # WebFetch/WebSearch: benchmark runs only — see the DISALLOW block above.
    LOGF="attempts/raw-logs/${STAMP}-claude-${TAG}.log"
    DEBUG_ARGS=()
    [[ -n "${RUN_DEBUG_FILE:-}" ]] && DEBUG_ARGS=(--debug-file "$RUN_DEBUG_FILE")
    CLAUDE_CODE_PRINT_BG_WAIT_CEILING_MS=0 \
    "${SETSID[@]}" "${TCMD[@]}" claude -p "$PROMPT" "${RESUME_ARGS[@]}" \
      --model "$RESOLVED_MODEL" \
      --allowedTools "$ALLOW" \
      --disallowedTools "$DISALLOW" \
      --output-format stream-json --verbose \
      "${DEBUG_ARGS[@]}" \
      >> "$LOGF" 2>&1 &   # >> (append), NOT >: the watchdog also appends to $LOGF;
                          # with a truncate-mode fd claude's buffered writes clobber
                          # appended watchdog lines (this hid the kill reason all day)
    CPID=$!
    # Usage watchdog: launch-time gating alone let run 4 (2026-07-21) burn the 5h
    # window to 99%. Re-check the meters every 60s (the endpoint tolerates it fine)
    # and terminate the run once it exceeds what the gate budgeted for it — the
    # ceilings are derived from the gate's in scripts/budgets.conf, so this can no
    # longer fire on a run the gate just admitted (2026-07-26).
    # CACHE_MAX_AGE=55 forces a fresh fetch each tick.
    # Only exit code 1 (over ceiling) kills; 3 (meters unknown) never does.
    #
    # `usage.sh kill` asks about USAGE ONLY. The watchdog no longer needs a flag to
    # subtract checks that do not apply to a live run: forgetting exactly that flag
    # (IGNORE_RUN_LOCK, against should-run.sh's lock check) made the watchdog kill
    # the run it was guarding, the 2026-07-23 11-crash cluster. There is no lock
    # check in this code path to forget any more.
    (
      while sleep "${WATCHDOG_INTERVAL:-60}"; do
        kill -0 "$CPID" 2>/dev/null || exit 0
        rc=0
        WOUT=$(CACHE_MAX_AGE=55 bash "$(dirname "$0")/usage.sh" kill 2>&1 >/dev/null) || rc=$?
        if [[ "$rc" -eq 1 ]]; then
          echo "[watchdog $(date +%F-%H:%M)] hard ceiling breached — terminating run: ${WOUT##*$'\n'}" >> "$LOGF"
          kill "$CPID" 2>/dev/null
          exit 0
        fi
      done
    ) &
    WPID=$!
    RC=0; wait "$CPID" || RC=$?
    kill "$WPID" 2>/dev/null || true
    exit "$RC"
    ;;
  codex)
    # Headless Codex. JSONL supplies explicit terminal events for the engine-neutral
    # supervisor. --full-auto retains workspace-write confinement and noninteractive
    # approvals; benchmark network restrictions remain binding in the harness prompt.
    LOGF="attempts/raw-logs/${STAMP}-codex-${TAG}.log"
    CODEX_ARGS=(exec --json --full-auto)
    [[ -n "${CODEX_MODEL:-}" ]] && CODEX_ARGS+=(--model "$CODEX_MODEL")
    "${SETSID[@]}" "${TCMD[@]}" codex "${CODEX_ARGS[@]}" "$PROMPT" >> "$LOGF" 2>&1 &
    CPID=$!
    (
      while sleep "${WATCHDOG_INTERVAL:-60}"; do
        kill -0 "$CPID" 2>/dev/null || exit 0
        rc=0
        WOUT=$(bash "$(dirname "$0")/usage.sh" kill 2>&1 >/dev/null) || rc=$?
        if [[ "$rc" -eq 1 ]]; then
          echo "[watchdog $(date +%F-%H:%M)] hard ceiling breached — terminating run: ${WOUT##*$'\n'}" >> "$LOGF"
          kill "$CPID" 2>/dev/null
          exit 0
        fi
      done
    ) &
    WPID=$!
    RC=0; wait "$CPID" || RC=$?
    kill "$WPID" 2>/dev/null || true
    exit "$RC"
    ;;
  *)
    echo "usage: $0 [claude|codex] [bench-<slug>]" >&2; exit 2 ;;
esac
