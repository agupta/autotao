/**
 * Turn the harness's internal bookkeeping into something a mathematician who
 * does not work in the subfield can read.
 *
 * Everything here is presentation only. It parses artifacts the loop already
 * writes — the ledger line and `problems/<slug>.md` — and never influences what
 * gets attempted or how.
 */

/** Ambition tiers, from harness/loop.md's repeating schedule P,P,B,P,F,B,P,B,P,F. */
export type AmbitionTier = "P" | "B" | "F"

const TIER_LABEL: Record<AmbitionTier, string> = {
  P: "the publishable rung",
  B: "a decisive bottleneck",
  F: "the full conjecture",
}

const TIER_DETAIL: Record<AmbitionTier, string> = {
  P: "the named partial that would stand as a result on its own (half of all attempts)",
  B: "a harder target that subsumes the active one or clears a central obstruction (three in ten)",
  F: "the whole conjecture, attempted outright (one in five)",
}

export function tierLabel(tier: AmbitionTier | null): string | null {
  return tier ? TIER_LABEL[tier] : null
}

export function tierDetail(tier: AmbitionTier | null): string | null {
  return tier ? TIER_DETAIL[tier] : null
}

export interface AttemptCoordinates {
  /** Named target within the problem, e.g. "T1". */
  targetId: string | null
  /** That target's status word, e.g. "ACTIVE". */
  targetStatus: string | null
  /** Global attempt counter (the A= number). */
  attempt: number | null
  tier: AmbitionTier | null
  /** What was actually being attempted, in the harness's own words. */
  statement: string
}

// "T1 ACTIVE (attempt A=102, tier P): prove every subcubic tree has ..."
const TARGET_LINE = /^\s*(T\d+)(?:\s+([A-Z]+))?\s*\(\s*attempt\s+A\s*=\s*(\d+)\s*,\s*tier\s+([PBF])\s*\)\s*:\s*(.*)$/s

/**
 * Split a ledger target into its coordinates and its readable statement. A line
 * that does not carry the coordinates is not an error — older entries and
 * hand-written ones are simply all statement.
 */
export function parseAttemptTarget(target: string): AttemptCoordinates {
  const match = TARGET_LINE.exec(target ?? "")
  if (!match) {
    return { targetId: null, targetStatus: null, attempt: null, tier: null, statement: (target ?? "").trim() }
  }
  const [, targetId, targetStatus, attempt, tier, statement] = match
  return {
    targetId: targetId ?? null,
    targetStatus: targetStatus ?? null,
    attempt: attempt ? Number.parseInt(attempt, 10) : null,
    tier: (tier as AmbitionTier) ?? null,
    statement: (statement ?? "").trim(),
  }
}

/** One line naming which attempt this was and how ambitious it set out to be. */
export function attemptSummary(coordinates: AttemptCoordinates): string | null {
  const parts: string[] = []
  if (coordinates.attempt != null) parts.push(`Attempt ${coordinates.attempt}`)
  if (coordinates.targetId) {
    const status = coordinates.targetStatus ? ` (${coordinates.targetStatus.toLowerCase()})` : ""
    parts.push(`target ${coordinates.targetId}${status}`)
  }
  const tier = tierLabel(coordinates.tier)
  if (tier) parts.push(`going for ${tier}`)
  return parts.length ? parts.join(" · ") : null
}

export type { ProblemBrief } from "./protocol.ts"
import type { ProblemBrief } from "./protocol.ts"

/** Strip the markdown that would otherwise render as literal punctuation. */
function plainText(markdown: string): string {
  return markdown
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/\*\*([^*]*)\*\*/g, "$1")
    .replace(/(?<!\w)[*_]([^*_]+)[*_](?!\w)/g, "$1")
    .replace(/\s*\n\s*/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim()
}

/** Headings that mean "explain this to someone outside the subfield". */
const PLAIN_HEADING = /^#{1,6}\s*(?:\d+[a-z]?\.\s*)?(in plain terms|plain terms|plain summary|plain statement|plain english)\b/i

/**
 * Read what the console can honestly say about a problem, from the file the
 * formalizer already writes. Every field is optional: a problem file that
 * predates a convention still renders, just with less.
 */
export function parseProblemFile(slug: string, markdown: string): ProblemBrief {
  const brief: ProblemBrief = { slug, title: null, plain: null, activeTarget: null }
  if (!markdown) return brief

  const lines = markdown.split(/\r?\n/)

  const heading = lines.find((line) => /^#\s+\S/.test(line))
  if (heading) brief.title = plainText(heading.replace(/^#\s+/, ""))

  // The plain-terms section, if the file has one: everything up to the next
  // heading of the same or higher level.
  const start = lines.findIndex((line) => PLAIN_HEADING.test(line))
  if (start >= 0) {
    const body: string[] = []
    for (let index = start + 1; index < lines.length; index++) {
      const line = lines[index] ?? ""
      if (/^#{1,6}\s/.test(line)) break
      // A blockquote here is the formalizer's provenance note, not exposition.
      if (/^\s*>/.test(line)) continue
      body.push(line)
    }
    const text = plainText(body.join("\n"))
    if (text) brief.plain = text
  }

  // The ACTIVE named target: the paragraph whose bolded lead marks it active.
  // This is where the file says what a proof would actually have to do.
  const paragraphs = markdown.split(/\n\s*\n/)
  const active = paragraphs.find((paragraph) => /\*\*T\d+\s*[—–-]\s*ACTIVE\b/.test(paragraph))
  if (active) brief.activeTarget = plainText(active)

  return brief
}
