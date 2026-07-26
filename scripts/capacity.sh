#!/usr/bin/env bash
# Capacity predicate: is this BOX free to take a new headless run right now?
# Two rules, both launch-time only — a live run must never be judged by these.
#
# Exit: 0 free · 2 below the memory floor · 4 a run already holds the lock.
# Distinct codes so callers branch on a number instead of grepping English; the
# console previously recovered the reason by regexing prose out of the output.
set -euo pipefail

REPO="$(cd "$(dirname "$0")/.." && pwd)"

# OOM guard (this box is 3.7GB; on 2026-07-23 the OOM killer took the supervisor
# and its in-flight run when a run, its forked subagents, and a heavy check.py
# --full all ran at once). Floor lowered 1500->400 per user 2026-07-23: the box
# has a page file, so this only needs to prevent hard OOM, not swap avoidance —
# the load-bearing knob against slowing the box is subagent concurrency (capped
# at 3 in run-once.sh), not this floor.
MEM_FLOOR_MB="${MEM_FLOOR_MB:-400}"
AVAIL_MB=$(free -m | awk '/^Mem:/{print $7}')
if [[ "${AVAIL_MB:-0}" -lt "$MEM_FLOOR_MB" ]]; then
  echo "available memory ${AVAIL_MB}MB < floor ${MEM_FLOOR_MB}MB — not launching (OOM guard)"
  exit 2
fi

# One-run-at-a-time via a PID lockfile that only run-once.sh writes (pgrep on
# "claude -p" false-positives on any process whose command line contains it).
LOCK="$REPO/attempts/.run.lock"
if [[ -f "$LOCK" ]]; then
  LPID=$(cat "$LOCK" 2>/dev/null || echo "")
  if [[ -n "$LPID" ]] && kill -0 "$LPID" 2>/dev/null; then
    echo "a headless run is already alive (pid $LPID) — one heavy job at a time (OOM guard)"
    exit 4
  fi
fi

echo "  preflight ok: ${AVAIL_MB}MB free, no run in flight"
exit 0
