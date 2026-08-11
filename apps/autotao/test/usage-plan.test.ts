import { describe, expect, test } from "bun:test"
import type { GateState, UsageTank } from "../src/protocol.ts"
import { paceAt, usageRunway } from "../src/usage-plan.ts"

const start = Date.UTC(2026, 0, 1)
const resetAt = (start + 7 * 24 * 60 * 60 * 1000) / 1000

function tank(used: number, burn = 5): UsageTank {
  return {
    id: "weekly",
    label: "Weekly allowance",
    used,
    burn,
    ceiling: 90,
    hardCap: 100,
    projected: used + burn,
    governed: true,
    finishAt: 95,
    resetAt,
    windowMinutes: 10_080,
  }
}

function gate(usageTank: UsageTank, pace: "even" | "eager" = "even"): GateState {
  return {
    phase: "open",
    health: "healthy",
    usageRc: 0,
    capacityRc: 0,
    reason: "All launch checks pass",
    source: "test",
    sampleAgeSeconds: 0,
    uncapped: false,
    policy: { reservePercent: 5, pace },
    tanks: [usageTank],
  }
}

describe("usage runway", () => {
  test("paces toward the finish line over the meter window", () => {
    const halfway = start + 3.5 * 24 * 60 * 60 * 1000
    expect(paceAt(tank(40), "even", halfway)).toBeCloseTo(47.5)
    expect(usageRunway(gate(tank(40)), halfway).nextRunFits).toBe(true)
    expect(usageRunway(gate(tank(45)), halfway).nextRunFits).toBe(false)
  })

  test("eager mode uses all headroom immediately", () => {
    expect(paceAt(tank(80), "eager", start)).toBe(95)
    expect(usageRunway(gate(tank(80), "eager"), start).nextRunFits).toBe(true)
  })

  test("matches the shell gate by refusing a run that lands exactly on the ceiling", () => {
    expect(usageRunway(gate(tank(85), "eager"), start).nextRunFits).toBe(false)
  })

  test("falls back to the finish line when reset metadata is unavailable", () => {
    const withoutReset = { ...tank(80), resetAt: null, windowMinutes: null }
    expect(paceAt(withoutReset, "even", start)).toBe(95)
  })
})
