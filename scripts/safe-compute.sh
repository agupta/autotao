#!/usr/bin/env bash
# Run one resource-heavy experiment without allowing its failure to take down the
# research agent. Linux uses a user systemd scope when available; other environments
# fall back to a per-process virtual-memory limit.
set -uo pipefail

cd "$(dirname "$0")/.." || exit 1
source scripts/portable.sh
at_require_bash || exit 1
at_require_timeout || exit 1

usage(){
  cat >&2 <<'EOF'
usage: scripts/safe-compute.sh [options] -- command [args...]

  --memory-mb N   aggregate RAM limit (default: one third of RAM, 768..2048 MB)
  --swap-mb N     additional swap limit for a systemd scope (default: 512 MB)
  --timeout D     timeout duration (default: 20m; examples: 90s, 1h)
  --log PATH      write combined stdout/stderr to PATH as well as the terminal
  --label NAME    short diagnostic label
EOF
}

if [[ "$AT_OS" == "Darwin" ]]; then
  TOTAL_MB=$(sysctl -n hw.memsize 2>/dev/null | awk '{print int($1/1048576)}')
else
  TOTAL_MB=$(awk '/^MemTotal:/{print int($2/1024)}' /proc/meminfo 2>/dev/null)
fi
TOTAL_MB=${TOTAL_MB:-4096}
DEFAULT_MEMORY_MB=$(( TOTAL_MB / 3 ))
(( DEFAULT_MEMORY_MB < 768 )) && DEFAULT_MEMORY_MB=768
(( DEFAULT_MEMORY_MB > 2048 )) && DEFAULT_MEMORY_MB=2048

MEMORY_MB="${SAFE_COMPUTE_MEMORY_MB:-$DEFAULT_MEMORY_MB}"
SWAP_MB="${SAFE_COMPUTE_SWAP_MB:-512}"
TIME_LIMIT="${SAFE_COMPUTE_TIMEOUT:-20m}"
LOG_PATH=
LABEL=compute

while (( $# )); do
  case "$1" in
    --memory-mb) MEMORY_MB="${2:-}"; shift 2 ;;
    --swap-mb) SWAP_MB="${2:-}"; shift 2 ;;
    --timeout) TIME_LIMIT="${2:-}"; shift 2 ;;
    --log) LOG_PATH="${2:-}"; shift 2 ;;
    --label) LABEL="${2:-}"; shift 2 ;;
    --) shift; break ;;
    -h|--help) usage; exit 0 ;;
    *) echo "safe-compute: unknown option: $1" >&2; usage; exit 2 ;;
  esac
done

[[ "$MEMORY_MB" =~ ^[1-9][0-9]*$ ]] || { echo "safe-compute: --memory-mb must be a positive integer" >&2; exit 2; }
[[ "$SWAP_MB" =~ ^[0-9]+$ ]] || { echo "safe-compute: --swap-mb must be a non-negative integer" >&2; exit 2; }
[[ "$TIME_LIMIT" =~ ^[1-9][0-9]*(\.[0-9]+)?(s|m|h|d)$ ]] || { echo "safe-compute: --timeout must look like 90s, 20m, or 1h" >&2; exit 2; }
(( $# > 0 )) || { echo "safe-compute: missing command after --" >&2; usage; exit 2; }

[[ -z "$LOG_PATH" ]] || mkdir -p "$(dirname "$LOG_PATH")"
SAFE_LABEL=$(printf '%s' "$LABEL" | tr -c 'A-Za-z0-9_-' '-')
RUN_PART=$(printf '%s' "${AUTOTAO_RUN_ID:-manual}" | tr -c 'A-Za-z0-9_-' '-')
UNIT="autotao-compute-${RUN_PART}-${SAFE_LABEL}-$$"
COMMAND=("${AT_TIMEOUT[@]}" --signal=TERM --kill-after=10s "$TIME_LIMIT" "$@")

run_scoped(){
  if [[ "$AT_OS" == "Linux" ]] && command -v systemd-run >/dev/null 2>&1 \
     && systemctl --user show-environment >/dev/null 2>&1; then
    systemd-run --user --scope --quiet --collect --unit "$UNIT" \
      -p "MemoryMax=${MEMORY_MB}M" -p "MemorySwapMax=${SWAP_MB}M" "${COMMAND[@]}"
  else
    echo "safe-compute: aggregate memory scopes unavailable; using per-process ulimit" >&2
    (
      ulimit -Sv $(( MEMORY_MB * 1024 ))
      exec "${COMMAND[@]}"
    )
  fi
}

echo "safe-compute: label=$LABEL memory=${MEMORY_MB}MB swap=${SWAP_MB}MB timeout=$TIME_LIMIT" >&2
set +e
if [[ -n "$LOG_PATH" ]]; then
  run_scoped > >(tee "$LOG_PATH") 2>&1
  RC=$?
else
  run_scoped
  RC=$?
fi
set -e

case "$RC" in
  0) echo "safe-compute: PASS label=$LABEL" >&2 ;;
  124) echo "safe-compute: RECOVERABLE timeout label=$LABEL; keep checkpoints and retry a smaller shard" >&2 ;;
  134|137) echo "safe-compute: RECOVERABLE memory/resource kill label=$LABEL; keep checkpoints and reduce or stream the job" >&2 ;;
  *) echo "safe-compute: FAIL label=$LABEL rc=$RC; inspect the log before retrying" >&2 ;;
esac
exit "$RC"
