#!/usr/bin/env bash
set -euo pipefail

REPO="$(cd "$(dirname "$0")/.." && pwd)"
BIN_DIR="${AUTOTAO_BIN_DIR:-$HOME/.local/bin}"
COMMAND="$BIN_DIR/autotao"
TARGET="$REPO/scripts/autotao.sh"
CONFIG_ROOT="${XDG_CONFIG_HOME:-$HOME/.config}"
CONFIG_DIR="$CONFIG_ROOT/autotao"

mkdir -p "$BIN_DIR"
if [[ -e "$COMMAND" || -L "$COMMAND" ]]; then
  if [[ -L "$COMMAND" && "$(readlink "$COMMAND")" == "$TARGET" ]]; then
    printf 'AutoTao command already installed: %s\n' "$COMMAND"
  else
    printf 'Refusing to replace existing command: %s\n' "$COMMAND" >&2
    exit 1
  fi
else
  ln -s "$TARGET" "$COMMAND"
  printf 'Installed %s -> %s\n' "$COMMAND" "$TARGET"
fi

mkdir -p "$CONFIG_DIR"
chmod 700 "$CONFIG_DIR"
umask 077
printf '%s\n' "$REPO" > "$CONFIG_DIR/home.tmp"
mv "$CONFIG_DIR/home.tmp" "$CONFIG_DIR/home"
printf 'Registered global AutoTao home: %s\n' "$REPO"
