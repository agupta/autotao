import { afterEach, describe, expect, test } from "bun:test"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { loadConfig } from "../src/config.ts"
import { RepositoryController } from "../src/repository.ts"

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

// The launch command is replaced with a probe that simply reports the environment it
// was handed. This is the contract that actually matters: autotao.json is only "the one
// place" if what it says reaches the process that spawns the solving agent. Asserting
// on the parsed config alone would pass even if the export were dropped.
async function launchWith(overrides: Record<string, unknown>) {
  const root = await mkdtemp(join(tmpdir(), "autotao-runcfg-"))
  roots.push(root)
  await writeFile(
    join(root, "autotao.json"),
    `${JSON.stringify({
      schemaVersion: 1,
      project: { name: "example", adapter: "autotao" },
      commands: {
        launch: ["bash", "-c", "echo engine=$RUN_ENGINE model=$RUN_MODEL effort=$RUN_EFFORT"],
        tick: ["bash", "-c", "true"],
      },
      ...overrides,
    })}\n`,
  )
  const loaded = await loadConfig(root)
  const controller = new RepositoryController(loaded.root, loaded.config)
  return await controller.launch()
}

describe("run configuration reaches the spawned command", () => {
  test("exports the configured engine, model and effort", async () => {
    const result = await launchWith({ engine: "claude", model: "claude-fable-5", effort: "xhigh" })

    expect(result.ok).toBe(true)
    expect(result.output).toContain("engine=claude")
    expect(result.output).toContain("model=claude-fable-5")
    expect(result.output).toContain("effort=xhigh")
  })

  test("exports a non-default selection rather than the built-in fallback", async () => {
    const result = await launchWith({ engine: "codex", model: "claude-opus-5", effort: "low" })

    expect(result.output).toContain("engine=codex")
    expect(result.output).toContain("model=claude-opus-5")
    expect(result.output).toContain("effort=low")
  })

  // run-model.sh reads ${RUN_MODEL:-...}, which treats empty and unset identically, so
  // an exported blank would silently resolve to something else entirely.
  test("never exports an empty model or effort", async () => {
    const result = await launchWith({})

    expect(result.output).not.toContain("model=\n")
    expect(result.output).toMatch(/model=\S+/)
    expect(result.output).toMatch(/effort=\S+/)
  })
})
