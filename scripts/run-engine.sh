#!/usr/bin/env bash
# Resolve the agent engine used by the supervision pipeline.
#
# Precedence:
#   explicit argument > RUN_ENGINE environment variable > claude
#
# Examples:
#   bash scripts/supervise-console.sh          # Claude Code (default)
#   bash scripts/supervise-console.sh codex    # Codex
#   RUN_ENGINE=codex bash scripts/launch.sh    # Codex
set -euo pipefail

ENGINE="${1:-${RUN_ENGINE:-claude}}"
case "$ENGINE" in
  codex|claude) printf '%s\n' "$ENGINE" ;;
  *)
    echo "unknown run engine '$ENGINE' (want codex|claude)" >&2
    exit 2
    ;;
esac
