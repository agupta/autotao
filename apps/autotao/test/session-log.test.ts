import { describe, expect, test } from "bun:test"
import { parseSessionLog } from "../src/session-log.ts"

describe("session transcript parser", () => {
  test("turns Codex JSONL into readable observable work", () => {
    const parsed = parseSessionLog([
      JSON.stringify({ type: "thread.started", thread_id: "thread-123" }),
      JSON.stringify({ type: "item.completed", item: { type: "agent_message", text: "I found a verifiable lemma." } }),
      JSON.stringify({ type: "item.completed", item: { type: "command_execution", command: "/bin/bash -lc uv run python verify/check.py", aggregated_output: "ALL CHECKS PASSED\n", exit_code: 0 } }),
      JSON.stringify({ type: "item.completed", item: { type: "file_change", changes: [{ kind: "add", path: "/repo/RESULT.md" }] } }),
      JSON.stringify({ type: "item.completed", item: { type: "reasoning", text: "private chain of thought" } }),
    ].join("\n"))

    expect(parsed.threadId).toBe("thread-123")
    expect(parsed.lines).toContainEqual({ kind: "agent", text: "I found a verifiable lemma." })
    expect(parsed.lines).toContainEqual({ kind: "command", text: "uv run python verify/check.py" })
    expect(parsed.lines).toContainEqual({ kind: "output", text: "ALL CHECKS PASSED" })
    expect(parsed.lines).toContainEqual({ kind: "file", text: "add /repo/RESULT.md" })
    expect(parsed.lines.map((line) => line.text).join("\n")).not.toContain("private chain of thought")
  })

  test("extracts Claude text and tool activity", () => {
    const parsed = parseSessionLog([
      JSON.stringify({ type: "system", subtype: "init", session_id: "claude-123" }),
      JSON.stringify({
        type: "assistant",
        message: {
          content: [
            { type: "text", text: "Auditing the certificate." },
            { type: "tool_use", name: "Bash", input: { command: "python check.py" } },
          ],
        },
      }),
      JSON.stringify({ type: "user", message: { content: [{ type: "tool_result", content: [{ type: "text", text: "PASS" }] }] } }),
    ].join("\n"))

    expect(parsed.lines).toEqual([
      { kind: "status", text: "Claude session claude-123" },
      { kind: "agent", text: "Auditing the certificate." },
      { kind: "tool", text: "Bash · python check.py" },
      { kind: "output", text: "PASS" },
    ])
  })
})
