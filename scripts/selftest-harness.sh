#!/usr/bin/env bash
# Guard the pieces that make AutoTao a complete research harness rather than only a TUI.
# These assertions are intentionally semantic and small: prompt wording may evolve, but
# replacement-critical contracts must not disappear in a future extraction.
set -euo pipefail
cd "$(dirname "$0")/.."

fails=0
check(){
  local label="$1" pattern="$2" file="$3"
  if grep -Fq -- "$pattern" "$file"; then
    printf '  ok    %s\n' "$label"
  else
    printf '  FAIL  %s (%s)\n' "$label" "$file"
    fails=$((fails + 1))
  fi
}

check "durable attempt counter" "attempt_counter" LOOP_STATE.md
check "three-tier attempt schedule" "P, P, B, P, F, B, P, B, P, F" harness/loop.md
check "per-attempt credit check" "Credit/preemption collision check: never skip this" harness/loop.md
check "proof-first selection mode" "research_mode: proof-first" LOOP_STATE.md
check "adaptive agent registry" "run in adaptive rounds" harness/portfolio.md
check "bounded heavy computation" "scripts/safe-compute.sh" harness/portfolio.md
check "credit ledger in problem contract" "Credit / preemption ledger" problems/TEMPLATE.md
check "append-only denominator" "Lines are never deleted or edited" attempts/LOG.md
check "independent verification" "Independence rule" verify/README.md
check "current Codex noninteractive approval flag" "--approve-for-me" scripts/run-once.sh
check "Codex session resume path" "CODEX_ARGS+=(resume --json" scripts/run-once.sh
check "pre-launch orphan cleanup" "reap-orphans.sh --kill" scripts/launch.sh

(( fails == 0 )) || { echo "$fails harness contract(s) missing"; exit 1; }
echo "all replacement-critical harness contracts are present"
