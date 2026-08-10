import { describe, expect, test } from "bun:test"
import {
  attemptSummary,
  parseAttemptTarget,
  parseProblemFile,
  tierDetail,
  tierLabel,
} from "../src/problem-brief.ts"

const LEDGER_TARGET =
  "T1 ACTIVE (attempt A=102, tier P): prove every subcubic tree has a unimodal independence polynomial, or give an exact counterexample"

describe("parseAttemptTarget", () => {
  test("separates the bookkeeping from the mathematics", () => {
    const parsed = parseAttemptTarget(LEDGER_TARGET)
    expect(parsed.targetId).toBe("T1")
    expect(parsed.targetStatus).toBe("ACTIVE")
    expect(parsed.attempt).toBe(102)
    expect(parsed.tier).toBe("P")
    expect(parsed.statement).toBe(
      "prove every subcubic tree has a unimodal independence polynomial, or give an exact counterexample",
    )
  })

  // Hand-written and older ledger lines have no coordinates. Losing their text
  // would be far worse than showing it unparsed.
  test("keeps an unrecognised line whole", () => {
    const parsed = parseAttemptTarget("prove the exact B(N) bound for every admissible integer")
    expect(parsed.attempt).toBeNull()
    expect(parsed.tier).toBeNull()
    expect(parsed.statement).toBe("prove the exact B(N) bound for every admissible integer")
  })

  test("tolerates a missing status word and loose spacing", () => {
    const parsed = parseAttemptTarget("T3  (attempt A=7,  tier F) :  settle the full conjecture")
    expect(parsed.targetId).toBe("T3")
    expect(parsed.targetStatus).toBeNull()
    expect(parsed.attempt).toBe(7)
    expect(parsed.tier).toBe("F")
    expect(parsed.statement).toBe("settle the full conjecture")
  })

  test("survives an empty target", () => {
    expect(parseAttemptTarget("").statement).toBe("")
  })
})

describe("ambition tiers", () => {
  // Meanings come from harness/loop.md's schedule P,P,B,P,F,B,P,B,P,F.
  test("names each tier", () => {
    expect(tierLabel("P")).toBe("the publishable rung")
    expect(tierLabel("B")).toBe("a decisive bottleneck")
    expect(tierLabel("F")).toBe("the full conjecture")
    expect(tierLabel(null)).toBeNull()
    expect(tierDetail(null)).toBeNull()
  })

  test("summarises an attempt in one line", () => {
    expect(attemptSummary(parseAttemptTarget(LEDGER_TARGET))).toBe(
      "Attempt 102 · target T1 (active) · going for the publishable rung",
    )
  })

  test("says nothing when there is nothing to say", () => {
    expect(attemptSummary(parseAttemptTarget("just some prose"))).toBeNull()
  })
})

describe("parseProblemFile", () => {
  const markdown = [
    "# Erdős #993 — unimodality of tree independence polynomials",
    "",
    "> Formalizer output. Human skim required.",
    "",
    "## In plain terms",
    "",
    "Count the independent sets of each size in a tree. The claim is that those",
    "counts rise and then fall, never wobbling.",
    "",
    "## 1. Formal statement",
    "",
    "Let `i_k(G)` be the number of independent sets of size `k`.",
    "",
    "## 3. Named targets",
    "",
    "**T1 — ACTIVE. Proof-shaped: every subcubic tree is unimodal.** Prove it for every",
    "tree with `Delta(T)<=3`, or give one explicit counterexample.",
    "",
    "**T2 — Proof-shaped: a closure theorem.** Something else entirely.",
  ].join("\n")

  test("takes the human title from the H1", () => {
    expect(parseProblemFile("erdos-993", markdown).title)
      .toBe("Erdős #993 — unimodality of tree independence polynomials")
  })

  test("reads the plain-terms section and unwraps it", () => {
    const plain = parseProblemFile("erdos-993", markdown).plain
    expect(plain).toBe(
      "Count the independent sets of each size in a tree. The claim is that those counts rise and then fall, never wobbling.",
    )
  })

  test("takes the ACTIVE target, not another one", () => {
    const active = parseProblemFile("erdos-993", markdown).activeTarget
    expect(active).toContain("every subcubic tree is unimodal")
    expect(active).not.toContain("closure theorem")
    // Markdown emphasis and code fences would otherwise render as punctuation.
    expect(active).not.toContain("**")
    expect(active).not.toContain("`")
  })

  // Every field is optional: files predating a convention must still render.
  test("returns nulls rather than failing on a file with none of it", () => {
    const brief = parseProblemFile("bare", "some notes with no headings at all")
    expect(brief).toEqual({ slug: "bare", title: null, plain: null, activeTarget: null })
  })

  test("returns nulls for empty input", () => {
    expect(parseProblemFile("empty", "").title).toBeNull()
  })

  test("skips the formalizer's provenance blockquote", () => {
    const withNote = "## In plain terms\n\n> Provenance note, not exposition.\n\nThe actual explanation."
    expect(parseProblemFile("x", withNote).plain).toBe("The actual explanation.")
  })

  test("accepts the heading under other spellings", () => {
    for (const heading of ["## Plain summary", "## 0. In plain terms", "### Plain English"]) {
      expect(parseProblemFile("x", `${heading}\n\nBody text.`).plain).toBe("Body text.")
    }
  })
})
