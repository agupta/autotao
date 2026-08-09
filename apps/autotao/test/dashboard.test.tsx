import { afterEach, describe, expect, test } from "bun:test"
import { testRender } from "@opentui/solid"
import type { TestRendererSetup } from "@opentui/core/testing"
import { Dashboard, SessionBrowser, TranscriptView, formatTranscriptRows } from "../src/app.tsx"
import type { ProjectSnapshot, SessionSummary, SessionTranscript } from "../src/protocol.ts"

const snapshot: ProjectSnapshot = {
  schemaVersion: 1,
  sampledAt: "2026-08-09T02:00:00.000Z",
  project: { name: "new-math", root: "/workspace/new-math", adapter: "legacy-new-math" },
  engine: "codex",
  model: "gpt-5.6-sol",
  run: {
    phase: "running",
    pid: 4242,
    elapsedSeconds: 3720,
    lastWriteSeconds: 8,
    newestLog: "20260809-020000-codex-loop.log",
    newestLogBytes: 1_048_576,
  },
  gate: {
    phase: "open",
    health: "healthy",
    usageRc: 0,
    capacityRc: 0,
    reason: "All launch checks pass",
    source: "endpoint",
    sampleAgeSeconds: 20,
    uncapped: false,
    policy: { reservePercent: 5, pace: "even" },
    tanks: [
      {
        id: "weekly",
        label: "Weekly allowance",
        used: 20,
        burn: 5,
        ceiling: 90,
        hardCap: 100,
        projected: 25,
        governed: true,
        finishAt: 95,
        resetAt: Date.parse("2026-08-15T02:00:00.000Z") / 1000,
        windowMinutes: 10_080,
      },
    ],
  },
  resources: {
    availableMemoryMb: 4096,
    loadAverage: [0.2, 0.3, 0.4],
    papersWanted: [],
  },
  ledger: {
    date: "2026-08-09",
    model: "codex-gpt-5.6-sol",
    problem: "sample-problem",
    target: "prove the active target",
    duration: "~1h",
    verdict: "partial",
    outcome: "A verified fragment was recorded.",
  },
  pipeline: [
    { timestamp: "2026-08-09-01:00:00", message: "run launched" },
    { timestamp: "2026-08-09-02:00:00", message: "tier-1 decision: idle" },
  ],
  alerts: [],
}

let setup: TestRendererSetup | undefined

afterEach(() => {
  setup?.renderer.destroy()
  setup = undefined
})

describe("dashboard layout", () => {
  test.each([
    [80, 24],
    [140, 40],
  ])("renders the complete campaign-free dashboard at %dx%d", async (width, height) => {
    setup = await testRender(() => <Dashboard snapshot={snapshot} width={width} autoLaunch />, { width, height })
    await setup.renderOnce()
    const frame = setup.captureCharFrame()

    expect(frame).toContain("AUTOTAO")
    expect(frame).toContain("YOUR USAGE PLAN")
    expect(frame).toContain("AUTOPILOT ON")
    expect(frame).toContain("LAST MATH ATTEMPT")
    expect(frame).toContain("sample-problem")
    expect(frame.toLowerCase()).toMatch(/run (one )?now/)
    expect(frame).toMatch(/live work/i)
    expect(frame).toMatch(/sessions/i)
    expect(frame).toContain("95%")
    expect(frame).not.toContain("CAMPAIGN")
  })

  test("explains the policy and every persistent control in product language", async () => {
    setup = await testRender(() => <Dashboard snapshot={snapshot} width={80} autoLaunch help />, { width: 80, height: 24 })
    await setup.renderOnce()
    const frame = setup.captureCharFrame()

    expect(frame).toContain("HOW AUTOTAO DECIDES")
    expect(frame).toContain("normal usage counts")
    expect(frame).toContain("Space pause/resume")
  })

  test("gives action feedback its own unclipped status row", async () => {
    setup = await testRender(() => (
      <Dashboard
        snapshot={snapshot}
        width={80}
        autoLaunch
        message={{ ok: true, summary: "Maintenance finished", output: "" }}
      />
    ), { width: 80, height: 24 })
    await setup.renderOnce()
    const frame = setup.captureCharFrame()

    expect(frame).toContain("✓ Maintenance finished")
    expect(frame).toContain("Enter live work")
    expect(frame).not.toContain("Maintenance finis…")
  })

  test("wraps the complete mathematical target instead of ellipsizing it", async () => {
    const longTarget = "T1 ACTIVE: prove the exact B(N) bound for every admissible integer without an asymptotic escape hatch"
    const completeSnapshot: ProjectSnapshot = {
      ...snapshot,
      ledger: { ...snapshot.ledger!, target: longTarget, outcome: "Hostile verification remains in progress." },
    }
    setup = await testRender(() => <Dashboard snapshot={completeSnapshot} width={80} autoLaunch />, { width: 80, height: 24 })
    await setup.renderOnce()
    const frame = setup.captureCharFrame()

    expect(frame).toContain("every admissible integer without an")
    expect(frame).toContain("asymptotic escape hatch")
    expect(frame).not.toContain("T1 ACTIVE: prove the exact B(N) bou…")
  })

  test("browses current and historical sessions", async () => {
    const sessions: SessionSummary[] = [
      { id: "20260809-043858-codex-loop.log", modifiedAt: "2026-08-09T03:05:00.000Z", bytes: 1_500_000, engine: "codex", active: true },
      { id: "20260807-223019-claude-loop.log", modifiedAt: "2026-08-07T22:45:00.000Z", bytes: 900_000, engine: "claude", active: false },
    ]
    setup = await testRender(() => <SessionBrowser sessions={sessions} selected={0} width={100} height={24} />, { width: 100, height: 24 })
    await setup.renderOnce()
    const frame = setup.captureCharFrame()

    expect(frame).toContain("SESSION HISTORY")
    expect(frame).toContain("LIVE")
    expect(frame).toContain("DONE")
    expect(frame).toContain("Enter open")
  })

  test("renders a readable scrollable work transcript", async () => {
    const transcript: SessionTranscript = {
      session: { id: "20260809-043858-codex-loop.log", modifiedAt: "2026-08-09T03:05:00.000Z", bytes: 1_500_000, engine: "codex", active: true },
      threadId: "thread-123",
      truncated: false,
      lines: [
        { kind: "agent", text: "A verified fragment is ready for hostile audit." },
        { kind: "command", text: "uv run python verify/check.py" },
        { kind: "output", text: "ALL CHECKS PASSED" },
      ],
    }
    const rows = formatTranscriptRows(transcript.lines, 90)
    setup = await testRender(() => <TranscriptView transcript={transcript} rows={rows} offset={0} pageSize={10} follow />, { width: 100, height: 24 })
    await setup.renderOnce()
    const frame = setup.captureCharFrame()

    expect(frame).toContain("LIVE WORK")
    expect(frame).toContain("A verified fragment")
    expect(frame).toContain("ALL CHECKS PASSED")
    expect(frame).toContain("↑↓/Pg scroll")
  })
})
