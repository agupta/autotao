import { afterEach, describe, expect, test } from "bun:test"
import { mkdir, mkdtemp, readdir, rm, stat, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { ProjectSnapshot } from "../src/protocol.ts"
import { LocalStateStore, overlayLegacyConsoleSample, readLegacyConsoleSample } from "../src/state-store.ts"

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

function snapshot(root: string): ProjectSnapshot {
  return {
    schemaVersion: 1,
    sampledAt: "2026-08-09T02:00:00.000Z",
    project: { name: "new-math", root, adapter: "legacy-new-math" },
    engine: "claude",
    model: "claude-opus-5",
    run: { phase: "idle", pid: null, elapsedSeconds: null, lastWriteSeconds: 5, newestLog: "latest.log", newestLogBytes: 10 },
    gate: {
      phase: "unknown",
      health: "warning",
      usageRc: 3,
      capacityRc: 0,
      reason: "stale direct meter",
      source: "statusline",
      sampleAgeSeconds: 999,
      uncapped: false,
      policy: { reservePercent: 5, pace: "even" },
      tanks: [],
    },
    resources: { availableMemoryMb: 4096, loadAverage: [0.1, 0.2, 0.3], papersWanted: [] },
    ledger: null,
    pipeline: [],
    alerts: ["stale direct meter"],
  }
}

describe("legacy console state import", () => {
  test("whitelists, overlays, and atomically persists console state", async () => {
    const root = await mkdtemp(join(tmpdir(), "autotao-state-"))
    roots.push(root)
    const supervision = join(root, "attempts/supervision")
    await mkdir(supervision, { recursive: true })
    await writeFile(join(supervision, ".gate.cache"), `USAGE_ENGINE=codex
USAGE_WEEK=33
USAGE_MODEL_KEY=codex
USAGE_BURN_WEEK=5
USAGE_CEIL_WEEK=100
USAGE_UNCAPPED=1
USAGE_RC=0
USAGE_REASON=''
GATE_RC=0
CAP_RC=4
CAP_REASON=a\\ run\\ is\\ already\\ alive
USAGE_RESET_AT=1786827306
USAGE_AGE=0
`)
    await writeFile(join(supervision, ".last-launch"), "1786241095\n")
    await writeFile(join(supervision, ".processed"), "attempts/raw-logs/example.log\n")

    const sample = await readLegacyConsoleSample(root)
    expect(sample.fresh).toBe(true)
    expect(sample.imported.engine).toBe("codex")
    expect(sample.imported.resetAt).toBe(1786827306)
    expect(sample.gate?.reason).toBe("a run is already alive")

    const merged = overlayLegacyConsoleSample(snapshot(root), sample)
    expect(merged.engine).toBe("codex")
    expect(merged.model).toBe("configured default")
    expect(merged.gate.phase).toBe("closed")
    expect(merged.gate.uncapped).toBe(true)
    expect(merged.gate.policy).toEqual({ reservePercent: 5, pace: "even" })
    expect(merged.alerts).toEqual([])

    const store = new LocalStateStore(root)
    await store.importLegacy(merged, sample.imported)
    const persisted = await store.read()
    expect(persisted?.snapshot.engine).toBe("codex")
    expect(persisted?.legacyImport?.processedLog).toBe("attempts/raw-logs/example.log")
    expect((await stat(store.path)).mode & 0o777).toBe(0o600)
    expect((await readdir(store.directory)).filter((name) => name.endsWith(".tmp"))).toEqual([])
  })
})
