import { afterEach, describe, expect, test } from "bun:test"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { loadConfig } from "../src/config.ts"
import { RepositoryController } from "../src/repository.ts"

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe("repository settings", () => {
  test("atomically persists the plain-language usage policy", async () => {
    const root = await mkdtemp(join(tmpdir(), "autotao-repository-"))
    roots.push(root)
    await writeFile(join(root, "autotao.json"), `${JSON.stringify({
      schemaVersion: 1,
      engine: "claude",
      project: { name: "test", adapter: "autotao" },
      usage: { reservePercent: 5, pace: "even" },
    })}\n`)
    const loaded = await loadConfig(root)
    const controller = new RepositoryController(root, loaded.config)

    const result = await controller.updateUsagePolicy({ reservePercent: 20, pace: "eager" })
    const saved = JSON.parse(await readFile(join(root, "autotao.json"), "utf8"))

    expect(result.ok).toBe(true)
    expect(saved.usage).toEqual({ reservePercent: 20, pace: "eager" })
    expect(loaded.config.usage).toEqual({ reservePercent: 20, pace: "eager" })
  })

  test("rejects invalid reserve without rewriting configuration", async () => {
    const root = await mkdtemp(join(tmpdir(), "autotao-repository-"))
    roots.push(root)
    const path = join(root, "autotao.json")
    const original = `${JSON.stringify({ schemaVersion: 1, project: { name: "test", adapter: "autotao" } })}\n`
    await writeFile(path, original)
    const loaded = await loadConfig(root)
    const controller = new RepositoryController(root, loaded.config)

    const result = await controller.updateUsagePolicy({ reservePercent: 95, pace: "even" })

    expect(result.ok).toBe(false)
    expect(await readFile(path, "utf8")).toBe(original)
  })
})
