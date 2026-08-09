import { afterEach, describe, expect, test } from "bun:test"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { loadConfig } from "../src/config.ts"

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

async function project(config: Record<string, unknown>) {
  const root = await mkdtemp(join(tmpdir(), "autotao-config-"))
  roots.push(root)
  await writeFile(join(root, "autotao.json"), `${JSON.stringify(config)}\n`)
  return await loadConfig(root)
}

describe("project configuration", () => {
  test("loads the native adapter with safe automation defaults", async () => {
    const loaded = await project({
      schemaVersion: 1,
      project: { name: "example", adapter: "autotao" },
    })

    expect(loaded.config.project.adapter).toBe("autotao")
    expect(loaded.config.engine).toBe("claude")
    expect(loaded.config.automation).toEqual({
      autoLaunch: false,
      launchIntervalMs: 600_000,
      tickIntervalMs: 0,
    })
    expect(loaded.config.usage).toEqual({ reservePercent: 5, pace: "even" })
  })

  test("retains the migration alias and explicit autonomous policy", async () => {
    const loaded = await project({
      schemaVersion: 1,
      engine: "codex",
      project: { name: "new-math", adapter: "legacy-new-math" },
      automation: { autoLaunch: true, launchIntervalMs: 120_000, tickIntervalMs: 900_000 },
      usage: { reservePercent: 0, pace: "even" },
    })

    expect(loaded.config.project.adapter).toBe("legacy-new-math")
    expect(loaded.config.engine).toBe("codex")
    expect(loaded.config.automation.autoLaunch).toBe(true)
    expect(loaded.config.automation.tickIntervalMs).toBe(900_000)
    expect(loaded.config.usage.reservePercent).toBe(0)
  })

  test("prefers an ignored private workspace over the distributable template", async () => {
    const root = await mkdtemp(join(tmpdir(), "autotao-config-"))
    roots.push(root)
    await writeFile(join(root, "autotao.json"), `${JSON.stringify({
      schemaVersion: 1,
      project: { name: "public-template", adapter: "autotao" },
    })}\n`)
    const workspace = join(root, ".autotao", "workspace")
    await mkdir(workspace, { recursive: true })
    await writeFile(join(workspace, "autotao.json"), `${JSON.stringify({
      schemaVersion: 1,
      engine: "codex",
      project: { name: "private-project", adapter: "autotao" },
    })}\n`)

    const loaded = await loadConfig(join(root, "apps", "autotao"))

    expect(loaded.root).toBe(workspace)
    expect(loaded.path).toBe(join(workspace, "autotao.json"))
    expect(loaded.config.project.name).toBe("private-project")
    expect(loaded.config.engine).toBe("codex")
  })
})
