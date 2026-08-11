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

# The clone carries only tracked files, and autotao.json is deliberately untracked
# (it is per-machine and the TUI rewrites it). Without seeding one here the new
# workspace would have no config at all and the app would refuse to start, so copy
# the tracked example across. Never overwrite: the clone should not clobber a config
# a caller placed at $WORKSPACE ahead of time.
if [[ ! -e "$WORKSPACE/autotao.json" ]]; then
  if [[ -f "$WORKSPACE/autotao.example.json" ]]; then
    cp "$WORKSPACE/autotao.example.json" "$WORKSPACE/autotao.json"
  elif [[ -f "$REPO/autotao.example.json" ]]; then
    cp "$REPO/autotao.example.json" "$WORKSPACE/autotao.json"
  else
    printf 'warning: no autotao.example.json to seed %s/autotao.json from\n' "$WORKSPACE" >&2
  fi
fi

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
