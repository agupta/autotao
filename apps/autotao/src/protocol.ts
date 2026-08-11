export const SNAPSHOT_SCHEMA_VERSION = 1 as const

export type Health = "healthy" | "warning" | "critical" | "unknown"
export type RunPhase = "running" | "idle" | "stale-lock"
export type GatePhase = "open" | "closed" | "unknown"

export interface UsagePolicy {
  reservePercent: number
  pace: "even" | "eager"
}

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
  policy: UsagePolicy
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
    adapter: "autotao"
  }
  engine: string
  model: string
  run: RunState
  gate: GateState
  resources: ResourceState
  ledger: LedgerState | null
  /**
   * What the problem file says about the problem, for readers who do not work
   * in its subfield. Null when there is no attempt yet, or no problem file to
   * read. Presentation only — nothing here reaches the loop.
   */
  problemBrief?: ProblemBrief | null
  /**
   * The attempt happening right now, which is not the same thing as the last
   * line in the ledger — that is only written when a run closes, and can be a
   * different target at a different ambition tier.
   */
  liveAttempt?: LiveAttempt | null
  pipeline: PipelineEvent[]
  alerts: string[]
}

export interface LiveAttempt {
  directory: string
  problem: string | null
  title: string | null
  attempt: number | null
  tier: "P" | "B" | "F" | null
  target: string | null
  outcome: string | null
  approaches: string[]
  latestActivity: string | null
}

export interface ProblemBrief {
  slug: string
  title: string | null
  plain: string | null
  activeTarget: string | null
}

export interface AutoTaoState {
  schemaVersion: typeof SNAPSHOT_SCHEMA_VERSION
  updatedAt: string
  snapshot: ProjectSnapshot
}

export interface ActionResult {
  ok: boolean
  summary: string
  output: string
}

export type TranscriptLineKind = "agent" | "command" | "output" | "file" | "status" | "error" | "tool"

export interface TranscriptLine {
  kind: TranscriptLineKind
  text: string
}

export interface SessionSummary {
  id: string
  modifiedAt: string
  bytes: number
  engine: string
  active: boolean
}

export interface SessionTranscript {
  session: SessionSummary
  threadId: string | null
  truncated: boolean
  lines: TranscriptLine[]
}

export interface AutoTaoController {
  snapshot(): Promise<ProjectSnapshot>
  listSessions(): Promise<SessionSummary[]>
  readSession(id: string): Promise<SessionTranscript>
  updateUsagePolicy(policy: UsagePolicy): Promise<ActionResult>
  launch(): Promise<ActionResult>
  tick(): Promise<ActionResult>
}
