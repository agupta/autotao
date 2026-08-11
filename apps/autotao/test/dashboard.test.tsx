import { afterEach, describe, expect, test } from "bun:test"
import { testRender } from "@opentui/solid"
import type { TestRendererSetup } from "@opentui/core/testing"
import { Dashboard, SessionBrowser, TranscriptView, dashboardMetrics, formatTranscriptRows, problemRows } from "../src/app.tsx"
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
    setup = await testRender(() => <Dashboard snapshot={snapshot} width={width} height={height} autoLaunch />, { width, height })
    await setup.renderOnce()
    const frame = setup.captureCharFrame()

    expect(frame).toContain("AUTOTAO")
    expect(frame).toContain("YOUR USAGE PLAN")
    expect(frame).toContain("AUTOPILOT ON")
    expect(frame).toContain("THE PROBLEM BEING WORKED ON")
    expect(frame).toContain("sample-problem")
    expect(frame.toLowerCase()).toMatch(/run (one )?now/)
    expect(frame).toMatch(/live work/i)
    expect(frame).toMatch(/sessions/i)
    expect(frame).toContain("95%")
    expect(frame).not.toContain("CAMPAIGN")
  })

  test.each([
    [80, 24],
    [89, 31],
    [140, 40],
  ])("gives the problem the full height beside a stacked usage plan at %dx%d", async (width, height) => {
    setup = await testRender(() => <Dashboard snapshot={snapshot} width={width} height={height} autoLaunch />, { width, height })
    await setup.renderOnce()
    const rows = setup.captureCharFrame().split("\n")
    const rowOf = (needle: string) => rows.findIndex((row) => row.includes(needle))

    // The usage figures read down the narrow column, one to a row.
    expect(rows.some((row) => row.includes("20% used · finish at 95%"))).toBe(true)
    // NOW sits at the foot of that column, well below the usage plan…
    expect(rowOf("─ NOW ─")).toBeGreaterThan(rowOf("YOUR USAGE PLAN"))
    // …and the problem panel is still open beside it, so nothing on the left
    // caps how much mathematics the right-hand column can show.
    expect(rows[rowOf("─ NOW ─")]).toMatch(/│\s*$/)
    // The name and the autopilot state live in the narrow column, a line each,
    // so the problem panel starts at the very top of the screen.
    expect(rowOf("THE PROBLEM BEING WORKED ON")).toBeLessThan(rowOf("YOUR USAGE PLAN"))
    expect(rowOf("◆ AUTOTAO")).toBeGreaterThan(rowOf("THE PROBLEM BEING WORKED ON"))
    expect(rowOf("AUTOPILOT ON")).toBeGreaterThan(rowOf("◆ AUTOTAO"))
  })

  test("keeps NOW below the problem in one column", async () => {
    setup = await testRender(() => <Dashboard snapshot={snapshot} width={70} height={30} autoLaunch />, { width: 70, height: 30 })
    await setup.renderOnce()
    const rows = setup.captureCharFrame().split("\n")
    const rowOf = (needle: string) => rows.findIndex((row) => row.includes(needle))

    expect(rowOf("─ NOW ─")).toBeGreaterThan(rowOf("THE PROBLEM BEING WORKED ON"))
    expect(rows.some((row) => row.includes("1h 2m elapsed · last output 8s ago"))).toBe(true)
  })

  const busy: ProjectSnapshot = {
    ...snapshot,
    problemBrief: {
      slug: "sample-problem",
      title: "Maximum independent sets in flag spheres",
      plain: "How large can an independent set be in the graph of a flag simplicial sphere? The question asks for the exact growth rate rather than an asymptotic bound.",
      activeTarget: "Prove the exact bound for every admissible dimension, with a proof that survives hostile verification.",
    },
    liveAttempt: {
      directory: "/tmp/attempt-138",
      problem: "sample-problem",
      title: "Maximum independent sets in flag spheres",
      attempt: 138,
      tier: "F",
      target: "T2",
      outcome: null,
      approaches: ["Global three-colour incidence", "Topology of carrier conflicts", "Exact empty-triangle ledger"],
      latestActivity: "The live gate is CLEAR: the defining record still claims only the weaker result, so the harness is opening three independent proof lanes and will reconcile them against the retained ledger before it writes anything down.",
    },
  }

  test("scrolls the problem text instead of clipping what does not fit", async () => {
    const { mainText, bodyRows } = dashboardMetrics(94, 31)
    const all = problemRows(busy, mainText)
    expect(all.length).toBeGreaterThan(bodyRows)
    // The last row is reachable: the end of the text lands on the last row of
    // the panel rather than one past it.
    expect(all.at(-1)?.text).toBe("Enter opens the complete work transcript")

    setup = await testRender(() => (
      <Dashboard snapshot={busy} width={94} height={31} problemOffset={0} autoLaunch />
    ), { width: 94, height: 31 })
    await setup.renderOnce()
    const top = setup.captureCharFrame()

    expect(top).toContain("WHAT THE PROBLEM IS")
    expect(top).toContain(`↑↓ 1–${bodyRows}/${all.length}`)
    expect(top).not.toContain("Enter opens the complete work transcript")
    // The heading is pinned, so a scrolled panel still says what it is about.
    expect(top).toContain("Maximum independent sets in flag spheres")
  })

  test("clamps a scroll past the end to the last screenful", async () => {
    const { mainText, bodyRows } = dashboardMetrics(94, 31)
    const all = problemRows(busy, mainText)
    setup = await testRender(() => (
      <Dashboard snapshot={busy} width={94} height={31} problemOffset={9_000} autoLaunch />
    ), { width: 94, height: 31 })
    await setup.renderOnce()
    const bottom = setup.captureCharFrame()

    expect(bottom).toContain(`↑↓ ${all.length - bodyRows + 1}–${all.length}/${all.length}`)
    expect(bottom).toContain("Enter opens the complete work transcript")
    expect(bottom).not.toContain("WHAT THE PROBLEM IS")
    expect(bottom).toContain("Maximum independent sets in flag spheres")
  })

  test("leaves the title alone when the whole problem fits", async () => {
    setup = await testRender(() => <Dashboard snapshot={snapshot} width={94} height={40} autoLaunch />, { width: 94, height: 40 })
    await setup.renderOnce()
    const frame = setup.captureCharFrame()

    expect(frame).toContain("THE PROBLEM BEING WORKED ON ─")
    expect(frame).not.toContain("↑↓ 1–")
  })

  test("explains the policy and every persistent control in product language", async () => {
    setup = await testRender(() => <Dashboard snapshot={snapshot} width={80} height={24} autoLaunch help />, { width: 80, height: 24 })
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
        height={24}
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
    setup = await testRender(() => <Dashboard snapshot={completeSnapshot} width={80} height={24} autoLaunch />, { width: 80, height: 24 })
    await setup.renderOnce()
    const frame = setup.captureCharFrame()

    expect(frame).toContain("every admissible integer without an")
    expect(frame).toContain("asymptotic escape hatch")
    expect(frame).not.toContain("T1 ACTIVE: prove the exact B(N) bou…")
  })

  test("does not repeat the AutoTao name for the native workspace", async () => {
    const nativeSnapshot: ProjectSnapshot = {
      ...snapshot,
      project: { ...snapshot.project, name: "autotao", adapter: "autotao" },
    }
    setup = await testRender(() => <Dashboard snapshot={nativeSnapshot} width={80} height={24} autoLaunch />, { width: 80, height: 24 })
    await setup.renderOnce()
    const frame = setup.captureCharFrame()

    expect(frame).toContain("◆ AUTOTAO")
    expect(frame).not.toMatch(/AUTOTAO\s+autotao/i)
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
