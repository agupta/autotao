#!/usr/bin/env bash
# Compatibility entry point for installations that used the old Bash renderer.
set -euo pipefail
cd "$(dirname "$0")/.."

if (( $# > 0 )); then
  printf '%s\n' \
    "supervise-console.sh no longer accepts renderer-specific arguments." \
    "Set engine and automation policy in autotao.json, then run scripts/autotao.sh." >&2
  exit 2
fi

exec bash scripts/autotao.sh
