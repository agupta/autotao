#!/usr/bin/env bash
set -euo pipefail

REPO="$(cd "$(dirname "$0")/.." && pwd)"
APP="$REPO/apps/autotao"

if [[ -n "${AUTOTAO_BIN:-}" ]]; then
  exec "$AUTOTAO_BIN" "$@"
fi

if [[ -x "$APP/dist/autotao" ]]; then
  exec "$APP/dist/autotao" "$@"
fi

if command -v bun >/dev/null 2>&1; then
  cd "$APP"
  exec bun src/index.tsx "$@"
fi

printf '%s\n' \
  "AutoTao is not built and Bun is unavailable." \
  "Install Bun, then run: cd apps/autotao && bun install && bun run build" >&2
exit 127
