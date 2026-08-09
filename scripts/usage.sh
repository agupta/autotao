#!/usr/bin/env bash
# Usage-ceiling predicate. ONE question only: are the usage tanks under budget?
#
#   usage.sh launch   — may a new run start?      (gate ceilings, + per-tank burn)
#   usage.sh kill     — must a live run be killed? (kill ceilings, no burn)
#
# Exit: 0 under budget · 1 over a ceiling · 3 meters unknown/stale (never kills).
# Stdout: machine-readable KEY=VALUE lines, safe to `eval`.
# Stderr: one human summary line, for tick.log.
#
# DELIBERATELY NOT HERE: the memory floor and the one-run-at-a-time lock. Those
# are capacity questions (scripts/capacity.sh), they apply only at launch, and
# fusing them into this predicate is what produced both watchdog incidents — the
# mid-run watchdog had to *subtract* checks that did not apply to it, via flags
# (IGNORE_RUN_LOCK), and on 2026-07-23 it forgot to, so should-run.sh's lock check
# reported the run's own lock and the watchdog killed the run it was guarding.
# A predicate the watchdog can call whole cannot fail that way.
#
# Three tanks (see scripts/fetch-limits.sh for the endpoint shape):
#   session            — the 5-hour window, SHARED across models
#   weekly_all         — aggregate weekly across all models
#   weekly_by_model[k] — per-model weekly tank; only SOME models have one
# A missing per-model tank must be SKIPPED, not read as 0%: defaulting it to zero
# made the check pass vacuously for opus, inventing headroom that did not exist.
set -euo pipefail

MODE="${1:-launch}"
DIR="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "$DIR/.." && pwd)"
CACHE="$HOME/.claude/rate_limits_v2.json"

ENGINE="$(bash "$DIR/run-engine.sh")"
if [[ "$ENGINE" == codex ]]; then
  exec bash "$DIR/codex-usage.sh" "$MODE"
fi

# BUDGETS_CONF overrides the path for tests only; production always uses the repo copy.
# shellcheck source=budgets.conf
source "${BUDGETS_CONF:-$DIR/budgets.conf}"

if [[ "${AUTOTAO_FINISH_AT:-}" =~ ^[0-9]+$ ]]; then
  ACTIVE_KILL_SESSION=$(( AUTOTAO_FINISH_AT + KILL_MARGIN ))
  ACTIVE_KILL_WEEK=$(( AUTOTAO_FINISH_AT + KILL_MARGIN ))
  (( ACTIVE_KILL_SESSION > 100 )) && ACTIVE_KILL_SESSION=100
  (( ACTIVE_KILL_WEEK > 100 )) && ACTIVE_KILL_WEEK=100
else
  ACTIVE_KILL_SESSION="${RUN_SESSION_CAP:-$(( GATE_SESSION + KILL_MARGIN ))}"
  ACTIVE_KILL_WEEK="${RUN_WEEKLY_CAP:-$(( GATE_WEEK + KILL_MARGIN ))}"
fi
ACTIVE_GATE_SESSION=$(( ACTIVE_KILL_SESSION - KILL_MARGIN ))
ACTIVE_GATE_WEEK=$(( ACTIVE_KILL_WEEK - KILL_MARGIN ))

case "$MODE" in
  launch) CEIL_SESSION=$ACTIVE_GATE_SESSION; CEIL_WEEK=$ACTIVE_GATE_WEEK
          BURN_S=$BURN_SESSION; BURN_W=$BURN_WEEK ;;
  kill)   CEIL_SESSION=$ACTIVE_KILL_SESSION
          CEIL_WEEK=$ACTIVE_KILL_WEEK
          BURN_S=0; BURN_W=0 ;;
  *)      echo "usage.sh: unknown mode '$MODE' (want launch|kill)" >&2; exit 2 ;;
esac

read -r RUN_MODEL_RESOLVED MODEL_KEY < <(bash "$DIR/run-model.sh")

# Self-refresh if the cache is missing or older than CACHE_MAX_AGE (default 10 min).
# The watchdog passes CACHE_MAX_AGE=55 to force a fresh read every tick.
NOW=$(date +%s)
CTS=$(jq -r '.ts // 0' "$CACHE" 2>/dev/null || echo 0)
if [[ ! -f "$CACHE" || $(( NOW - ${CTS%.*} )) -gt "${CACHE_MAX_AGE:-600}" ]]; then
  bash "$REPO/scripts/fetch-limits.sh" >/dev/null 2>&1 || true
fi

emit(){ # emit <rc> <reason>
  cat <<EOF
USAGE_MODE=$MODE
USAGE_ENGINE=claude
USAGE_SESSION=${SESSION:--1}
USAGE_WEEK=${WEEK:--1}
USAGE_MODEL_KEY=$MODEL_KEY
USAGE_MODEL_WEEK=${MODELW:-n/a}
USAGE_BURN_SESSION=$BURN_S
USAGE_BURN_WEEK=$BURN_W
USAGE_CEIL_SESSION=$CEIL_SESSION
USAGE_CEIL_WEEK=$CEIL_WEEK
USAGE_HARD_CAP_SESSION=$ACTIVE_KILL_SESSION
USAGE_HARD_CAP_WEEK=$ACTIVE_KILL_WEEK
USAGE_SESSION_RESET_AT=${SESSION_RESET:-0}
USAGE_WEEK_RESET_AT=${WEEK_RESET:-0}
USAGE_SEV=${SEV:-unknown}
USAGE_AGE=${AGE:--1}
USAGE_RC=$1
USAGE_REASON="$2"
EOF
}

fail(){ # fail <rc> <reason>
  emit "$1" "$2"
  printf '%s: %s\n' "$MODE" "$2" >&2
  exit "$1"
}

[[ -f "$CACHE" ]] || fail 3 "no usage cache and endpoint refresh failed"

read -r SESSION WEEK MODELW SEV TS SESSION_RESET WEEK_RESET < <(
  jq -r --arg m "$MODEL_KEY" \
    '[(.session // -1), (.weekly_all // -1),
      (if (.weekly_by_model // {} | has($m)) then (.weekly_by_model[$m] | tostring) else "n/a" end),
      (.severity // "normal"), (.ts // 0),
      (.session_resets_at // 0), (.weekly_resets_at // 0)] | @tsv' "$CACHE"
)
AGE=$(( NOW - ${TS%.*} ))
SESSION=${SESSION%.*}; WEEK=${WEEK%.*}
[[ "$MODELW" == "n/a" ]] || MODELW=${MODELW%.*}

[[ "$SESSION" -ge 0 && "$WEEK" -ge 0 ]] || fail 3 "cache has no usage data (session=$SESSION weekly=$WEEK)"
[[ "$AGE" -le 3600 ]] || fail 3 "cache older than 1h — treating as unknown"

[[ "$MODELW" == "n/a" ]] && MW_DISP="n/a" || MW_DISP="${MODELW}%"
printf 'session=%s%% weekly_all=%s%% weekly[%s]=%s (+burn s=%s w=%s vs %s ceilings s=%s w=%s) sev=%s age=%ss\n' \
  "$SESSION" "$WEEK" "$MODEL_KEY" "$MW_DISP" "$BURN_S" "$BURN_W" "$MODE" \
  "$CEIL_SESSION" "$CEIL_WEEK" "$SEV" "$AGE" >&2

(( SESSION + BURN_S < CEIL_SESSION )) || fail 1 "5-hour session tank + burn at/over $MODE ceiling ($SESSION+$BURN_S >= $CEIL_SESSION)"
(( WEEK    + BURN_W < CEIL_WEEK ))    || fail 1 "aggregate weekly tank + burn at/over $MODE ceiling ($WEEK+$BURN_W >= $CEIL_WEEK)"
if [[ "$MODELW" != "n/a" ]]; then
  (( MODELW + BURN_W < CEIL_WEEK )) || fail 1 "weekly tank for model '$MODEL_KEY' + burn at/over $MODE ceiling (try a different run_model)"
fi

emit 0 ""
exit 0
