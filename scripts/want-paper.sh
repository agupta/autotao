#!/usr/bin/env bash
# Register a paper a run needs but cannot obtain. RUN-CALLABLE.
#
# This is the escape hatch a run must use instead of concluding anything about
# the source. A bench-* run has no network at all by design; a live run may hit
# a paywall, a login wall, or a 404. In every one of those cases the correct
# action is the same: say what you needed and why, and move on with the gap
# stated. Do NOT write "the API is dead" into a problem file — that is a claim
# about the world made from inside a sandbox, and it cost this repo two days.
#
#   scripts/want-paper.sh arXiv:2410.22842 "P13 ladder method — need the search bound"
#
# The supervision console shows every open row in papers/WANTED.md until an
# operator clears it with scripts/fetch-paper.sh.
set -uo pipefail
cd "$(dirname "$0")/.." || exit 1
P=papers; mkdir -p "$P"; WANTED="$P/WANTED.md"

REF="${1:-}"; NOTE="${2:-}"
[[ -n "$REF" ]] || { echo "usage: $0 <ref> \"why you need it\"" >&2; exit 2; }

if [[ "$REF" =~ ([0-9]{4}\.[0-9]{4,5}) ]]; then KEY="arxiv-${BASH_REMATCH[1]}"
else KEY=$(printf '%s' "$REF" | tr -c 'A-Za-z0-9._-' '-' | cut -c1-60); fi

# already cached? then this is not a want.
if [[ -s "$P/$KEY.pdf" || -s "$P/$KEY.txt" ]]; then
  echo "already cached — read papers/$KEY.txt (or .pdf); no need to flag"; exit 0
fi

[[ -s "$WANTED" ]] || cat > "$WANTED" <<'HDR'
# WANTED — papers a run needed and could not fetch

The supervision console surfaces every open row here. Clear a row by running
`scripts/fetch-paper.sh <ref>` successfully, then deleting the line.

**Never record a fetch failure as a fact about the source.** A run that cannot
reach the network is describing its own sandbox, not the internet.

| key | ref | reason wanted | failure | first flagged |
|---|---|---|---|---|
HDR

if grep -qF "| $KEY |" "$WANTED" 2>/dev/null; then
  echo "already flagged: $KEY (see $WANTED)"; exit 0
fi
printf '| %s | %s | %s | %s | %s |\n' \
  "$KEY" "$REF" "${NOTE:-(unstated)}" "requested by run" "$(date -u +%F)" >> "$WANTED"
echo "flagged $KEY in $WANTED — an operator will fetch it; state the gap in your RESULT.md and continue."
