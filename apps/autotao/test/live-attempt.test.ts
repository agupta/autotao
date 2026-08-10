import { describe, expect, test } from "bun:test"
import { latestAgentMessage, parseResultMarkdown, problemFromDirectory } from "../src/live-attempt.ts"

const RESULT = [
  "# Result — Erdős #993 FULL lottery, iteration 181",
  "",
  "**Outcome: partial.**  The selected full target remains open: this attempt",
  "neither proves the conjecture nor gives a counterexample.",
  "",
  "## 1. Selection and mandatory live credit gate",
  "",
  "This is attempt `A=115`, scheduled tier `F`, selecting T4:",
  "",
  "## 2. Binomial-padding theorem",
  "",
  "### Theorem 2.1",
  "",
  "## 3. The two displayed non-LC trees heal in pairs",
  "",
  "## 6. Verification and exact remaining gap",
].join("\n")

describe("parseResultMarkdown", () => {
  test("reads the run's own coordinates", () => {
    const summary = parseResultMarkdown(RESULT)
    expect(summary.attempt).toBe(115)
    expect(summary.tier).toBe("F")
    expect(summary.target).toBe("T4")
  })

  test("takes the title and the bolded outcome paragraph", () => {
    const summary = parseResultMarkdown(RESULT)
    expect(summary.title).toBe("Result — Erdős #993 FULL lottery, iteration 181")
    expect(summary.outcome).toContain("Outcome: partial.")
    expect(summary.outcome).toContain("remains open")
    expect(summary.outcome).not.toContain("**")
  })

  // The section headings are the lines of attack; the selection/credit-gate
  // section is bookkeeping every run performs and says nothing about approach.
  test("lists approaches and drops the bookkeeping section", () => {
    const summary = parseResultMarkdown(RESULT)
    expect(summary.approaches).toEqual([
      "Binomial-padding theorem",
      "The two displayed non-LC trees heal in pairs",
      "Verification and exact remaining gap",
    ])
  })

  test("ignores deeper headings", () => {
    expect(parseResultMarkdown(RESULT).approaches).not.toContain("Theorem 2.1")
  })

  // A run before its halfway ship has no RESULT.md at all.
  test("returns empty fields rather than failing on nothing", () => {
    expect(parseResultMarkdown("")).toEqual({
      title: null, attempt: null, tier: null, target: null, outcome: null, approaches: [],
    })
  })

  test("still finds attempt and tier when the selection sentence is phrased differently", () => {
    const summary = parseResultMarkdown("Run for attempt `A=7` at tier `B`, no selection sentence.")
    expect(summary.attempt).toBe(7)
    expect(summary.tier).toBe("B")
    expect(summary.target).toBeNull()
  })
})

describe("latestAgentMessage", () => {
  const codex = [
    '{"type":"item.completed","item":{"type":"command_execution","command":"ls"}}',
    '{"type":"item.completed","item":{"type":"agent_message","text":"First thought."}}',
    '{"type":"item.completed","item":{"type":"agent_message","text":"The newest thought."}}',
    '{"type":"item.completed","item":{"type":"command_execution","command":"python3 x.py"}}',
  ].join("\n")

  test("takes the newest agent message, not the newest event", () => {
    expect(latestAgentMessage(codex)).toBe("The newest thought.")
  })

  test("reads Claude assistant messages too", () => {
    const claude = '{"type":"assistant","message":{"role":"assistant","content":[{"type":"text","text":"Claude said this."}]}}'
    expect(latestAgentMessage(claude)).toBe("Claude said this.")
  })

  // Reading a tail almost always starts mid-line.
  test("skips a truncated leading line", () => {
    const truncated = `ext":"half a line"}}\n${codex}`
    expect(latestAgentMessage(truncated)).toBe("The newest thought.")
  })

  test("strips inline LaTeX delimiters that a terminal would show literally", () => {
    const line = '{"type":"item.completed","item":{"type":"agent_message","text":"the \\\\(\\\\ker(A+I)\\\\) space"}}'
    expect(latestAgentMessage(line)).toBe("the \\ker(A+I) space")
  })

  test("collapses newlines into one line", () => {
    const line = '{"type":"item.completed","item":{"type":"agent_message","text":"one\\ntwo\\n\\nthree"}}'
    expect(latestAgentMessage(line)).toBe("one two three")
  })

  test("returns null when there is nothing to say", () => {
    expect(latestAgentMessage("")).toBeNull()
    expect(latestAgentMessage("not json at all")).toBeNull()
    expect(latestAgentMessage('{"type":"item.completed","item":{"type":"agent_message","text":"   "}}')).toBeNull()
  })
})

describe("problemFromDirectory", () => {
  test("recovers the slug from an attempt directory", () => {
    expect(problemFromDirectory("2026-08-10-erdos-993-tree-unimodality-1")).toBe("erdos-993-tree-unimodality")
    expect(problemFromDirectory("2026-08-10-odd-induced-subgraphs-2")).toBe("odd-induced-subgraphs")
  })

  test("returns null for anything not shaped like one", () => {
    expect(problemFromDirectory("raw-logs")).toBeNull()
    expect(problemFromDirectory("supervision")).toBeNull()
    expect(problemFromDirectory("2026-08-10-no-trailing-number")).toBeNull()
  })
})
