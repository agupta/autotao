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
  install -d -m 700 "$WORKSPACE_PARENT"
fi
git clone --local --no-hardlinks "$REPO" "$WORKSPACE"
git -C "$WORKSPACE" remote remove origin

printf 'Initialized private AutoTao workspace at %s\n' "$WORKSPACE"
printf 'Run it from the public checkout with: bash scripts/autotao.sh\n'
