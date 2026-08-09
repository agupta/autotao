#!/usr/bin/env bash
set -euo pipefail

SOURCE="${BASH_SOURCE[0]}"
while [[ -L "$SOURCE" ]]; do
  SOURCE_DIR="$(cd "$(dirname "$SOURCE")" && pwd)"
  SOURCE="$(readlink "$SOURCE")"
  [[ "$SOURCE" != /* ]] && SOURCE="$SOURCE_DIR/$SOURCE"
done
REPO="$(cd "$(dirname "$SOURCE")/.." && pwd)"
APP="$REPO/apps/autotao"
CONFIG_ROOT="${XDG_CONFIG_HOME:-$HOME/.config}"
REGISTERED_HOME="$CONFIG_ROOT/autotao/home"
export AUTOTAO_START_DIR="$PWD"

if [[ -z "${AUTOTAO_HOME:-}" ]]; then
  if [[ -f "$REGISTERED_HOME" ]]; then
    AUTOTAO_HOME="$(<"$REGISTERED_HOME")"
  else
    AUTOTAO_HOME="$REPO"
  fi
fi
export AUTOTAO_HOME

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
