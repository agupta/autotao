import type { LedgerState, PipelineEvent } from "./protocol.ts"

export function parseKeyValues(input: string): Record<string, string> {
  const values: Record<string, string> = {}
  for (const line of input.split(/\r?\n/)) {
    const match = /^([A-Z][A-Z0-9_]*)=(.*)$/.exec(line.trim())
    if (!match) continue
    let value = match[2] ?? ""
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    values[match[1]!] = value.replace(/\\(.)/g, "$1")
  }
  return values
}

export function integer(value: string | undefined, fallback = -1): number {
  if (value == null || !/^-?\d+$/.test(value)) return fallback
  return Number.parseInt(value, 10)
}

export function parseLedgerLine(line: string): LedgerState | null {
  if (!line.trim().startsWith("|")) return null
  const fields = line.split("|").slice(1, -1).map((field) => field.trim())
  if (fields.length < 7 || fields[0] === "date" || /^-+$/.test(fields[0] ?? "")) return null
  const outcome = fields[5] ?? ""
  const verdict = outcome.match(/^([A-Za-z_-]+)/)?.[1] ?? "unknown"
  return {
    date: fields[0] ?? "",
    model: fields[1] ?? "",
    problem: fields[2] ?? "",
    target: fields[3] ?? "",
    duration: fields[4] ?? "",
    verdict,
    outcome: outcome.replace(/^[A-Za-z_-]+\s*/, "").replace(/^\(|\)$/g, ""),
  }
}

export function parseLatestLedger(input: string): LedgerState | null {
  const lines = input.split(/\r?\n/)
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const parsed = parseLedgerLine(lines[index] ?? "")
    if (parsed) return parsed
  }
  return null
}

export function parsePipelineEvents(input: string, limit = 5): PipelineEvent[] {
  return input
    .split(/\r?\n/)
    .map((line) => /^\[tick ([^\]]+)\]\s*(.*)$/.exec(line))
    .filter((match): match is RegExpExecArray => Boolean(match))
    .filter((match) => !/gate refused|session=|weekly tank|5-hour session tank/.test(match[2] ?? ""))
    .slice(-limit)
    .map((match) => ({ timestamp: match[1] ?? "", message: match[2] ?? "" }))
}

export function parsePapersWanted(input: string, limit = 4): Array<{ key: string; reason: string }> {
  const rows: Array<{ key: string; reason: string }> = []
  for (const line of input.split(/\r?\n/)) {
    if (!line.startsWith("|")) continue
    const fields = line.split("|").slice(1, -1).map((field) => field.trim())
    const key = fields[0] ?? ""
    if (!key || key === "key" || /^-+$/.test(key)) continue
    rows.push({ key, reason: fields[2] ?? fields[1] ?? "unavailable" })
    if (rows.length >= limit) break
  }
  return rows
}
