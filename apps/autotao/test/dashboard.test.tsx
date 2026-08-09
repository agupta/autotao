import { afterEach, describe, expect, test } from "bun:test"
import { testRender } from "@opentui/solid"
import type { TestRendererSetup } from "@opentui/core/testing"
import { Dashboard } from "../src/app.tsx"
import type { ProjectSnapshot } from "../src/protocol.ts"

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
    expect(frame).toContain("95%")
    expect(frame).not.toContain("CAMPAIGN")
  })

  test("explains the policy and every persistent control in product language", async () => {
    setup = await testRender(() => <Dashboard snapshot={snapshot} width={80} autoLaunch help />, { width: 80, height: 24 })
    await setup.renderOnce()
    const frame = setup.captureCharFrame()

    expect(frame).toContain("HOW AUTOTAO DECIDES")
    expect(frame).toContain("normal usage counts")
    expect(frame).toContain("Space pauses/resumes")
  })
})
