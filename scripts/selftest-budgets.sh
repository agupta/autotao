#!/usr/bin/env bash
# Assert the budget invariants. Run by supervise-console.sh at startup, so a bad
# edit to budgets.conf fails in 1s instead of 60s into a run that was already paid
# for. Exit 0 all good · 1 an invariant is violated.
#
# These are exactly the properties whose violation caused the 2026-07-26 incident.
# They hold by construction now (the kill pair is derived, not stated), which is
# the point — this test is here to catch someone re-introducing a stated kill
# ceiling, not to police arithmetic that can currently go wrong.
set -euo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"
source "${BUDGETS_CONF:-$DIR/budgets.conf}"

KILL_SESSION=$(( GATE_SESSION + KILL_MARGIN ))
KILL_WEEK=$((    GATE_WEEK    + KILL_MARGIN ))
fails=0
ok(){ printf '  ok    %s\n' "$1"; }
bad(){ printf '  FAIL  %s\n' "$1"; fails=$((fails+1)); }

check(){ # check <description> <test-expression...>
  if eval "${*:2}"; then ok "$1"; else bad "$1"; fi
}

echo "budgets: gate s=$GATE_SESSION w=$GATE_WEEK burn s=$BURN_SESSION w=$BURN_WEEK margin=$KILL_MARGIN"
echo "         kill s=$KILL_SESSION w=$KILL_WEEK (derived)"

# Never kill a run the gate admitted. The gate promises `used + burn < ceiling`,
# so an admitted run is expected to finish as high as the gate ceiling.
check "kill_session >= gate_session" "(( KILL_SESSION >= GATE_SESSION ))"
check "kill_week    >= gate_week"    "(( KILL_WEEK    >= GATE_WEEK ))"

# No birth-dead launch window: every meter value the gate accepts must be one the
# watchdog tolerates. This is the 2026-07-26 failure stated directly.
check "kill_session > gate_session - burn_session" "(( KILL_SESSION > GATE_SESSION - BURN_SESSION ))"
check "kill_week    > gate_week    - burn_week"    "(( KILL_WEEK    > GATE_WEEK    - BURN_WEEK ))"

# A ceiling at or above the hard cap can never fire.
check "kill_session < 100" "(( KILL_SESSION < 100 ))"
check "kill_week    < 100" "(( KILL_WEEK    < 100 ))"

# A gate that cannot admit anything strands the loop silently.
check "gate_session > burn_session" "(( GATE_SESSION > BURN_SESSION ))"
check "gate_week    > burn_week"    "(( GATE_WEEK    > BURN_WEEK ))"

(( fails == 0 )) || { echo "$fails invariant(s) violated — fix scripts/budgets.conf"; exit 1; }
echo "all budget invariants hold"
