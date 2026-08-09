import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises"
import { join, relative } from "node:path"
import { integer, parseKeyValues } from "./parsers.ts"
import {
  SNAPSHOT_SCHEMA_VERSION,
  type AutoTaoState,
  type GateState,
  type LegacyConsoleImport,
  type ProjectSnapshot,
  type UsageTank,
} from "./protocol.ts"

async function optionalRead(path: string): Promise<string> {
  try {
    return await readFile(path, "utf8")
  } catch {
    return ""
  }
}

async function optionalMtime(path: string): Promise<number | null> {
  try {
    return (await stat(path)).mtimeMs
  } catch {
    return null
  }
}

function timestamp(value: string): number | null {
  const trimmed = value.trim()
  return /^\d+$/.test(trimmed) ? Number.parseInt(trimmed, 10) : null
}

function importedTank(id: string, label: string, used: number, burn: number, ceiling: number, hardCap: number, resetAt: number, windowMinutes: number, governed = true): UsageTank {
  return {
    id,
    label,
    used: used >= 0 ? used : null,
    burn,
    ceiling: ceiling >= 0 ? ceiling : null,
    hardCap: hardCap >= 0 ? hardCap : null,
    projected: used >= 0 ? used + burn : null,
    governed,
    finishAt: Math.min(100, Math.max(0, hardCap >= 0 ? hardCap : ceiling)),
    resetAt: resetAt > 0 ? resetAt : null,
    windowMinutes: windowMinutes > 0 ? windowMinutes : null,
  }
}

interface LegacyConsoleSample {
  imported: LegacyConsoleImport
  gate: GateState | null
  fresh: boolean
}

export async function readLegacyConsoleSample(root: string): Promise<LegacyConsoleSample> {
  const supervision = join(root, "attempts/supervision")
  const gatePath = join(supervision, ".gate.cache")
  const [gateText, gateMtime, lastLaunch, lastRefusal, processed, escalation] = await Promise.all([
    optionalRead(gatePath),
    optionalMtime(gatePath),
    optionalRead(join(supervision, ".last-launch")),
    optionalRead(join(supervision, ".last-refusal")),
    optionalRead(join(supervision, ".processed")),
    optionalRead(join(supervision, "ESCALATE")),
  ])
  const values = parseKeyValues(gateText)
  const engine = values.USAGE_ENGINE || null
  const uncapped = values.USAGE_UNCAPPED === "1"
  const sampledAt = gateMtime == null ? null : new Date(gateMtime).toISOString()
  const imported: LegacyConsoleImport = {
    importedAt: new Date().toISOString(),
    gateCacheSampledAt: sampledAt,
    engine,
    modelKey: values.USAGE_MODEL_KEY || null,
    resetAt: integer(values.USAGE_RESET_AT) >= 0 ? integer(values.USAGE_RESET_AT) : null,
    uncapped,
    lastLaunchAt: timestamp(lastLaunch),
    lastRefusalAt: timestamp(lastRefusal),
    processedLog: processed.trim() ? relative(root, join(root, processed.trim())) : null,
    escalationPending: escalation.trim().length > 0,
  }

  if (!engine || gateMtime == null) return { imported, gate: null, fresh: false }
  const usageRc = integer(values.USAGE_RC, integer(values.GATE_RC, 3))
  const gateRc = integer(values.GATE_RC, usageRc)
  const capacityRc = integer(values.CAP_RC, 0)
  const burnWeek = integer(values.USAGE_BURN_WEEK, 0)
  const ceilingWeek = integer(values.USAGE_CEIL_WEEK)
  const tanks: UsageTank[] = []
  if (engine === "codex") {
    tanks.push(importedTank("weekly", "Weekly allowance", integer(values.USAGE_WEEK), burnWeek, uncapped ? 100 : ceilingWeek, integer(values.USAGE_HARD_CAP_WEEK, uncapped ? 100 : ceilingWeek), integer(values.USAGE_RESET_AT), integer(values.USAGE_WINDOW_MIN)))
  } else {
    tanks.push(importedTank("session", "Current 5-hour window", integer(values.USAGE_SESSION), integer(values.USAGE_BURN_SESSION, 0), integer(values.USAGE_CEIL_SESSION), integer(values.USAGE_HARD_CAP_SESSION, integer(values.USAGE_CEIL_SESSION)), integer(values.USAGE_SESSION_RESET_AT), 300))
    tanks.push(importedTank("weekly", "Weekly allowance", integer(values.USAGE_WEEK), burnWeek, ceilingWeek, integer(values.USAGE_HARD_CAP_WEEK, ceilingWeek), integer(values.USAGE_WEEK_RESET_AT), 10_080))
    const modelWeek = values.USAGE_MODEL_WEEK
    tanks.push(importedTank("model-week", `Weekly · ${values.USAGE_MODEL_KEY ?? "model"}`, modelWeek === "n/a" ? -1 : integer(modelWeek), burnWeek, ceilingWeek, integer(values.USAGE_HARD_CAP_WEEK, ceilingWeek), integer(values.USAGE_WEEK_RESET_AT), 10_080, modelWeek !== "n/a"))
  }
  const phase = gateRc === 0 && capacityRc === 0 ? "open" : usageRc === 3 ? "unknown" : "closed"
  const reason = values.USAGE_REASON || values.CAP_REASON || (phase === "open" ? "All launch checks pass" : `gate rc=${gateRc}, capacity rc=${capacityRc}`)
  const cacheAge = Math.max(0, Math.floor((Date.now() - gateMtime) / 1000))
  const gate: GateState = {
    phase,
    health: phase === "open" ? "healthy" : phase === "unknown" ? "warning" : "critical",
    usageRc,
    capacityRc,
    reason,
    source: "legacy-console-cache",
    sampleAgeSeconds: cacheAge + Math.max(0, integer(values.USAGE_AGE, 0)),
    uncapped,
    policy: { reservePercent: 0, pace: "eager" },
    tanks,
  }
  return { imported, gate, fresh: cacheAge <= 120 }
}

export function overlayLegacyConsoleSample(snapshot: ProjectSnapshot, sample: LegacyConsoleSample): ProjectSnapshot {
  if (!sample.fresh || !sample.gate || !sample.imported.engine) return snapshot
  const alerts = snapshot.alerts.filter((alert) => alert !== snapshot.gate.reason)
  if (sample.gate.phase === "unknown" && !alerts.includes(sample.gate.reason)) alerts.push(sample.gate.reason)
  return {
    ...snapshot,
    engine: sample.imported.engine,
    model: sample.imported.engine === "codex" && snapshot.engine !== "codex" ? "configured default" : snapshot.model,
    gate: {
      ...sample.gate,
      policy: snapshot.gate.policy,
      tanks: sample.gate.tanks.map((tank) => {
        const live = snapshot.gate.tanks.find((candidate) => candidate.id === tank.id)
        return {
          ...tank,
          hardCap: tank.hardCap ?? live?.hardCap ?? null,
          finishAt: Math.min(tank.finishAt, live?.finishAt ?? tank.finishAt),
          resetAt: tank.resetAt ?? live?.resetAt ?? null,
          windowMinutes: tank.windowMinutes ?? live?.windowMinutes ?? null,
        }
      }),
    },
    alerts,
  }
}

export class LocalStateStore {
  readonly directory: string
  readonly path: string

  constructor(private readonly root: string) {
    this.directory = join(root, ".autotao")
    this.path = join(this.directory, "state.json")
  }

  async read(): Promise<AutoTaoState | null> {
    try {
      return JSON.parse(await readFile(this.path, "utf8")) as AutoTaoState
    } catch {
      return null
    }
  }

  private async write(state: AutoTaoState): Promise<void> {
    await mkdir(this.directory, { recursive: true, mode: 0o700 })
    const temporary = join(this.directory, `.state.${process.pid}.${Date.now()}.tmp`)
    await writeFile(temporary, `${JSON.stringify(state, null, 2)}\n`, { encoding: "utf8", mode: 0o600 })
    await rename(temporary, this.path)
  }

  async updateSnapshot(snapshot: ProjectSnapshot): Promise<AutoTaoState> {
    const previous = await this.read()
    const state: AutoTaoState = {
      schemaVersion: SNAPSHOT_SCHEMA_VERSION,
      updatedAt: new Date().toISOString(),
      snapshot,
      legacyImport: previous?.legacyImport ?? null,
    }
    await this.write(state)
    return state
  }

  async importLegacy(snapshot: ProjectSnapshot, legacyImport: LegacyConsoleImport): Promise<AutoTaoState> {
    const state: AutoTaoState = {
      schemaVersion: SNAPSHOT_SCHEMA_VERSION,
      updatedAt: new Date().toISOString(),
      snapshot,
      legacyImport,
    }
    await this.write(state)
    return state
  }
}
