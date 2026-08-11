import { access, readFile } from "node:fs/promises"
import { homedir } from "node:os"
import { dirname, join, parse, resolve, sep } from "node:path"
import type { ProjectAdapter } from "./protocol.ts"

export const RUN_EFFORTS = ["low", "medium", "high", "xhigh", "max"] as const
export type RunEffort = (typeof RUN_EFFORTS)[number]

export interface AutoTaoConfig {
  schemaVersion: 1
  engine: "claude" | "codex"
  /**
   * What the solving agents actually run as. Both are exported into every spawned
   * command's environment (RepositoryController.run), where run-model.sh and
   * run-once.sh already prefer $RUN_MODEL / $RUN_EFFORT over their own fallbacks.
   * Configuring them here is the point: engine, model and effort used to live in
   * three separate places (this file, LOOP_STATE.md's `run_model:`, and a hardcoded
   * default inside run-once.sh), so the model an operator thought they had selected
   * was not necessarily the one that ran.
   */
  model: string
  effort: RunEffort
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

export type ConfigScope = "global" | "local"

export interface ConfigChoices {
  global: string | null
  local: string | null
  globalHome: string | null
}

const defaults = {
  engine: "claude",
  model: "claude-fable-5",
  effort: "xhigh" as const,
  refreshMs: 5000,
  automation: {
    autoLaunch: false,
    launchIntervalMs: 600_000,
    tickIntervalMs: 0,
  },
  usage: {
    reservePercent: 10,
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

async function findUpward(start: string, relative: string[]): Promise<string | null> {
  let cursor = resolve(start)
  const filesystemRoot = parse(cursor).root
  while (true) {
    const candidate = join(cursor, ...relative)
    if (await exists(candidate)) return candidate
    if (cursor === filesystemRoot) return null
    cursor = dirname(cursor)
  }
}

async function registeredHome(): Promise<string | null> {
  const configRoot = process.env.XDG_CONFIG_HOME
    ? resolve(process.env.XDG_CONFIG_HOME)
    : join(homedir(), ".config")
  try {
    const value = (await readFile(join(configRoot, "autotao", "home"), "utf8")).trim()
    return value ? resolve(value) : null
  } catch {
    return null
  }
}

export async function discoverConfigChoices(start = process.cwd()): Promise<ConfigChoices> {
  const local = await findUpward(start, ["autotao.json"])
  const upwardWorkspace = await findUpward(start, [".autotao", "workspace", "autotao.json"])
  const configuredHome = process.env.AUTOTAO_HOME
    ? resolve(process.env.AUTOTAO_HOME)
    : await registeredHome()
  const configuredGlobal = configuredHome
    ? join(configuredHome, ".autotao", "workspace", "autotao.json")
    : null
  const global = configuredGlobal && await exists(configuredGlobal)
    ? configuredGlobal
    : upwardWorkspace
  const globalHome = global ? dirname(dirname(dirname(global))) : null
  return {
    global,
    local: local && resolve(local) !== resolve(global ?? "") ? local : null,
    globalHome,
  }
}

export function isInside(path: string, parent: string): boolean {
  const candidate = resolve(path)
  const root = resolve(parent)
  return candidate === root || candidate.startsWith(`${root}${sep}`)
}

export async function findConfig(start = process.cwd()): Promise<string> {
  const explicit = process.env.AUTOTAO_CONFIG
  if (explicit) {
    const path = resolve(explicit)
    if (!await exists(path)) throw new Error(`AUTOTAO_CONFIG does not exist: ${path}`)
    return path
  }
  const requestedScope = process.env.AUTOTAO_SCOPE
  if (requestedScope && requestedScope !== "global" && requestedScope !== "local") {
    throw new Error(`AUTOTAO_SCOPE must be global or local, got: ${requestedScope}`)
  }
  if (requestedScope) {
    const choices = await discoverConfigChoices(start)
    const scope = requestedScope as ConfigScope
    const selected = choices[scope]
    if (!selected) throw new Error(`No ${requestedScope} AutoTao state is available from ${resolve(start)}`)
    return selected
  }
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
  // autotao.json is deliberately untracked (see .gitignore), so a fresh clone has
  // none and this is the first thing a new user hits. Say how to fix it rather than
  // only what is missing.
  const example = join(resolve(start), "autotao.example.json")
  const hint = (await exists(example))
    ? `\n  cp autotao.example.json autotao.json    # then edit engine / model / effort`
    : ""
  throw new Error(
    `No autotao.json found from ${resolve(start)} upward.` +
      ` It is machine-local and not tracked in git; copy the example to create one:${hint}`,
  )
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

export async function loadConfig(start = process.cwd(), selectedPath?: string): Promise<LoadedConfig> {
  const path = selectedPath ? resolve(selectedPath) : await findConfig(start)
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

  // Reject an empty/blank model rather than exporting RUN_MODEL="" — an empty env var
  // is indistinguishable from "unset" to run-model.sh's ${RUN_MODEL:-...}, so a typo
  // here would silently fall through to the LOOP_STATE.md value this is meant to
  // supersede, and the operator would never learn their setting had been ignored.
  const model = raw.model ?? defaults.model
  if (typeof model !== "string" || model.trim().length === 0) {
    throw new Error("autotao.json model must be a non-empty string (a full model id, e.g. claude-fable-5)")
  }
  const effort = raw.effort ?? defaults.effort
  if (!RUN_EFFORTS.includes(effort as RunEffort)) {
    throw new Error(`autotao.json effort must be one of ${RUN_EFFORTS.join("|")}, got: ${String(effort)}`)
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
  if (!Number.isInteger(reservePercent) || Number(reservePercent) < 5 || Number(reservePercent) > 90) {
    throw new Error("autotao.json usage.reservePercent must be an integer from 5 to 90")
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
      model: model.trim(),
      effort: effort as RunEffort,
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
