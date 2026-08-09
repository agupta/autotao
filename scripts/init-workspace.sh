#!/usr/bin/env bash
set -euo pipefail

REPO="$(cd "$(dirname "$0")/.." && pwd)"
WORKSPACE="${AUTOTAO_WORKSPACE:-$REPO/.autotao/workspace}"

if [[ -e "$WORKSPACE" ]]; then
  printf 'AutoTao workspace already exists: %s\n' "$WORKSPACE" >&2
  exit 1
fi

WORKSPACE_PARENT="$(dirname "$WORKSPACE")"
if [[ ! -d "$WORKSPACE_PARENT" ]]; then
  mkdir -p "$WORKSPACE_PARENT"
  chmod 700 "$WORKSPACE_PARENT"
fi
git clone --local --no-hardlinks "$REPO" "$WORKSPACE"
git -C "$WORKSPACE" remote remove origin

CONFIG_ROOT="${XDG_CONFIG_HOME:-$HOME/.config}"
CONFIG_DIR="$CONFIG_ROOT/autotao"
if [[ ! -d "$CONFIG_DIR" ]]; then
  mkdir -p "$CONFIG_DIR"
fi
chmod 700 "$CONFIG_DIR"
umask 077
printf '%s\n' "$REPO" > "$CONFIG_DIR/home.tmp"
mv "$CONFIG_DIR/home.tmp" "$CONFIG_DIR/home"

printf 'Initialized private AutoTao workspace at %s\n' "$WORKSPACE"
printf 'Registered it as the global AutoTao state profile.\n'
printf 'Run it from the public checkout with: bash scripts/autotao.sh\n'
