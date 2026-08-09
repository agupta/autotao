#!/usr/bin/env bash
# Invoke a short-lived supervision/triage agent without taking the solve lock.
# Prompt is read from stdin. Usage: invoke-agent.sh [codex|claude] [model]
set -euo pipefail
cd "$(dirname "$0")/.."
source scripts/env-sanitize.sh

ENGINE="$(bash scripts/run-engine.sh "${1:-}")"
MODEL="${2:-}"
PROMPT="$(cat)"
DISALLOWED="${AGENT_DISALLOWED_TOOLS:-ScheduleWakeup,Monitor,CronCreate,CronDelete,CronList,PushNotification,SendMessage,RemoteTrigger,DesignSync,Workflow,WebFetch,WebSearch}"

case "$ENGINE" in
  codex)
    CODEX_MAX_SUBAGENTS="${CODEX_MAX_SUBAGENTS:-3}"
    CODEX_RUN_REASONING="${CODEX_REASONING_EFFORT:-xhigh}"
    [[ "$CODEX_MAX_SUBAGENTS" =~ ^[0-9]+$ ]] ||
      { echo "CODEX_MAX_SUBAGENTS must be a non-negative integer" >&2; exit 2; }
    ARGS=(exec --json --sandbox "${CODEX_SANDBOX:-workspace-write}"
      -c 'approval_policy="never"'
      -c "agents.max_concurrent_threads_per_session=${CODEX_MAX_SUBAGENTS}"
      -c "model_reasoning_effort=\"${CODEX_RUN_REASONING}\"")
    [[ -n "$MODEL" ]] && ARGS+=(--model "$MODEL")
    codex "${ARGS[@]}" "$PROMPT"
    ;;
  claude)
    ALLOWED="${AGENT_ALLOWED_TOOLS:-Read,Glob,Grep,Edit,Write,Bash}"
    ARGS=(-p "$PROMPT" --allowedTools "$ALLOWED" --disallowedTools "$DISALLOWED")
    [[ -n "$MODEL" ]] && ARGS+=(--model "$MODEL")
    claude "${ARGS[@]}"
    ;;
esac
