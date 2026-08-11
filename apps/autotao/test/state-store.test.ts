import { afterEach, describe, expect, test } from "bun:test"
import { mkdtemp, readdir, rm, stat } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { ProjectSnapshot } from "../src/protocol.ts"
import { LocalStateStore } from "../src/state-store.ts"

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

function snapshot(root: string): ProjectSnapshot {
  return {
    schemaVersion: 1,
    sampledAt: "2026-08-09T02:00:00.000Z",
    project: { name: "autotao", root, adapter: "autotao" },
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

describe("local state store", () => {
  test("persists the snapshot owner-only, atomically, leaving no temp files", async () => {
    const root = await mkdtemp(join(tmpdir(), "autotao-state-"))
    roots.push(root)

    const store = new LocalStateStore(root)
    await store.updateSnapshot(snapshot(root))

    const persisted = await store.read()
    expect(persisted?.schemaVersion).toBe(1)
    expect(persisted?.snapshot.engine).toBe("claude")
    expect((await stat(store.path)).mode & 0o777).toBe(0o600)
    expect((await readdir(store.directory)).filter((name) => name.endsWith(".tmp"))).toEqual([])
  })

  test("read returns null when nothing has been persisted", async () => {
    const root = await mkdtemp(join(tmpdir(), "autotao-state-"))
    roots.push(root)
    expect(await new LocalStateStore(root).read()).toBeNull()
  })
})
