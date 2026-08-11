import { afterEach, describe, expect, test } from "bun:test"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { discoverConfigChoices, loadConfig } from "../src/config.ts"

const roots: string[] = []
const originalEnvironment = {
  AUTOTAO_CONFIG: process.env.AUTOTAO_CONFIG,
  AUTOTAO_HOME: process.env.AUTOTAO_HOME,
  AUTOTAO_SCOPE: process.env.AUTOTAO_SCOPE,
  XDG_CONFIG_HOME: process.env.XDG_CONFIG_HOME,
}

afterEach(async () => {
  for (const [key, value] of Object.entries(originalEnvironment)) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
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
    expect(loaded.config.usage).toEqual({ reservePercent: 10, pace: "even" })
  })

  test("defaults the solving agents to fable at xhigh", async () => {
    const loaded = await project({
      schemaVersion: 1,
      project: { name: "example", adapter: "autotao" },
    })

    expect(loaded.config.model).toBe("claude-fable-5")
    expect(loaded.config.effort).toBe("xhigh")
  })

  test("takes model and effort from autotao.json", async () => {
    const loaded = await project({
      schemaVersion: 1,
      project: { name: "example", adapter: "autotao" },
      model: "claude-opus-5",
      effort: "max",
    })

    expect(loaded.config.model).toBe("claude-opus-5")
    expect(loaded.config.effort).toBe("max")
  })

  // A blank model must not load: it would be exported as RUN_MODEL="", which
  // ${RUN_MODEL:-...} cannot distinguish from unset, so the run would quietly fall
  // through to a different model than the operator configured.
  test("rejects a blank model, a retired adapter, and an unknown effort", async () => {
    await expect(
      project({ schemaVersion: 1, project: { name: "e", adapter: "autotao" }, model: "   " }),
    ).rejects.toThrow(/model must be a non-empty string/)

    await expect(
      project({ schemaVersion: 1, project: { name: "e", adapter: "legacy-new-math" } }),
    ).rejects.toThrow(/Unsupported adapter/)

    await expect(
      project({ schemaVersion: 1, project: { name: "e", adapter: "autotao" }, effort: "ultra" }),
    ).rejects.toThrow(/effort must be one of/)
  })

  test("accepts an explicit autonomous policy", async () => {
    const loaded = await project({
      schemaVersion: 1,
      engine: "codex",
      project: { name: "research", adapter: "autotao" },
      automation: { autoLaunch: true, launchIntervalMs: 120_000, tickIntervalMs: 900_000 },
      usage: { reservePercent: 10, pace: "even" },
    })

    expect(loaded.config.project.adapter).toBe("autotao")
    expect(loaded.config.engine).toBe("codex")
    expect(loaded.config.automation.autoLaunch).toBe(true)
    expect(loaded.config.automation.tickIntervalMs).toBe(900_000)
    expect(loaded.config.usage.reservePercent).toBe(10)
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

  test("discovers distinct global and local state profiles", async () => {
    const globalHome = await mkdtemp(join(tmpdir(), "autotao-global-"))
    const localHome = await mkdtemp(join(tmpdir(), "autotao-local-"))
    roots.push(globalHome, localHome)
    const globalWorkspace = join(globalHome, ".autotao", "workspace")
    await mkdir(globalWorkspace, { recursive: true })
    await writeFile(join(globalWorkspace, "autotao.json"), "{}\n")
    await writeFile(join(localHome, "autotao.json"), "{}\n")
    process.env.AUTOTAO_HOME = globalHome

    const choices = await discoverConfigChoices(localHome)

    expect(choices.global).toBe(join(globalWorkspace, "autotao.json"))
    expect(choices.local).toBe(join(localHome, "autotao.json"))
    expect(choices.globalHome).toBe(globalHome)
  })

  test("discovers the registered machine-global profile", async () => {
    const root = await mkdtemp(join(tmpdir(), "autotao-registration-"))
    roots.push(root)
    const globalHome = join(root, "global")
    const globalWorkspace = join(globalHome, ".autotao", "workspace")
    const configHome = join(root, "config")
    const localHome = join(root, "local")
    await mkdir(globalWorkspace, { recursive: true })
    await mkdir(join(configHome, "autotao"), { recursive: true })
    await mkdir(localHome, { recursive: true })
    await writeFile(join(globalWorkspace, "autotao.json"), "{}\n")
    await writeFile(join(configHome, "autotao", "home"), `${globalHome}\n`)
    await writeFile(join(localHome, "autotao.json"), "{}\n")
    delete process.env.AUTOTAO_HOME
    process.env.XDG_CONFIG_HOME = configHome

    const choices = await discoverConfigChoices(localHome)

    expect(choices.global).toBe(join(globalWorkspace, "autotao.json"))
    expect(choices.local).toBe(join(localHome, "autotao.json"))
    expect(choices.globalHome).toBe(globalHome)
  })

  test("honors explicit global and local scope", async () => {
    const globalHome = await mkdtemp(join(tmpdir(), "autotao-global-"))
    const localHome = await mkdtemp(join(tmpdir(), "autotao-local-"))
    roots.push(globalHome, localHome)
    const globalWorkspace = join(globalHome, ".autotao", "workspace")
    await mkdir(globalWorkspace, { recursive: true })
    await writeFile(join(globalWorkspace, "autotao.json"), `${JSON.stringify({
      schemaVersion: 1,
      project: { name: "global", adapter: "autotao" },
    })}\n`)
    await writeFile(join(localHome, "autotao.json"), `${JSON.stringify({
      schemaVersion: 1,
      project: { name: "local", adapter: "autotao" },
    })}\n`)
    process.env.AUTOTAO_HOME = globalHome

    process.env.AUTOTAO_SCOPE = "global"
    expect((await loadConfig(localHome)).config.project.name).toBe("global")
    process.env.AUTOTAO_SCOPE = "local"
    expect((await loadConfig(localHome)).config.project.name).toBe("local")
  })
})
