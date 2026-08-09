#!/usr/bin/env bash
# Codex weekly-usage predicate, backed by the local Codex app-server.
#
# Codex currently exposes a weekly window but no 5-hour window. Keep the launch
# semantics parallel to Claude's weekly gate:
#   launch — used + expected weekly burn must be below the derived Codex gate
#   kill   — live usage must be below the Codex hard cap
#
# Exit: 0 under budget · 1 over the ceiling · 3 meter unavailable.
# Stdout is source-safe KEY=VALUE data consumed by the console.
set -euo pipefail

MODE="${1:-launch}"
DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=budgets.conf
source "${BUDGETS_CONF:-$DIR/budgets.conf}"

if [[ "${AUTOTAO_FINISH_AT:-}" =~ ^[0-9]+$ ]]; then
  CODEX_KILL_WEEK=$(( AUTOTAO_FINISH_AT + KILL_MARGIN ))
  (( CODEX_KILL_WEEK > 100 )) && CODEX_KILL_WEEK=100
else
  CODEX_KILL_WEEK="${RUN_WEEKLY_CAP:-${CODEX_KILL_WEEK:-$(( GATE_WEEK + KILL_MARGIN ))}}"
fi
CODEX_GATE_WEEK=$(( CODEX_KILL_WEEK - KILL_MARGIN ))
CODEX_UNCAPPED=0

case "$MODE" in
  launch) CEIL_WEEK=$CODEX_GATE_WEEK; BURN_W=$BURN_WEEK ;;
  kill)   CEIL_WEEK=$CODEX_KILL_WEEK; BURN_W=0 ;;
  *) echo "codex-usage.sh: unknown mode '$MODE' (want launch|kill)" >&2; exit 2 ;;
esac

WEEK=-1
WINDOW=0
RESET=0
RATE_PID=

emit(){
  local rc="$1" reason="$2"
  cat <<EOF
USAGE_ENGINE=codex
USAGE_MODE=$MODE
USAGE_SESSION=n/a
USAGE_WEEK=$WEEK
USAGE_MODEL_KEY=codex
USAGE_MODEL_WEEK=n/a
USAGE_BURN_SESSION=0
USAGE_BURN_WEEK=$BURN_W
USAGE_CEIL_SESSION=n/a
USAGE_CEIL_WEEK=$CEIL_WEEK
USAGE_HARD_CAP_WEEK=$CODEX_KILL_WEEK
USAGE_SEV=normal
USAGE_AGE=0
USAGE_WINDOW_MIN=$WINDOW
USAGE_RESET_AT=$RESET
USAGE_UNCAPPED=$CODEX_UNCAPPED
USAGE_RC=$rc
EOF
  printf 'USAGE_REASON=%q\n' "$reason"
}

fail(){
  emit "$1" "$2"
  printf '%s: %s\n' "$MODE" "$2" >&2
  exit "$1"
}

cleanup(){
  if [[ -n "${RATE_PID:-}" ]]; then
    kill "$RATE_PID" 2>/dev/null || true
    wait "$RATE_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT

# The app-server speaks JSONL over stdio. Initialize it, then ask for a fresh
# account snapshot. This is read-only and does not start a model turn.
coproc RATE_SERVER { codex app-server --listen stdio:// 2>/dev/null; }
RATE_PID=$RATE_SERVER_PID
RATE_RFD=${RATE_SERVER[0]}
RATE_WFD=${RATE_SERVER[1]}

printf '%s\n' \
  '{"id":1,"method":"initialize","params":{"clientInfo":{"name":"autotao-supervisor","version":"1"}}}' \
  >&"$RATE_WFD" || fail 3 "could not initialize the Codex usage meter"

INIT_OK=0
for _ in 1 2 3 4 5; do
  if IFS= read -r -t 1 LINE 2>/dev/null <&"$RATE_RFD"; then
    if jq -e '.id == 1 and .result' >/dev/null 2>&1 <<<"$LINE"; then
      INIT_OK=1
      break
    fi
  fi
done
(( INIT_OK == 1 )) || fail 3 "Codex usage meter did not initialize"

printf '%s\n' \
  '{"method":"initialized"}' \
  '{"id":2,"method":"account/rateLimits/read","params":null}' \
  >&"$RATE_WFD" || fail 3 "could not query the Codex usage meter"

REPLY=
for _ in 1 2 3 4 5; do
  if IFS= read -r -t 1 LINE 2>/dev/null <&"$RATE_RFD"; then
    if jq -e '.id == 2' >/dev/null 2>&1 <<<"$LINE"; then
      REPLY=$LINE
      break
    fi
  fi
done
[[ -n "$REPLY" ]] || fail 3 "Codex usage meter did not return a snapshot"

# Prefer the named Codex bucket from the multi-bucket response. Select the
# longest window at least one week long, regardless of whether a future CLI
# calls it primary or secondary.
read -r WEEK RESET WINDOW < <(
  jq -r --arg id "${CODEX_LIMIT_ID:-codex}" '
    (.result.rateLimitsByLimitId[$id] // .result.rateLimits) as $limit
    | [$limit.primary, $limit.secondary]
    | map(select(. != null and (.windowDurationMins // 0) >= 10000))
    | sort_by(.windowDurationMins)
    | last
    | if . == null then empty
      else [.usedPercent, (.resetsAt // 0), (.windowDurationMins // 0)] | @tsv
      end
  ' <<<"$REPLY"
)

[[ "${WEEK:-}" =~ ^[0-9]+$ ]] || fail 3 "Codex returned no weekly usage window"

# A rollover policy is keyed to the meter's reset timestamp, not wall-clock
# time. That avoids switching early if the service rolls the window a little
# late. It also lets a running console inherit a temporary policy immediately,
# even when that console exported an older RUN_WEEKLY_CAP at startup.
if [[ "${CODEX_UNCAPPED_THROUGH_RESET_AT:-}" =~ ^[0-9]+$ &&
      "${CODEX_POST_RESET_KILL_WEEK:-}" =~ ^[0-9]+$ ]]; then
  # The app-server has been observed returning the same reset instant with a
  # one-second rounding wobble across consecutive reads. A real weekly rollover
  # moves RESET by about 604800 seconds, so one hour is a conservative identity
  # tolerance with an enormous gap to the next window.
  if (( RESET <= CODEX_UNCAPPED_THROUGH_RESET_AT + 3600 )); then
    CODEX_UNCAPPED=1
    CEIL_WEEK=100
  else
    CODEX_KILL_WEEK=$CODEX_POST_RESET_KILL_WEEK
    CODEX_GATE_WEEK=$(( CODEX_KILL_WEEK - KILL_MARGIN ))
    case "$MODE" in
      launch) CEIL_WEEK=$CODEX_GATE_WEEK ;;
      kill)   CEIL_WEEK=$CODEX_KILL_WEEK ;;
    esac
  fi
fi

printf 'weekly[codex]=%s%% (+burn %s vs %s ceiling %s) reset=%s\n' \
  "$WEEK" "$BURN_W" "$MODE" "$CEIL_WEEK" "$RESET" >&2

if (( CODEX_UNCAPPED )); then
  # At 100% the provider is exhausted; refusing another launch prevents a
  # guaranteed quota-error attempt while still imposing no earlier ceiling.
  (( WEEK < 100 )) || fail 1 "Codex weekly tank exhausted at 100%"
  emit 0 ""
  exit 0
fi

(( WEEK + BURN_W < CEIL_WEEK )) ||
  fail 1 "Codex weekly tank + burn at/over $MODE ceiling ($WEEK+$BURN_W >= $CEIL_WEEK)"

emit 0 ""
exit 0
