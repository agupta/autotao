import { describe, expect, test } from "bun:test"
import { parseKeyValues, parseLatestLedger, parsePapersWanted, parsePipelineEvents } from "../src/parsers.ts"

describe("harness output parsers", () => {
  test("parses machine-readable usage output without shell eval", () => {
    const values = parseKeyValues(`USAGE_ENGINE=codex
USAGE_WEEK=41
USAGE_REASON="weekly gate closed"
USAGE_RC=1`)
    expect(values).toEqual({
      USAGE_ENGINE: "codex",
      USAGE_WEEK: "41",
      USAGE_REASON: "weekly gate closed",
      USAGE_RC: "1",
    })
  })

  test("finds the latest real ledger row", () => {
    const ledger = parseLatestLedger(`| date | model | problem | target | duration | outcome | artifacts | verify |
|---|---|---|---|---|---|---|---|
| 2026-08-09 | codex-gpt-5.6 | sample-problem | T1 target | ~0.5h | partial (useful fragment) | attempts/x | PASS |`)
    expect(ledger?.problem).toBe("sample-problem")
    expect(ledger?.verdict).toBe("partial")
    expect(ledger?.outcome).toBe("useful fragment")
  })

  test("filters gate chatter from pipeline activity", () => {
    const events = parsePipelineEvents(`[tick 2026-08-09-03:00:00] weekly tank closed
[tick 2026-08-09-03:01:00] tier-1 decision: idle
[tick 2026-08-09-03:02:00] gated relaunch`)
    expect(events.map((event) => event.message)).toEqual(["tier-1 decision: idle", "gated relaunch"])
  })

  test("reads wanted-paper table rows", () => {
    const rows = parsePapersWanted(`| key | citation | reason |
|---|---|---|
| arxiv-1234 | Example | unavailable upstream |`)
    expect(rows).toEqual([{ key: "arxiv-1234", reason: "unavailable upstream" }])
  })
})
