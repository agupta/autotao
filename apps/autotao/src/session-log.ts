import type { TranscriptLine, TranscriptLineKind } from "./protocol.ts"

export interface ParsedSessionLog {
  threadId: string | null
  lines: TranscriptLine[]
}

type JsonObject = Record<string, unknown>

function object(value: unknown): JsonObject | null {
  return value != null && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : null
}

function string(value: unknown): string {
  return typeof value === "string" ? value : ""
}

function push(lines: TranscriptLine[], kind: TranscriptLineKind, text: string): void {
  const clean = text.replace(/\r/g, "").trimEnd()
  if (clean.trim()) lines.push({ kind, text: clean })
}

function compactCommand(command: string): string {
  return command.replace(/^\/bin\/(?:ba)?sh\s+-lc\s+/, "").replace(/\n/g, " ↵ ").trim()
}

function fileChanges(value: unknown): string {
  if (!Array.isArray(value)) return ""
  return value.flatMap((change) => {
    const item = object(change)
    if (!item) return []
    const path = string(item.path)
    const kind = string(item.kind)
    return path ? [`${kind || "change"} ${path}`] : []
  }).join("\n")
}

function contentText(content: unknown): string {
  if (typeof content === "string") return content
  if (!Array.isArray(content)) return ""
  return content.map((raw) => {
    const item = object(raw)
    return item ? string(item.text) || string(item.content) : ""
  }).filter(Boolean).join("\n")
}

function renderClaudeContent(content: unknown, lines: TranscriptLine[], includeMessages = true): void {
  if (typeof content === "string") {
    if (includeMessages) push(lines, "agent", content)
    return
  }
  if (!Array.isArray(content)) return
  for (const raw of content) {
    const item = object(raw)
    if (!item) continue
    const type = string(item.type)
    if (type === "text" && includeMessages) push(lines, "agent", string(item.text))
    if (type === "tool_use") {
      const input = object(item.input)
      const detail = string(input?.command) || string(input?.query) || string(input?.path)
      push(lines, "tool", `${string(item.name) || "tool"}${detail ? ` · ${compactCommand(detail)}` : ""}`)
    }
    if (type === "tool_result") push(lines, "output", contentText(item.content))
  }
}

function renderCodexItem(eventType: string, raw: unknown, lines: TranscriptLine[]): void {
  const item = object(raw)
  if (!item) return
  const type = string(item.type)
  const completed = eventType === "item.completed"

  if (type === "agent_message" && completed) push(lines, "agent", string(item.text))
  if (type === "command_execution" && completed) {
    push(lines, "command", compactCommand(string(item.command)))
    push(lines, "output", string(item.aggregated_output))
    const exitCode = item.exit_code
    if (typeof exitCode === "number" && exitCode !== 0) push(lines, "error", `command exited ${exitCode}`)
  }
  if (type === "file_change" && completed) push(lines, "file", fileChanges(item.changes))
  if (type === "web_search" && completed) push(lines, "tool", `web search · ${string(item.query) || string(item.text)}`)
  if (type === "mcp_tool_call" && completed) push(lines, "tool", `${string(item.server)} ${string(item.tool)}`.trim())
  if (type === "collab_tool_call" && eventType === "item.started" && string(item.tool) !== "wait") {
    push(lines, "tool", `subagent ${string(item.tool)}${string(item.prompt) ? ` · ${string(item.prompt)}` : ""}`)
  }
  // Deliberately omit internal reasoning payloads. Agent updates and observable work
  // remain visible without turning the session browser into a chain-of-thought dump.
}

export function parseSessionLog(input: string): ParsedSessionLog {
  const lines: TranscriptLine[] = []
  let threadId: string | null = null

  for (const rawLine of input.split("\n")) {
    if (!rawLine.trim()) continue
    let value: unknown
    try {
      value = JSON.parse(rawLine)
    } catch {
      push(lines, "output", rawLine)
      continue
    }
    const event = object(value)
    if (!event) continue
    const type = string(event.type)

    if (type === "thread.started") {
      threadId = string(event.thread_id) || threadId
      push(lines, "status", `Codex session ${threadId ?? "started"}`)
      continue
    }
    if (type === "turn.started") {
      push(lines, "status", "Turn started")
      continue
    }
    if (type === "turn.completed") {
      push(lines, "status", "Turn completed")
      continue
    }
    if (type === "error") {
      push(lines, "error", string(event.message) || JSON.stringify(event))
      continue
    }
    if (type === "item.started" || type === "item.completed") {
      renderCodexItem(type, event.item, lines)
      continue
    }
    if (type === "assistant") {
      const message = object(event.message)
      renderClaudeContent(message?.content ?? event.content, lines)
      continue
    }
    if (type === "user") {
      const message = object(event.message)
      renderClaudeContent(message?.content ?? event.content, lines, false)
      continue
    }
    if (type === "system" && string(event.subtype) === "init") {
      threadId = string(event.session_id) || threadId
      push(lines, "status", `Claude session ${threadId ?? "started"}`)
      continue
    }
    if (type === "result") {
      push(lines, event.is_error === true ? "error" : "status", string(event.result) || string(event.subtype))
      continue
    }
  }

  return { threadId, lines }
}
