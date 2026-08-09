import { access, readFile } from "node:fs/promises"
import { dirname, join, parse, resolve } from "node:path"
import type { ProjectAdapter } from "./protocol.ts"

export interface AutoTaoConfig {
  schemaVersion: 1
  engine: "claude" | "codex"
  project: {
    name: string
    adapter: ProjectAdapter
  }
  refreshMs: number
  automation: {
    autoLaunch: boolean
    launchIntervalMs: number
    tickIntervalMs: number
  }
  usage: {
    reservePercent: number
    pace: "even" | "eager"
  }
  commands: {
    launch: string[]
    tick: string[]
  }
}

export interface LoadedConfig {
  config: AutoTaoConfig
  path: string
  root: string
}

const defaults = {
  engine: "claude",
  refreshMs: 5000,
  automation: {
    autoLaunch: false,
    launchIntervalMs: 600_000,
    tickIntervalMs: 0,
  },
  usage: {
    reservePercent: 5,
    pace: "even" as const,
  },
  commands: {
    launch: ["bash", "scripts/launch.sh"],
    tick: ["bash", "scripts/supervisor-tick.sh"],
  },
} as const

async function exists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

export async function findConfig(start = process.cwd()): Promise<string> {
  let cursor = resolve(start)
  const filesystemRoot = parse(cursor).root
  while (true) {
    // A checkout can remain a clean, publishable application repository while
    // all operator-owned mathematics lives in its ignored private workspace.
    // Prefer that workspace transparently when it has been initialized.
    const workspaceCandidate = join(cursor, ".autotao", "workspace", "autotao.json")
    if (await exists(workspaceCandidate)) return workspaceCandidate
    const candidate = join(cursor, "autotao.json")
    if (await exists(candidate)) return candidate
    if (cursor === filesystemRoot) break
    cursor = dirname(cursor)
  }
  throw new Error(`No autotao.json found from ${resolve(start)} upward`)
}

function command(value: unknown, fallback: readonly string[], key: string): string[] {
  const candidate = value ?? fallback
  if (!Array.isArray(candidate) || candidate.length === 0 || candidate.some((part) => typeof part !== "string" || part.length === 0)) {
    throw new Error(`autotao.json commands.${key} must be a non-empty string array`)
  }
  return [...candidate]
}

function interval(value: unknown, fallback: number, key: string, allowDisabled = false): number {
  const candidate = value ?? fallback
  const minimum = allowDisabled && candidate === 0 ? 0 : 60_000
  if (!Number.isInteger(candidate) || Number(candidate) < minimum || Number(candidate) > 86_400_000) {
    const disabled = allowDisabled ? "0 (disabled) or " : ""
    throw new Error(`autotao.json automation.${key} must be ${disabled}an integer from 60000 to 86400000`)
  }
  return Number(candidate)
}

export async function loadConfig(start = process.cwd()): Promise<LoadedConfig> {
  const path = await findConfig(start)
  const raw = JSON.parse(await readFile(path, "utf8")) as Record<string, unknown>
  const project = raw.project as Record<string, unknown> | undefined

  if (raw.schemaVersion !== 1) throw new Error(`Unsupported AutoTao schema version: ${String(raw.schemaVersion)}`)
  if (!project || typeof project.name !== "string" || project.name.length === 0) {
    throw new Error("autotao.json project.name must be a non-empty string")
  }
  if (project.adapter !== "autotao" && project.adapter !== "legacy-new-math") {
    throw new Error(`Unsupported adapter: ${String(project.adapter)}`)
  }
  const engine = raw.engine ?? defaults.engine
  if (engine !== "claude" && engine !== "codex") {
    throw new Error(`autotao.json engine must be claude or codex, got: ${String(engine)}`)
  }

  const refreshMs = raw.refreshMs ?? defaults.refreshMs
  if (!Number.isInteger(refreshMs) || Number(refreshMs) < 1000 || Number(refreshMs) > 60000) {
    throw new Error("autotao.json refreshMs must be an integer from 1000 to 60000")
  }

  const commands = (raw.commands ?? {}) as Record<string, unknown>
  const automation = (raw.automation ?? {}) as Record<string, unknown>
  const usage = (raw.usage ?? {}) as Record<string, unknown>
  const autoLaunch = automation.autoLaunch ?? defaults.automation.autoLaunch
  if (typeof autoLaunch !== "boolean") throw new Error("autotao.json automation.autoLaunch must be a boolean")
  const reservePercent = usage.reservePercent ?? defaults.usage.reservePercent
  if (!Number.isInteger(reservePercent) || Number(reservePercent) < 0 || Number(reservePercent) > 90) {
    throw new Error("autotao.json usage.reservePercent must be an integer from 0 to 90")
  }
  const pace = usage.pace ?? defaults.usage.pace
  if (pace !== "even" && pace !== "eager") {
    throw new Error("autotao.json usage.pace must be even or eager")
  }
  return {
    path,
    root: dirname(path),
    config: {
      schemaVersion: 1,
      engine,
      project: { name: project.name, adapter: project.adapter },
      refreshMs: Number(refreshMs),
      automation: {
        autoLaunch,
        launchIntervalMs: interval(automation.launchIntervalMs, defaults.automation.launchIntervalMs, "launchIntervalMs"),
        tickIntervalMs: interval(automation.tickIntervalMs, defaults.automation.tickIntervalMs, "tickIntervalMs", true),
      },
      usage: { reservePercent: Number(reservePercent), pace },
      commands: {
        launch: command(commands.launch, defaults.commands.launch, "launch"),
        tick: command(commands.tick, defaults.commands.tick, "tick"),
      },
    },
  }
}
