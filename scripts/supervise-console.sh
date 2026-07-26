#!/usr/bin/env bash
# Foreground supervision console — run inside tmux; Ctrl-C to stop.
#
# Problem-agnostic: this script knows NOTHING about any particular problem.
# Campaigns describe themselves via drop-in descriptor files discovered at:
#     attempts/*/run/*.campaign          (override with CAMPAIGN_GLOB)
# See scripts/campaign.example for the format. Add a new campaign by dropping a
# .campaign file next to its artifacts — no edit to this file, ever.
#
# Redraws a status dashboard every REFRESH seconds and executes
# scripts/supervisor-tick.sh (the same logic cron would run) every
# TICK_INTERVAL seconds, plus immediately when the live run exits.
#
# Cost: pure bash/awk, no model calls, no network, no new dependencies.
# Campaign metrics are cached for SAMPLE_INTERVAL seconds so the cosmetic
# redraw stays cheap even when a campaign has many segment files.
#
# CONSOLE_ONCE=1  render a single frame and exit. Render-only: does NOT fire a
#                 supervisor tick and does NOT auto-launch, so it is safe to run
#                 for testing while a real console is up.
# NO_COLOR=1      plain ASCII, no escapes (also automatic when not a TTY)
set -uo pipefail
cd "$(dirname "$0")/.."
REFRESH="${REFRESH:-5}"
TICK_INTERVAL="${TICK_INTERVAL:-900}"
SAMPLE_INTERVAL="${SAMPLE_INTERVAL:-30}"
CAMPAIGN_GLOB="${CAMPAIGN_GLOB:-attempts/*/run/*.campaign}"
# Auto-launch the next gated solve iteration when idle (AUTO_LAUNCH=0 disables).
# Pace: at most one launch per LAUNCH_GAP seconds (default 3h ~ crontab's 4/day);
# every launch still passes scripts/should-run.sh (usage tanks, memory, lock).
AUTO_LAUNCH="${AUTO_LAUNCH:-1}"
# Minimum spacing between LAUNCHES. This is a coarse throttle, not the budget
# control — should-run.sh's quota ceilings are, and attempts/.run.lock already
# makes stacking impossible. The old 10800 (3h) mirrored the retired crontab's
# 4/day; with runs finishing in ~15min that left the pipeline idle ~92% of the
# time. 600s keeps a run essentially always in flight and lets the quota gate be
# the real limiter. Raise it if you want to conserve weekly quota.
LAUNCH_GAP="${LAUNCH_GAP:-600}"
# A refusal is not a launch. The gate declines for reasons that clear in
# minutes (quota tank, free memory, a run already in flight), so charging a
# refusal the full LAUNCH_GAP strands the loop: a gate that reopens at 02:10 is
# not asked again until 04:19. Refusals back off by GATE_RETRY_GAP instead,
# which is still long enough not to hammer should-run.sh (it hits the usage
# endpoint when its cache is stale).
GATE_RETRY_GAP="${GATE_RETRY_GAP:-600}"
S=attempts/supervision; mkdir -p "$S" "$S/hist"

# Budgets live in exactly one file; the console reads it only to DISPLAY the
# watchdog ceilings alongside the gate's. Fail fast on a bad edit: an inverted
# budget used to surface as runs dying at 60s, an hour later.
source scripts/budgets.conf
if ! SELFTEST=$(bash scripts/selftest-budgets.sh 2>&1); then
  printf '%s\n' "$SELFTEST" >&2
  echo "refusing to start: scripts/budgets.conf violates its invariants (above)" >&2
  exit 1
fi

# Shared exit-code vocabulary: usage.sh / capacity.sh / launch.sh all speak it,
# so callers branch on a number instead of grepping English out of the output.
rc_meaning(){ case "$1" in
  0) echo "ok" ;;         1) echo "usage ceiling" ;;   2) echo "memory floor" ;;
  3) echo "meters unknown / would be killed at once" ;; 4) echo "run already in flight" ;;
  *) echo "rc=$1" ;;
esac; }

# ---------------------------------------------------------------- presentation
if [[ -n "${NO_COLOR:-}" ]] || [[ ! -t 1 ]]; then FANCY=0; else FANCY=1; fi
# Recomputed each frame so the layout follows terminal resizes.
resize(){ COLS=$(tput cols 2>/dev/null || echo 100)
  (( COLS < 72 )) && COLS=72; (( COLS > 160 )) && COLS=160
  ROWS=$(tput lines 2>/dev/null || echo 40); (( ROWS < 10 )) && ROWS=10; }
resize

c(){ # c <256-color-code> <text...>
  if (( FANCY )); then printf '\033[38;5;%sm%s\033[0m' "$1" "${*:2}"; else printf '%s' "${*:2}"; fi
}
dim(){ c 244 "$@"; }
bold(){ if (( FANCY )); then printf '\033[1m%s\033[0m' "$*"; else printf '%s' "$*"; fi; }

# Colour ramp red -> amber -> green, indexed by percent complete.
hue(){ awk -v p="$1" 'BEGIN{
  split("196 202 208 214 220 226 190 154 118 82 46", h, " ");
  i = int(p/100*10)+1; if(i<1)i=1; if(i>11)i=11; print h[i] }'; }

bar(){ # bar <done> <total> <width>   -> unicode bar with 1/8-cell resolution
  local pct; pct=$(awk -v d="$1" -v t="$2" 'BEGIN{ printf "%.4f", (t>0? d/t*100 : 0) }')
  local body
  body=$(awk -v p="$pct" -v w="${3:-32}" -v fancy="$FANCY" 'BEGIN{
    if(p<0)p=0; if(p>100)p=100;
    if(!fancy){ f=int(p/100*w+0.5);
      s="["; for(i=0;i<f;i++) s=s"#"; for(i=f;i<w;i++) s=s"-"; print s"]"; exit }
    pb[1]="\342\226\217"; pb[2]="\342\226\216"; pb[3]="\342\226\215"; pb[4]="\342\226\214";
    pb[5]="\342\226\213"; pb[6]="\342\226\212"; pb[7]="\342\226\211";
    full="\342\226\210"; empty="\342\224\200";
    u = p/100*w*8; nf = int(u/8); rem = int(u)%8;
    s=""; for(i=0;i<nf;i++) s = s full;
    if(rem>0 && nf<w){ s = s pb[rem]; nf++ }
    for(i=nf;i<w;i++) s = s empty;
    print s }')
  if (( FANCY )); then printf '\033[38;5;%sm%s\033[0m %5.1f%%' "$(hue "$pct")" "$body" "$pct"
  else printf '%s %5.1f%%' "$body" "$pct"; fi
}

human(){ awk -v n="$1" 'BEGIN{
  split("_ k M G T P", u, " ");
  i=1; while(n>=1000 && i<6){ n/=1000; i++ }
  if(i==1) printf (n==int(n) ? "%d" : "%.1f"), n; else printf "%.1f%s", n, u[i] }'; }

dur(){ awk -v s="$1" 'BEGIN{
  if(s<=0||s=="inf"||s!=s){ print "--"; exit }
  d=int(s/86400); s-=d*86400; h=int(s/3600); s-=h*3600; m=int(s/60);
  if(d>0) printf "%dd%dh", d, h; else if(h>0) printf "%dh%dm", h, m; else printf "%dm", m }'; }

rule(){ if (( FANCY )); then c 240 "$(printf '─%.0s' $(seq 1 $((COLS-2))))"; else printf '%*s' $((COLS-2)) '' | tr ' ' '-'; fi; }

# printf '%-*s' pads by BYTES, which misaligns any label containing multibyte
# characters (δ, ε, …). Pad by character count instead.
pad(){ local s="$1" n="$2" len=${#1}; printf '%s' "$s"; (( n > len )) && printf '%*s' $(( n - len )) ''; }

# Clamp every painted line to COLS-1 visible columns. A line wider than the pane
# wraps, and a wrapped line occupies two screen rows while counting as one
# logical line — so the paint budget under-counts, the frame overflows, and the
# title scrolls away. Escape sequences must not count toward the width and must
# not be cut mid-sequence, and box-drawing/UTF-8 glyphs count as one column, so
# neither `cut -c` (bytes, and shreds escapes) nor awk's length() will do.
clamp(){ CLAMP_W="$(( COLS - 1 ))" python3 -c '
import sys, os, re
w = int(os.environ["CLAMP_W"])
ansi = re.compile("\x1b\\[[0-9;?]*[A-Za-z]")
for line in sys.stdin.read().splitlines():
    vis, out, i, cut = 0, [], 0, False
    while i < len(line):
        m = ansi.match(line, i)
        if m:
            out.append(m.group()); i = m.end(); continue
        if vis >= w:
            cut = True; break
        out.append(line[i]); vis += 1; i += 1
    if cut: out.append("\x1b[0m")
    sys.stdout.write("".join(out) + "\n")
' 2>/dev/null; }

# Section header: accent bar + title + optional dim subtitle.
hdr(){ printf '%s %s%s\n' "$(c "${3:-39}" '▎')" "$(bold "$(c 252 "$1")")" \
  "${2:+$(dim "  $2")}"; }

# ------------------------------------------------------------------ campaigns
# Descriptor keys (all optional except label/kind):
#   label, kind (segments|logmatch|value|text), order, unit
#   segments: glob, ckpt_tag, final_tag, total, count_glob, count_label, log
#   logmatch: log, match, extract   (extract = ERE with 2 groups: done, total)
#   value:    value_file, total
#   text:     log
#   done_marker, done_file, done_grep, done_note
declare -A D
read_desc(){ # read_desc <file> -> populates D[], D[_dir]
  D=(); D[_dir]="$(dirname "$1")"; D[order]=50; D[kind]=text
  local k v line
  while IFS= read -r line || [[ -n "$line" ]]; do
    line="${line%%$'\r'}"
    [[ "$line" =~ ^[[:space:]]*(#|$) ]] && continue
    k="${line%%=*}"; v="${line#*=}"
    k="$(printf '%s' "$k" | tr -d '[:space:]')"
    [[ -z "$k" || "$k" == "$line" ]] && continue
    case "$k" in
      label|kind|order|unit|glob|ckpt_tag|final_tag|total|count_glob|count_label|log|match|extract|value_file|pct_file|done_marker|done_file|done_grep|done_note)
        D[$k]="$v" ;;
    esac
  done < "$1"
}

campaign_done(){ # <dir> <glob> <ckpt_tag> <final_tag> -> summed 'total=' across newest terminal lines
  local dir="$1" pat="$2" ctag="$3" ftag="$4" fo b
  for fo in "$dir"/$pat; do
    [[ -e "$fo" ]] || continue
    b="${fo%.out}"
    if [[ -n "$ftag" ]] && grep -q "^$ftag" "$fo" 2>/dev/null; then tail -1 "$fo"
    else grep "^$ctag" "$b.err" 2>/dev/null | tail -1; fi
  done | awk '{for(i=2;i<=NF;i++) if (split($i,kv,"=")==2 && kv[1]=="total") s+=kv[2]} END{print s+0}'
}

# Sample every campaign into a cache file: key|label|state|done|total|extra
sample_campaigns(){
  local out="$S/.campaigns.cache" tmp="$S/.campaigns.tmp" f key done_n extra state
  : > "$tmp"
  for f in $CAMPAIGN_GLOB; do
    [[ -f "$f" ]] || continue
    read_desc "$f"
    key="$(printf '%s' "$f" | tr -c 'A-Za-z0-9' '_')"
    state=live; done_n=0; extra=""

    if [[ -n "${D[done_marker]:-}" && -f "${D[_dir]}/${D[done_marker]}" ]]; then
      state=done
      if [[ -n "${D[done_note]:-}" ]]; then extra="${D[done_note]}"
      elif [[ -n "${D[done_file]:-}" && -f "${D[_dir]}/${D[done_file]}" ]]; then
        extra=$(grep -- "${D[done_grep]:-.}" "${D[_dir]}/${D[done_file]}" 2>/dev/null | tail -1)
        [[ -z "$extra" ]] && extra="see ${D[done_file]}"
      fi
    else
      case "${D[kind]}" in
        segments)
          if compgen -G "${D[_dir]}/${D[glob]:-__none__}" > /dev/null 2>&1; then
            done_n=$(campaign_done "${D[_dir]}" "${D[glob]}" "${D[ckpt_tag]:-CHKPT}" "${D[final_tag]:-}")
            if [[ -n "${D[count_glob]:-}" ]]; then
              extra="${D[count_label]:-count}: $(cat ${D[_dir]}/${D[count_glob]} 2>/dev/null | wc -l)"
            fi
          else
            state=wait
            [[ -n "${D[log]:-}" ]] && extra=$(tail -1 "${D[_dir]}/${D[log]}" 2>/dev/null)
          fi ;;
        logmatch)
          # newest line of <log> containing <match>; <extract> is an ERE whose
          # two capture groups are (done, total). '@' is the sed delimiter, so
          # an extract pattern may not contain a literal '@'.
          local line parsed
          line=$(grep -- "${D[match]:-.}" "${D[_dir]}/${D[log]:-__none__}" 2>/dev/null | tail -1)
          parsed=$(printf '%s' "$line" | sed -E "s@.*${D[extract]:-__none__}.*@\1 \2@" 2>/dev/null)
          if [[ -n "$line" && "$parsed" =~ ^[0-9.]+\ [0-9.]+$ ]]; then
            done_n="${parsed% *}"; D[total]="${parsed#* }"
          else
            state=wait; extra="${line:-no matching line in ${D[log]:-?}}"
          fi ;;
        value|percent)
          local vf="${D[value_file]:-${D[pct_file]:-__none__}}" p
          p=$(tr -dc '0-9.' < "${D[_dir]}/$vf" 2>/dev/null | head -c 12)
          if [[ -n "$p" ]]; then done_n="$p"; D[total]="${D[total]:-100}"; else state=wait; fi ;;
        text)
          state=text
          [[ -n "${D[log]:-}" ]] && extra=$(tail -1 "${D[_dir]}/${D[log]}" 2>/dev/null) ;;
      esac
    fi

    # Progress history -> ETA. Two things this must survive:
    #
    #  - Sampling is far finer than reporting. We sample every SAMPLE_INTERVAL
    #    (30s) but a remote babysitter may only write progress every 900s, so
    #    most consecutive sample pairs show zero delta. Differencing the last
    #    two samples therefore yields rate 0 almost always (eta "--"), and on
    #    the one pair that straddles a write it divides a 15-minute jump by 30
    #    seconds and reports a fantasy. Measure across the whole retained
    #    window instead, and require a minimum span before estimating at all.
    #
    #  - Progress is not monotonic. Spot VMs get preempted and restarted, and a
    #    restarted worker's count drops until it re-scans, so FLEET total can go
    #    backwards (observed: 183 -> 139 -> 241). If the window shows net
    #    regress we decline to estimate rather than print a negative or a
    #    wildly wrong ETA.
    if [[ "$state" == live && -n "${D[total]:-}" ]]; then
      local h="$S/hist/$key" now eta
      now=$(date +%s)
      printf '%s %s\n' "$now" "$done_n" >> "$h"
      tail -"${HIST_SAMPLES:-240}" "$h" > "$h.t" 2>/dev/null && mv "$h.t" "$h"
      eta=$(awk -v total="${D[total]}" -v cur="$done_n" -v minspan="${ETA_MIN_SPAN:-300}" '
        NR==1 { t0=$1; d0=$2 }
        { t1=$1; d1=$2 }
        END { if (NR < 2) { print -1; exit }
              dt = t1 - t0; dd = d1 - d0
              if (dt < minspan || dd <= 0) { print -1; exit }   # too short, or regressed
              r = dd / dt; rem = total - cur
              print (r > 0 && rem > 0 ? rem / r : -1) }' "$h")
      extra="${extra:+$extra  }eta $(dur "$eta")"
    fi

    printf '%s|%s|%s|%s|%s|%s|%s|%s|%s\n' \
      "${D[order]}" "$key" "${D[label]:-$(basename "$f" .campaign)}" "${D[kind]}" \
      "${D[unit]:-}" "$state" "$done_n" "${D[total]:-0}" "$extra" >> "$tmp"
  done
  sort -t'|' -k1,1n -k3,3 "$tmp" > "$out" 2>/dev/null || cp "$tmp" "$out"
  rm -f "$tmp"
  date +%s > "$S/.campaigns.ts"
}

render_campaigns(){
  local cache="$S/.campaigns.cache"
  [[ -s "$cache" ]] || { printf '  %s\n' "$(dim 'no campaigns discovered — drop a .campaign file (see scripts/campaign.example)')"; return; }
  local w=0 label
  while IFS='|' read -r _ _ label _ _ _ _ _ _; do (( ${#label} > w )) && w=${#label}; done < "$cache"
  (( w < 10 )) && w=10
  local bw=$(( COLS - w - 34 )); (( bw < 12 )) && bw=12; (( bw > 40 )) && bw=40
  local order key kind unit state done_n total extra counts
  while IFS='|' read -r order key label kind unit state done_n total extra; do
    case "$state" in
      done) printf '  %s  %s  %s\n' "$(pad "$label" "$w")" "$(c 46 '✔ done')" "$(dim "$extra")" ;;
      wait) printf '  %s  %s  %s\n' "$(pad "$label" "$w")" "$(c 244 '· waiting')" "$(dim "${extra:0:$((COLS-w-16))}")" ;;
      text) printf '  %s  %s\n' "$(pad "$label" "$w")" "$(dim "${extra:0:$((COLS-w-6))}")" ;;
      live)
        # a percent-kind campaign has no meaningful raw counts to show
        if [[ "$kind" == percent ]]; then counts=""
        else counts="${unit}$(human "$done_n")/${unit}$(human "$total")"; fi
        printf '  %s  %s  %s  %s\n' "$(pad "$label" "$w")" "$(bar "$done_n" "$total" "$bw")" \
          "$(dim "$(pad "$counts" 14)")" "$(dim "$extra")" ;;
    esac
  done < "$cache"
}

# Seconds until the next launch ATTEMPT is permitted (negative = due now).
next_attempt_in(){
  local lastl lastr due
  lastl=$(cat "$S/.last-launch" 2>/dev/null || echo 0)
  lastr=$(cat "$S/.last-refusal" 2>/dev/null || echo 0)
  due=$(( lastl + LAUNCH_GAP ))
  (( lastr + GATE_RETRY_GAP > due )) && due=$(( lastr + GATE_RETRY_GAP ))
  echo $(( due - $(date +%s) ))
}

# --------------------------------------------------------------- launch gate
# Ask the predicates themselves rather than reimplementing their thresholds, so
# the displayed ceilings can never drift from the ones that actually gate
# launches. usage.sh emits KEY=VALUE on stdout specifically so this is an eval,
# not the pile of sed that used to reconstruct the numbers by regexing an English
# sentence. Its only side effect is refreshing the usage cache (self-limited to
# CACHE_MAX_AGE), so calling it for display is safe.
sample_gate(){
  { bash scripts/usage.sh launch 2>/dev/null; echo "GATE_RC=$?"
    CAPOUT=$(bash scripts/capacity.sh 2>&1); echo "CAP_RC=$?"
    printf 'CAP_REASON=%q\n' "$CAPOUT"
  } > "$S/.gate.cache.new" 2>/dev/null && mv -f "$S/.gate.cache.new" "$S/.gate.cache"
}

render_gate(){
  local cache="$S/.gate.cache"
  [[ -s "$cache" ]] || { printf '  %s\n' "$(dim '(gate not sampled yet)')"; return; }
  local USAGE_SESSION= USAGE_WEEK= USAGE_MODEL_KEY= USAGE_MODEL_WEEK=
  local USAGE_BURN_SESSION= USAGE_BURN_WEEK=
  local USAGE_CEIL_SESSION= USAGE_CEIL_WEEK= USAGE_REASON= GATE_RC=0 CAP_RC=0 CAP_REASON=
  # shellcheck disable=SC1090
  source "$cache" 2>/dev/null || true

  if [[ -z "$USAGE_SESSION" || "$USAGE_SESSION" == "-1" ]]; then
    printf '  %s %s\n' "$(c 196 '✖ gate')" "$(dim "${USAGE_REASON:-no usage data}")"; return
  fi
  local se="$USAGE_SESSION" wk="$USAGE_WEEK" mk="$USAGE_MODEL_KEY" mw="$USAGE_MODEL_WEEK"
  local bs="$USAGE_BURN_SESSION" bw="$USAGE_BURN_WEEK"
  local sc="$USAGE_CEIL_SESSION" wc="$USAGE_CEIL_WEEK"
  local rc="$GATE_RC" reason="$USAGE_REASON"
  [[ "$rc" == "0" && "$CAP_RC" != "0" ]] && { rc="$CAP_RC"; reason="$CAP_REASON"; }

  row(){ # row <name> <now> <ceiling> <burn>  — bar shows now+burn against the ceiling
    local nm="$1" now="$2" ceil="$3" burn="$4" proj mark col detail
    if [[ -z "$now" || "$now" == "n/a" ]]; then
      printf '  %s %s  %s\n' "$(pad "$nm" 14)" "$(pad '' 18)" \
        "$(dim 'n/a — no per-model tank; the aggregate weekly cap governs')"
      return
    fi
    proj=$(( now + ${burn:-0} ))
    if (( proj >= ${ceil:-100} )); then mark="BLOCKED"; col=196; else mark="ok"; col=46; fi
    detail=$(printf '%3s%% +%-2s burn -> %3s%% of %3s%% cap' "$now" "${burn:-0}" "$proj" "${ceil:-100}")
    printf '  %s %s  %s  %s\n' "$(pad "$nm" 14)" \
      "$(bar "$proj" "${ceil:-100}" 18)" "$(dim "$detail")" "$(c $col "$mark")"
  }
  row "5h session" "$se" "$sc" "$bs"
  row "weekly all" "$wk" "$wc" "$bw"
  row "weekly[$mk]" "$mw" "$wc" "$bw"

  # The watchdog budget, displayed. It was invisible here for five days, which is
  # precisely why it was able to drift below the gate and kill three runs at their
  # first tick (2026-07-26) with the console still reporting a healthy loop.
  local ks kw
  ks=$(( GATE_SESSION + KILL_MARGIN )); kw=$(( GATE_WEEK + KILL_MARGIN ))
  printf '  %s %s\n' "$(pad 'watchdog' 14)" \
    "$(dim "$(printf 'kills at s=%s%% w=%s%% (gate + margin %s) · live s=%s%% w=%s%%' \
        "$ks" "$kw" "$KILL_MARGIN" "$se" "$wk")")"
  if (( se >= ks || wk >= kw )); then
    printf '  %s\n' "$(c 196 '✖ watchdog would kill a run launched now — launches refuse (see budgets.conf)')"
  fi

  if [[ "${rc:-0}" == "0" ]]; then
    printf '  %s\n' "$(c 46 '● gate OPEN — next idle cycle launches')"
  else
    printf '  %s %s\n' "$(c 208 '■ gate CLOSED:')" "$(dim "${reason:-rc=$rc}")"
  fi
}

# ---------------------------------------------------------------------- frame
frame(){
  local buf; buf=$(
    local now; now=$(date "+%F %H:%M:%S")
    local title="autotao supervision console"
    printf '%s  %s\n' "$(bold "$(c 213 "◆ $title")")" \
      "$(dim "$now · refresh ${REFRESH}s · tick ${TICK_INTERVAL}s")"

    # --- live solve run ---
    local P="" AGE NL LAUNCH_TS
    LAUNCH_TS=$(cat "$S/.last-launch" 2>/dev/null || echo "")
    [[ -f attempts/.run.lock ]] && P=$(cat attempts/.run.lock 2>/dev/null)
    NL=$(ls -t attempts/raw-logs/*.log 2>/dev/null | head -1)
    if [[ -n "$P" ]] && kill -0 "$P" 2>/dev/null; then
      AGE=$(( $(date +%s) - $(stat -c %Y "$NL" 2>/dev/null || echo 0) ))
      local started elapsed=""
      started=$(stat -c %Y "$NL" 2>/dev/null)
      [[ -n "${LAUNCH_TS:-}" ]] && elapsed=" up $(dur $(( $(date +%s) - LAUNCH_TS )))"
      printf '  %-12s %s  pid=%s%s  log=%s  %s\n' "SOLVE RUN" "$(c 46 '● LIVE')" "$P" \
        "$elapsed" "$(basename "${NL:-?}")" "$(dim "last write ${AGE}s ago")"
    else
      local eta_s countdown
      if [[ "$AUTO_LAUNCH" != "1" ]]; then
        countdown="$(c 208 'auto-launch OFF')"
      else
        eta_s=$(next_attempt_in)
        if (( eta_s <= 0 )); then countdown="$(c 46 'next attempt: now')"
        else countdown="$(c 111 "next attempt in $(printf '%d:%02d' $((eta_s/60)) $((eta_s%60)))")"; fi
      fi
      printf '  %-12s %s  %s  %s\n' "SOLVE RUN" "$(c 244 '○ idle')" "$countdown" \
        "$(dim "newest log: $(basename "${NL:-none}")")"
    fi
    echo; hdr CAMPAIGNS "" 39
    render_campaigns
    echo

    # --- resources / usage ---
    local MEM; MEM=$(free -m 2>/dev/null | awk '/^Mem:/{print $7}')
    printf '  %-12s %s\n' "RESOURCES" "$(dim "${MEM:-?}MB RAM avail · load $(cut -d' ' -f1-3 /proc/loadavg 2>/dev/null)")"
    # Papers a run could not fetch. Shown until an operator clears them, because
    # the alternative is what happened on 2026-07-25: a run's fetch failure gets
    # written into a problem file as a fact about the source and nobody notices.
    local nwant
    nwant=$(grep -c '^| arxiv-\|^| [a-zA-Z0-9]' papers/WANTED.md 2>/dev/null || echo 0)
    if (( nwant > 0 )); then
        echo; hdr "PAPERS WANTED" "runs could not fetch these — scripts/fetch-paper.sh <ref> clears a row" 214
      grep '^| ' papers/WANTED.md 2>/dev/null | grep -v '^| key \|^|---' \
        | head -4 | awk -F'|' '{printf "    %s — %s\n", $2, $4}' | cut -c1-$((COLS-4))
    fi

    echo; hdr "LAUNCH GATE" "account-wide quota — your interactive sessions count against these" 39
    render_gate
    echo

    # Pipeline activity only. The gate/quota chatter that dominates tick.log is
    # driven by interactive usage, not by the pipeline, and is rendered above.
    echo; hdr "PIPELINE ACTIVITY" "" 39
    if [[ -s "$S/tick.log" ]] && grep -qE '^\[tick ' "$S/tick.log"; then
      grep -E '^\[tick ' "$S/tick.log" \
        | grep -vE 'gate refused|session=|weekly tank|5-hour session tank' \
        | tail -"${PIPELINE_LINES:-3}" | cut -c1-$((COLS-4)) | sed "s/^/    /"
    else printf '    %s\n' "$(dim '(no pipeline events yet)')"; fi
    # attempts/LOG.md lines are prose-length — median ~1470 chars, max ~13k — so
    # the old one-line `cut` showed the date and nothing that mattered. Parse the
    # eight house fields, badge the verdict, and wrap the outcome to
    # LEDGER_LINES rows with an explicit count of what is left unshown.
    local LL ld lm lp lo verdict vcol wrapped shown total
    LL=$(tail -1 attempts/LOG.md 2>/dev/null)
    if [[ -n "$LL" ]]; then
      fld(){ awk -F'|' -v n="$1" '{gsub(/^ +| +$/,"",$n); print $n}' <<< "$LL"; }
      ld=$(fld 2); lm=$(fld 3); lp=$(fld 4); lo=$(fld 7)
      verdict=${lo%%[ (]*}
      case "$verdict" in
        resolved*|partial|closed-verified|PASSED*) vcol=46 ;;
        fragment)                                  vcol=220 ;;
        failed|invalid)                            vcol=196 ;;
        running|launched)                          vcol=39 ;;
        *)                                         vcol=244 ;;
      esac
      echo; hdr LEDGER "newest attempts/LOG.md entry" 39
      printf '    %s  %s  %s  %s\n' "$(dim "$ld")" "$(c 111 "${lm:0:34}")" \
        "$(c 252 "${lp:0:26}")" "$(c "$vcol" "[$verdict]")"
    fi
    [[ -f "$S/ESCALATE" ]] && printf '\n  %s\n' "$(c 196 '*** ESCALATE FLAG SET — tier-2 fires next tick ***')"
  )
  FRAME_BUF="$buf"

  # The outcome field is the only unbounded thing on screen, so it alone
  # scrolls; every panel above stays pinned.
  local LL lo verdict
  LL=$(tail -1 attempts/LOG.md 2>/dev/null)
  if [[ -n "$LL" ]]; then
    lo=$(awk -F'|' '{gsub(/^ +| +$/,"",$7); print $7}' <<< "$LL")
    verdict=${lo%%[ (]*}
    lo=${lo#"$verdict"}; lo=${lo# }; lo=${lo#(}; lo=${lo%)}
    LEDGER_BODY=$(printf '%s' "$lo" | fold -s -w $((COLS-6)) | sed 's/^/    /')
  else
    LEDGER_BODY=""
  fi
}

# Paint a viewport over FRAME_BUF. The frame outgrew the pane once the ledger
# panel landed, and a taller-than-screen frame makes the terminal scroll — after
# which \033[H no longer homes to the frame's first row and every redraw drifts
# down by one, which is the header-repeating corruption. Clamping to a viewport
# fixes that and makes the content scrollable at the same time.
draw(){
  local budget fixed fixed_n body_n view slice
  # Hard budget: never paint the final row. Writing it moves the cursor past the
  # bottom, which scrolls the pane and takes the title line with it — that is the
  # "first line is cut off" symptom, and at an exact fit it recurs every redraw.
  budget=$(( ROWS - 1 ))

  # Airy by default; drop blank separators only if the airy form will not fit.
  fixed=$(printf '%s\n' "$FRAME_BUF" | cat -s)
  fixed_n=$(printf '%s\n' "$fixed" | wc -l)
  if (( fixed_n + 3 > budget )); then
    fixed=$(printf '%s\n' "$FRAME_BUF" | grep -v '^[[:space:]]*$')
    fixed_n=$(printf '%s\n' "$fixed" | wc -l)
  fi

  # Last resort: pinned panels alone exceed the pane. Trim them and say so,
  # rather than overflowing.
  if (( fixed_n + 2 > budget )); then
    fixed=$(printf '%s\n' "$fixed" | head -n $(( budget - 2 )))
    fixed_n=$(( budget - 2 ))
  fi

  body_n=0; [[ -n "$LEDGER_BODY" ]] && body_n=$(printf '%s\n' "$LEDGER_BODY" | wc -l)
  view=$(( budget - fixed_n - 1 ))          # -1 for the footer
  (( view < 0 )) && view=0
  (( view > body_n )) && view=$body_n

  (( SCROLL > body_n - view )) && SCROLL=$(( body_n - view ))
  (( SCROLL < 0 )) && SCROLL=0
  slice=""
  (( view > 0 )) && slice=$(printf '%s\n' "$LEDGER_BODY" | sed -n "$(( SCROLL + 1 )),$(( SCROLL + view ))p")

  if (( FANCY )); then
    printf '\033[H'
    printf '%s\n' "$fixed" | clamp | sed 's/$/\o033[K/'
    [[ -n "$slice" ]] && printf '%s\n' "$slice" | clamp | sed 's/$/\o033[K/'
    # footer, WITHOUT a trailing newline (see budget note above)
    if (( body_n > view )); then
      printf '\033[K%s' "$(c 240 "── ledger $(( SCROLL + 1 ))-$(( SCROLL + view ))/$body_n ──  ↑↓/jk · PgUp/PgDn · g/G · q quit")"
    else
      printf '\033[K%s' "$(c 240 "── q quit ──")"
    fi
    printf '\033[J'
  else
    printf '%s\n' "$fixed"
    [[ -n "$slice" ]] && printf '%s\n' "$slice"
  fi
}

# ----------------------------------------------------------------------- loop
SCROLL=0
(( FANCY )) && printf '\033[2J\033[?25l'
LAST_TICK=0
HAD_RUN=0
LAST_SAMPLE=0
RENDER_ONLY=0
[[ "${CONSOLE_ONCE:-}" == "1" ]] && RENDER_ONLY=1
while :; do
  RUN_LIVE=0
  [[ -f attempts/.run.lock ]] && kill -0 "$(cat attempts/.run.lock 2>/dev/null)" 2>/dev/null && RUN_LIVE=1
  NOW=$(date +%s)
  if (( RENDER_ONLY == 0 )) && { (( NOW - LAST_TICK >= TICK_INTERVAL )) || { (( HAD_RUN == 1 && RUN_LIVE == 0 )); }; }; then
    bash scripts/supervisor-tick.sh || true
    LAST_TICK=$NOW
  fi
  HAD_RUN=$RUN_LIVE
  if (( RENDER_ONLY == 0 )) && [[ "$AUTO_LAUNCH" == "1" && "$RUN_LIVE" == "0" ]]; then
    LASTL=$(cat "$S/.last-launch" 2>/dev/null || echo 0)
    LASTR=$(cat "$S/.last-refusal" 2>/dev/null || echo 0)
    if (( NOW - LASTL >= LAUNCH_GAP && NOW - LASTR >= GATE_RETRY_GAP )); then
      # One call. launch.sh runs every check synchronously and only detaches once
      # the run is committed, so this exit code is the truth about whether anything
      # started — the console used to launch detached and never saw it, and so
      # recorded refusals as launches (2026-07-26, three phantom launches).
      LRC=0; bash scripts/launch.sh >> "$S/tick.log" 2>&1 || LRC=$?
      if (( LRC == 0 )); then
        date +%s > "$S/.last-launch"; rm -f "$S/.last-refusal"
        echo "[console $(date +%F-%H:%M:%S)] launched next solve iteration" >> "$S/tick.log"
      else
        date +%s > "$S/.last-refusal"
        echo "[console $(date +%F-%H:%M:%S)] launch refused rc=$LRC ($(rc_meaning $LRC)); retry in ${GATE_RETRY_GAP}s" >> "$S/tick.log"
      fi
    fi
  fi
  if (( NOW - LAST_SAMPLE >= SAMPLE_INTERVAL )); then sample_campaigns; sample_gate; LAST_SAMPLE=$NOW; fi
  resize
  frame
  if [[ "${CONSOLE_ONCE:-}" == "1" ]]; then
    printf '%s\n' "$FRAME_BUF"
    [[ -n "$LEDGER_BODY" ]] && printf '%s\n' "$LEDGER_BODY"
    exit 0
  fi
  draw

  # One read serves as both the refresh delay and the input poll. Arrow keys
  # arrive as ESC [ A/B/5~/6~, so on ESC we grab the rest with a short timeout.
  PAGE=$(( ROWS - $(printf '%s\n' "$FRAME_BUF" | grep -vc '^[[:space:]]*$') - 3 )); (( PAGE < 2 )) && PAGE=2
  if read -rsn1 -t "$REFRESH" KEY 2>/dev/null; then
    if [[ "$KEY" == $'\e' ]]; then
      read -rsn2 -t 0.05 REST 2>/dev/null || REST=""
      case "$REST" in
        '[A') KEY=k ;; '[B') KEY=j ;;
        '[5') read -rsn1 -t 0.05 _ 2>/dev/null; KEY=b ;;
        '[6') read -rsn1 -t 0.05 _ 2>/dev/null; KEY=f ;;
        '[H') KEY=g ;; '[F') KEY=G ;;
        *) KEY="" ;;
      esac
    fi
    case "$KEY" in
      j) SCROLL=$(( SCROLL + 1 )) ;;
      k) SCROLL=$(( SCROLL - 1 )) ;;
      f|' ') SCROLL=$(( SCROLL + PAGE )) ;;
      b) SCROLL=$(( SCROLL - PAGE )) ;;
      g) SCROLL=0 ;;
      G) SCROLL=999999 ;;
      q) printf '\033[?25h\n'; exit 0 ;;
    esac
    draw            # repaint immediately so scrolling feels instant
  fi
done
