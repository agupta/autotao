#!/usr/bin/env bash
# Launch gate = usage ceilings + box capacity. Exit 0 iff a new run may start.
#
# This is now a two-line composition of two single-purpose predicates:
#   scripts/usage.sh launch   — are the usage tanks under the gate ceilings?
#   scripts/capacity.sh       — is the box free (memory floor, no run in flight)?
#
# It used to BE both, plus the mid-run watchdog's ceiling check, selected by
# positional budget args and subtractive flags (IGNORE_RUN_LOCK, burn=0). Every
# caller passed a different set, the numbers lived at the call sites, and both
# 2026-07 watchdog incidents came out of that. Budgets now live in
# scripts/budgets.conf; the watchdog calls `usage.sh kill` directly.
#
# Exit codes are passed through from the predicates: 1 usage · 2 memory ·
# 3 meters unknown · 4 run already in flight.
#
# Legacy positional budget args (session, weekly, burn) are REJECTED rather than
# ignored: silently dropping them would re-open the drift this refactor closes.
set -euo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"

if [[ $# -gt 0 ]]; then
  echo "should-run.sh takes no arguments (got: $*)." >&2
  echo "Budgets moved to scripts/budgets.conf — edit them there, not at call sites." >&2
  exit 2
fi

bash "$DIR/usage.sh" launch >/dev/null || exit $?
bash "$DIR/capacity.sh"     || exit $?
