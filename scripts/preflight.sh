#!/usr/bin/env bash
# Check that this box can actually run the harness, and say exactly how to fix
# it if not. Run this before the first launch — every check here corresponds to
# something that would otherwise fail partway through a run, which on a consumer
# budget costs a real fraction of the day's allowance.
#
#   bash scripts/preflight.sh
#
# Exit: 0 ready · 1 something required is missing.
set -uo pipefail
cd "$(dirname "$0")/.." || exit 1
source scripts/portable.sh

FAIL=0
ok(){   printf '  ok    %s\n' "$*"; }
bad(){  printf '  MISS  %s\n' "$*"; FAIL=1; }
warn(){ printf '  warn  %s\n' "$*"; }
hint(){ printf '        → %s\n' "$*"; }

printf 'autotao preflight (%s %s)\n\n' "$AT_OS" "$(uname -m)"

# --- interpreter ---
if (( BASH_VERSINFO[0] > 4 || (BASH_VERSINFO[0] == 4 && BASH_VERSINFO[1] >= 4) )); then
  ok "bash ${BASH_VERSION%%(*}"
else
  bad "bash ${BASH_VERSION%%(*} — need 4.4 or newer"
  [[ "$AT_OS" == "Darwin" ]] && hint "brew install bash   (macOS ships 3.2 as /bin/bash)"
fi

# --- hard requirements ---
for tool in git awk sed grep python3 jq curl; do
  if command -v "$tool" >/dev/null 2>&1; then ok "$tool"; else bad "$tool"; fi
done

if ! command -v jq >/dev/null 2>&1 && [[ "$AT_OS" == "Darwin" ]]; then
  hint "brew install jq"
fi

if (( ${#AT_TIMEOUT[@]} )); then
  ok "timeout (${AT_TIMEOUT[0]})"
else
  bad "timeout — runs cannot be wall-capped, and the ship-by-halfway discipline depends on it"
  [[ "$AT_OS" == "Darwin" ]] && hint "brew install coreutils"
fi

if command -v sha256sum >/dev/null 2>&1 || command -v shasum >/dev/null 2>&1; then
  ok "sha256"
else
  bad "sha256sum or shasum"
fi

# --- engine ---
if   command -v claude >/dev/null 2>&1; then ok "claude CLI"
elif command -v codex  >/dev/null 2>&1; then ok "codex CLI"
else
  bad "no engine CLI on PATH (need \`claude\` or \`codex\`)"
  hint "the engine is what actually does the mathematics; autotao only paces it"
fi

command -v bun >/dev/null 2>&1 && ok "bun $(bun --version)" \
  || warn "bun absent — needed only to build the console from source, not to run a release binary"

if command -v uv >/dev/null 2>&1; then
  ok "uv $(uv --version | awk '{print $2}')"
else
  warn "uv absent — verification dependencies will not be reproducibly locked"
  hint "install uv, then run: uv sync"
fi

# --- soft requirements ---
if (( ${#AT_SETSID[@]} )); then
  ok "setsid"
else
  warn "setsid absent — runs still detach, but share a session with their launcher"
  [[ "$AT_OS" == "Darwin" ]] && hint "expected on macOS; the harness accounts for it"
fi

command -v pdftotext >/dev/null 2>&1 && ok "pdftotext" \
  || warn "pdftotext absent — papers cache PDFs but cannot extract text for the agent"

if [[ "$AT_OS" == "Darwin" ]]; then
  command -v lsof >/dev/null 2>&1 && ok "lsof (orphan cwd detection)" \
    || warn "lsof absent — the reaper cannot read process working directories, so .noreap is not honored"
fi

# --- capacity ---
AVAIL=$(at_avail_mem_mb)
if [[ "${AVAIL:-0}" -ge 400 ]]; then ok "memory ${AVAIL}MB available"
else warn "memory ${AVAIL}MB available — below the 400MB launch floor right now"; fi

printf '\n'
if (( FAIL )); then
  printf 'not ready — install what is marked MISS above.\n'
  exit 1
fi
printf 'ready.\n'
exit 0
