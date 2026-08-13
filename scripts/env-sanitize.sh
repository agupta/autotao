#!/usr/bin/env bash
# Source this before spawning any headless Claude Code or Codex process.
#
# Defense in depth (NOT the 2026-07-23 crash root cause — that was run-once.sh's
# watchdog killing its own run via should-run.sh's lock check; fixed with
# IGNORE_RUN_LOCK). A headless claude launched from inside another Claude Code
# session inherits that session's context env (CLAUDE_CODE_CHILD_SESSION=1,
# CLAUDE_PID, CLAUDE_CODE_SESSION_ID, ...); stripping the markers makes the run a
# first-class root session independent of its launcher. Pair with `setsid` so
# parent-side job-control signals and tool timeouts can't reach the run either.
for _v in CLAUDECODE CLAUDE_CODE_CHILD_SESSION CLAUDE_CODE_SESSION_ID \
          CLAUDE_CODE_BRIDGE_SESSION_ID CLAUDE_PID CLAUDE_CODE_ENTRYPOINT \
          CLAUDE_EFFORT AI_AGENT CLAUDE_CODE_SSE_PORT CLAUDE_CODE_TASK_ID \
          CODEX_THREAD_ID CODEX_CI CODEX_PERMISSION_PROFILE \
          CODEX_SANDBOX_NETWORK_DISABLED; do
  unset "$_v" 2>/dev/null || true
done
unset _v
