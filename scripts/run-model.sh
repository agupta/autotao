#!/usr/bin/env bash
# Resolve which model the next/current run uses, and which usage tank that maps to.
# Prints: "<model-id> <tank-key>"   e.g. "claude-opus-5 opus"
#
# Extracted because should-run.sh and run-once.sh each carried their own copy of
# this resolution. They agreed by luck, not by construction: a change to the
# fallback in one would have silently gated against a different model than the
# one actually launched.
#
# Precedence: RUN_MODEL env > LOOP_STATE.md `run_model:` (deprecated) > claude-fable-5.
#
# RUN_MODEL is no longer just a per-session override: it is the normal path. The app
# exports it from autotao.json's `model` for every command it spawns, which is what
# makes autotao.json the single place configuring engine/model/effort. The LOOP_STATE.md
# read stays only so a hand-run `bash scripts/run-once.sh` in an older workspace keeps
# working; new state files do not carry the key.
#
# The final fallback is a full model id, not the bare `fable` alias it used to be. The
# alias does resolve as a --model value, but it cannot be looked up in weekly_by_model,
# so falling back to it silently gated the run against the wrong tank.
#
# Only SOME models have a per-model weekly tank (currently just fable), so the key is
# what usage.sh looks up in weekly_by_model — see the note there.
set -euo pipefail

REPO="$(cd "$(dirname "$0")/.." && pwd)"
MODEL="${RUN_MODEL:-$(grep -oP '^run_model:\s*\K\S+' "$REPO/LOOP_STATE.md" 2>/dev/null || true)}"
MODEL="${MODEL:-claude-fable-5}"

case "$MODEL" in
  fable*|claude-fable*)   KEY=fable ;;
  opus*|claude-opus*)     KEY=opus ;;
  sonnet*|claude-sonnet*) KEY=sonnet ;;
  *)                      KEY="$MODEL" ;;
esac

printf '%s %s\n' "$MODEL" "$KEY"
