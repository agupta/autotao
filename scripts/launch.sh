#!/usr/bin/env bash
# The ONE way to start a solve iteration. Checks synchronously, then detaches.
#
# Callers (supervise-console.sh, supervisor-tick.sh, harness/supervisor.md) each
# used to reassemble this sequence themselves, and they disagreed: the console
# ran the gate then launched detached and never saw the launcher's exit code, so
# when run-once.sh began refusing (exit 3) the console recorded every refusal as
# a successful launch, reset its launch timer, and logged "gate open — launching"
# while nothing ran. Three phantom launches on 2026-07-26, an hour of dead loop.
#
# The fix is structural: everything that must be known BEFORE spending runs here,
# synchronously, and the caller gets a real exit code. Only the run itself is
# detached, and by then it is committed.
#
# Exit: 0 launched (pid on stdout) · 1 usage · 2 memory · 3 meters unknown or the
# watchdog would kill it immediately · 4 a run is already in flight.
set -euo pipefail
cd "$(dirname "$0")/.."
source scripts/portable.sh
at_require_bash || exit 1
ENGINE="$(bash scripts/run-engine.sh "${1:-}")"
export RUN_ENGINE="$ENGINE"
S=attempts/supervision; mkdir -p "$S"
STAMP=$(date +%Y%m%d-%H%M%S)
LOG="$S/launch-$STAMP-$ENGINE.log"

# 1. Launch gate: usage ceilings + box capacity.
bash scripts/should-run.sh >>"$LOG" 2>&1 || exit $?

# 2. Would the watchdog kill this run at its first 60s tick? Asking the watchdog's
#    own question (`usage.sh kill`) before spending anything. With the kill
#    ceilings now DERIVED from the gate ceilings (budgets.conf) this can no longer
#    fire on a run the gate just admitted — it remains as the assertion of that.
if ! bash scripts/usage.sh kill >>"$LOG" 2>&1; then
  { echo "refusing to launch: the usage watchdog would kill this run at its first tick"
    echo "  this means budgets.conf's derived kill ceilings are below its gate ceilings —"
    echo "  run scripts/selftest-budgets.sh, that invariant is supposed to be unrepresentable."
  } | tee -a "$LOG" >&2
  exit 3
fi

# 3. Reap compute orphaned by previous runs. capacity.sh has proved no run is in flight,
#    and the reaper only matches descendants stamped with AUTOTAO_RUN_ID, so manual work
#    is invisible. Without this call the dry-run reaper existed but nothing in the launch
#    path ever used it, allowing detached searches to starve later iterations.
if [[ -z "${LAUNCH_NO_REAP:-}" ]]; then
  bash scripts/reap-orphans.sh --kill >>"$LOG" 2>&1 || true
fi

# 4. Committed. Detach the run itself.
"${AT_SETSID[@]}" bash scripts/run-once.sh "$ENGINE" >>"$LOG" 2>&1 </dev/null &
echo "launched $ENGINE pid $! (log $LOG)" | tee -a "$LOG"
exit 0
