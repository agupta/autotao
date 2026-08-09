export const SNAPSHOT_SCHEMA_VERSION = 1 as const

export type ProjectAdapter = "autotao" | "legacy-new-math"

export type Health = "healthy" | "warning" | "critical" | "unknown"
export type RunPhase = "running" | "idle" | "stale-lock"
export type GatePhase = "open" | "closed" | "unknown"

export interface UsageTank {
  id: string
  label: string
  used: number | null
  burn: number
  ceiling: number | null
  hardCap: number | null
  projected: number | null
  governed: boolean
  finishAt: number
  resetAt: number | null
  windowMinutes: number | null
}

export interface RunState {
  phase: RunPhase
  pid: number | null
  elapsedSeconds: number | null
  lastWriteSeconds: number | null
  newestLog: string | null
  newestLogBytes: number | null
}

export interface GateState {
  phase: GatePhase
  health: Health
  usageRc: number
  capacityRc: number
  reason: string
  source: string | null
  sampleAgeSeconds: number | null
  uncapped: boolean
  policy: {
    reservePercent: number
    pace: "even" | "eager"
  }
  tanks: UsageTank[]
}

export interface ResourceState {
  availableMemoryMb: number
  loadAverage: [number, number, number]
  papersWanted: Array<{ key: string; reason: string }>
}

export interface LedgerState {
  date: string
  model: string
  problem: string
  target: string
  duration: string
  verdict: string
  outcome: string
}

export interface PipelineEvent {
  timestamp: string
  message: string
}

export interface ProjectSnapshot {
  schemaVersion: typeof SNAPSHOT_SCHEMA_VERSION
  sampledAt: string
  project: {
    name: string
    root: string
    adapter: ProjectAdapter
  }
  engine: string
  model: string
  run: RunState
  gate: GateState
  resources: ResourceState
  ledger: LedgerState | null
  pipeline: PipelineEvent[]
  alerts: string[]
}

export interface LegacyConsoleImport {
  importedAt: string
  gateCacheSampledAt: string | null
  engine: string | null
  modelKey: string | null
  resetAt: number | null
  uncapped: boolean
  lastLaunchAt: number | null
  lastRefusalAt: number | null
  processedLog: string | null
  escalationPending: boolean
}

export interface AutoTaoState {
  schemaVersion: typeof SNAPSHOT_SCHEMA_VERSION
  updatedAt: string
  snapshot: ProjectSnapshot
  legacyImport: LegacyConsoleImport | null
}

export interface ActionResult {
  ok: boolean
  summary: string
  output: string
}

export interface AutoTaoController {
  snapshot(): Promise<ProjectSnapshot>
  importState(): Promise<AutoTaoState>
  launch(): Promise<ActionResult>
  tick(): Promise<ActionResult>
}
