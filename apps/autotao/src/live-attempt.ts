/**
 * What the run that is happening *right now* is doing.
 *
 * `attempts/LOG.md` only gets a line when a run closes, so a dashboard built on
 * it describes the previous attempt — which can be a different target at a
 * different ambition tier from the one currently burning allowance.
 *
 * The running attempt leaves a better trail: harness/loop.md requires a
 * complete artifact committed at the halfway mark, so `RESULT.md` exists inside
 * the attempt directory from mid-run onwards and is written to be read. Before
 * that there is only the transcript, so the newest agent message stands in.
 *
 * Presentation only. Nothing here influences the loop.
 */
import type { AmbitionTier } from "./problem-brief.ts"
export type { LiveAttempt } from "./protocol.ts"

function plainText(markdown: string): string {
  return markdown
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/\*\*([^*]*)\*\*/g, "$1")
    .replace(/(?<!\w)[*_]([^*_]+)[*_](?!\w)/g, "$1")
    .replace(/[“”]/g, '"')
    .replace(/\s*\n\s*/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim()
}

/**
 * Headings that describe bookkeeping the run must do rather than a line of
 * attack on the mathematics. Dropping them is cosmetic: everything else is
 * shown exactly as the run titled it.
 */
const BOOKKEEPING = /^(?:selection\b|.*credit gate)/i

export interface ResultSummary {
  title: string | null
  attempt: number | null
  tier: AmbitionTier | null
  target: string | null
  outcome: string | null
  approaches: string[]
}

/** Read a run's own account of itself out of its RESULT.md. */
export function parseResultMarkdown(markdown: string): ResultSummary {
  const summary: ResultSummary = {
    title: null, attempt: null, tier: null, target: null, outcome: null, approaches: [],
  }
  if (!markdown) return summary

  const lines = markdown.split(/\r?\n/)

  const heading = lines.find((line) => /^#\s+\S/.test(line))
  if (heading) summary.title = plainText(heading.replace(/^#\s+/, ""))

  // "This is attempt `A=115`, scheduled tier `F`, selecting T4:"
  const coordinates = /attempt\s+`?A\s*=\s*(\d+)`?[^.\n]*?tier\s+`?([PBF])`?[^.\n]*?selecting\s+(T\d+|FULL)/i.exec(markdown)
  if (coordinates) {
    summary.attempt = Number.parseInt(coordinates[1] ?? "", 10) || null
    summary.tier = (coordinates[2]?.toUpperCase() as AmbitionTier) ?? null
    summary.target = coordinates[3] ?? null
  } else {
    const attempt = /attempt\s+`?A\s*=\s*(\d+)`?/i.exec(markdown)
    if (attempt) summary.attempt = Number.parseInt(attempt[1] ?? "", 10) || null
    const tier = /tier\s+`?([PBF])`?/i.exec(markdown)
    if (tier) summary.tier = (tier[1]?.toUpperCase() as AmbitionTier) ?? null
  }

  // The paragraph carrying the run's bolded verdict.
  const paragraphs = markdown.split(/\n\s*\n/)
  const outcome = paragraphs.find((paragraph) => /\*\*\s*Outcome:/i.test(paragraph))
  if (outcome) summary.outcome = plainText(outcome)

  for (const line of lines) {
    const section = /^##\s+(?:\d+[a-z]?\.\s*)?(.+?)\s*$/.exec(line)
    if (!section) continue
    const text = plainText(section[1] ?? "")
    if (!text || BOOKKEEPING.test(text)) continue
    summary.approaches.push(text)
  }

  return summary
}

/**
 * Newest agent message in a transcript tail, or null.
 *
 * Deliberately scans a bounded tail rather than parsing the whole log: this is
 * sampled on every dashboard refresh, and a session log can reach 16MB.
 * Handles both engines — Codex emits item.completed/agent_message, Claude emits
 * assistant messages with a content array.
 */
export function latestAgentMessage(tail: string): string | null {
  if (!tail) return null
  const lines = tail.split(/\r?\n/)
  for (let index = lines.length - 1; index >= 0; index--) {
    const line = (lines[index] ?? "").trim()
    if (!line.startsWith("{")) continue
    let parsed: unknown
    try {
      parsed = JSON.parse(line)
    } catch {
      continue // A truncated first line is expected when reading a tail.
    }
    const text = agentText(parsed)
    if (text) return text
  }
  return null
}

function agentText(value: unknown): string | null {
  if (value == null || typeof value !== "object") return null
  const record = value as Record<string, unknown>

  const item = record.item as Record<string, unknown> | undefined
  if (item && item.type === "agent_message" && typeof item.text === "string" && item.text.trim()) {
    return collapse(item.text)
  }

  const message = (record.message ?? record) as Record<string, unknown>
  if (message.role === "assistant" && Array.isArray(message.content)) {
    const text = message.content
      .map((part) => {
        const chunk = part as Record<string, unknown>
        return chunk?.type === "text" && typeof chunk.text === "string" ? chunk.text : ""
      })
      .filter(Boolean)
      .join(" ")
    if (text.trim()) return collapse(text)
  }
  return null
}

function collapse(text: string): string {
  return stripMath(text).replace(/\s*\n\s*/g, " ").replace(/\s{2,}/g, " ").trim()
}

/**
 * Drop inline-LaTeX delimiters, keeping what is between them. A terminal shows
 * `\(\ker(A+I)\)` literally, and the backslash-parens are noise around a
 * formula that reads fine on its own.
 */
function stripMath(text: string): string {
  return text
    .replace(/\\[()[\]]/g, "")
    .replace(/\$\$?/g, "")
}

/** Slug embedded in an attempt directory name: <date>-<slug>-<n>. */
export function problemFromDirectory(name: string): string | null {
  const match = /^\d{4}-\d{2}-\d{2}-(.+?)-\d+$/.exec(name)
  return match?.[1] ?? null
}
