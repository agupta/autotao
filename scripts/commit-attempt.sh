#!/usr/bin/env bash
# Commit a loop iteration's work — and ONLY a loop iteration's work.
# Usage: scripts/commit-attempt.sh "loop iter N: <one-line outcome>"
#        scripts/commit-attempt.sh -F <file>
#
# harness/loop.md step 5 used to say `git add -A && git commit`. On 2026-07-26 a
# run reached that line while an operator session had a supervision refactor in
# the working tree, and swept 13 unrelated files into a commit whose message was
# about an unrelated problem. It had to be split back apart by hand. The same mechanism
# is how root-level scratch output (no8_g3.out, onethird.txt, scan_g6_n24.out,
# deltarec.txt) ended up tracked: nobody chose to commit those either.
#
# So the loop does not get to say "everything". It gets an allowlist of the paths
# a research iteration is supposed to produce. Anything else in the tree is
# REPORTED and left alone — the run should mention it in RESULT.md rather than
# quietly commit it or quietly discard it.
#
# Deliberately a script, not a prompt rule: run-once.sh's own notes observe that
# hard-blocking beats a rule the model can route around, and this one had a rule.
#
# Supervisor/tier-2 runs are NOT covered by this — fixing pipeline code means
# committing scripts/ and harness/, which is legitimate for them. They keep using
# git directly (see harness/supervisor.md).
set -euo pipefail
cd "$(dirname "$0")/.."

# What a research iteration is allowed to author. Empirically these are the only
# paths 40+ `loop iter` commits have touched for a legitimate reason.
ALLOW=(attempts problems papers LOOP_STATE.md)

case "${1:-}" in
  "")  echo "usage: $0 \"loop iter N: <outcome>\"   |   $0 -F <message-file>" >&2; exit 2 ;;
  -F)  [[ -r "${2:-}" ]] || { echo "cannot read message file '${2:-}'" >&2; exit 2; }
       MSG_ARGS=(-F "$2") ;;
  *)   MSG_ARGS=(-m "$1") ;;
esac

# Stage only the allowlist (picks up new files under those paths).
git add -- "${ALLOW[@]}" 2>/dev/null || true

# Everything else that is dirty or untracked: report, never commit. `git status`
# with a negative pathspec gives modified + untracked in one pass.
EXCLUDES=(); for p in "${ALLOW[@]}"; do EXCLUDES+=(":(exclude)$p"); done
OUTSIDE=$(git status --porcelain -- . "${EXCLUDES[@]}" | sed 's/^/    /')

if [[ -n "$OUTSIDE" ]]; then
  echo "NOT COMMITTING these — outside a loop iteration's allowlist (${ALLOW[*]}):" >&2
  printf '%s\n' "$OUTSIDE" >&2
  echo "  If your iteration genuinely needed to change one of these, say so in" >&2
  echo "  RESULT.md and leave it for the operator. If it is scratch output, it" >&2
  echo "  belongs in the attempt's artifact dir, not the repo root." >&2
fi

if git diff --cached --quiet -- "${ALLOW[@]}"; then
  echo "nothing to commit inside ${ALLOW[*]} — not creating an empty commit" >&2
  exit 1
fi

# Pathspec-limited commit: whatever else happens to be staged (an operator
# session mid-`git add`, say) is left untouched in the index rather than
# absorbed. This is the specific failure being prevented.
git commit "${MSG_ARGS[@]}" -- "${ALLOW[@]}"
