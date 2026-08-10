import { spawn } from "node:child_process"
import { open, readFile, readdir, rename, stat, unlink, writeFile } from "node:fs/promises"
import { basename, join } from "node:path"
import { freemem, loadavg } from "node:os"
import type { AutoTaoConfig } from "./config.ts"
import { integer, parseKeyValues, parseLatestLedger, parsePapersWanted, parsePipelineEvents } from "./parsers.ts"
import { parseProblemFile } from "./problem-brief.ts"
import {
  SNAPSHOT_SCHEMA_VERSION,
  type ActionResult,
  type AutoTaoState,
  type AutoTaoController,
  type GateState,
  type ProjectSnapshot,
  type RunState,
  type SessionSummary,
  type SessionTranscript,
  type UsageTank,
  type UsagePolicy,
} from "./protocol.ts"
import { LocalStateStore, overlayLegacyConsoleSample, readLegacyConsoleSample } from "./state-store.ts"
import { parseSessionLog } from "./session-log.ts"

interface CommandResult {
  code: number
  stdout: string
  stderr: string
  timedOut: boolean
}

async function runCommand(argv: string[], cwd: string, timeoutMs = 15000, environment: Record<string, string> = {}): Promise<CommandResult> {
  if (argv.length === 0) throw new Error("Cannot execute an empty command")
  return await new Promise((resolve) => {
    const child = spawn(argv[0]!, argv.slice(1), {
      cwd,
      env: { ...process.env, ...environment },
      stdio: ["ignore", "pipe", "pipe"],
    })
    const stdout: Buffer[] = []
    const stderr: Buffer[] = []
    let timedOut = false
    child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk))
    child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk))
    const timer = setTimeout(() => {
      timedOut = true
      child.kill("SIGTERM")
    }, timeoutMs)
    child.on("error", (error) => {
      clearTimeout(timer)
      resolve({ code: 127, stdout: "", stderr: error.message, timedOut })
    })
    child.on("close", (code) => {
      clearTimeout(timer)
      resolve({
        code: code ?? 1,
        stdout: Buffer.concat(stdout).toString("utf8"),
        stderr: Buffer.concat(stderr).toString("utf8"),
        timedOut,
      })
    })
  })
}

async function optionalRead(path: string): Promise<string> {
  try {
    return await readFile(path, "utf8")
  } catch {
    return ""
  }
}

async function readTail(path: string, maxBytes = 256 * 1024): Promise<string> {
  try {
    const info = await stat(path)
    const length = Math.min(info.size, maxBytes)
    const handle = await open(path, "r")
    try {
      const buffer = Buffer.alloc(length)
      await handle.read(buffer, 0, length, info.size - length)
      return buffer.toString("utf8")
    } finally {
      await handle.close()
    }
  } catch {
    return ""
  }
}

function processAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

async function newestLog(root: string): Promise<{ path: string; mtimeMs: number; size: number } | null> {
  const directory = join(root, "attempts/raw-logs")
  try {
    const names = (await readdir(directory)).filter((name) => name.endsWith(".log"))
    const candidates = await Promise.all(names.map(async (name) => {
      const path = join(directory, name)
      const info = await stat(path)
      return { path, mtimeMs: info.mtimeMs, size: info.size }
    }))
    return candidates.sort((left, right) => right.mtimeMs - left.mtimeMs)[0] ?? null
  } catch {
    return null
  }
}

function sessionEngine(name: string): string {
  if (/(?:^|-)codex(?:-|\.)/.test(name)) return "codex"
  if (/(?:^|-)claude(?:-|\.)/.test(name)) return "claude"
  return "agent"
}

async function sessionSummaries(root: string): Promise<SessionSummary[]> {
  const directory = join(root, "attempts/raw-logs")
  try {
    const names = (await readdir(directory)).filter((name) => name.endsWith(".log"))
    const lock = await optionalRead(join(root, "attempts/.run.lock"))
    const pid = /^\d+$/.test(lock.trim()) ? Number.parseInt(lock.trim(), 10) : null
    const running = pid != null && processAlive(pid)
    const sessions = await Promise.all(names.map(async (name) => {
      const info = await stat(join(directory, name))
      return {
        id: name,
        modifiedAt: info.mtime.toISOString(),
        bytes: info.size,
        engine: sessionEngine(name),
        active: false,
      } as SessionSummary
    }))
    sessions.sort((left, right) => right.modifiedAt.localeCompare(left.modifiedAt))
    if (running && sessions[0]) sessions[0].active = true
    return sessions
  } catch {
    return []
  }
}

async function readBoundedLog(path: string, maxBytes = 16 * 1024 * 1024): Promise<{ text: string; truncated: boolean }> {
  const info = await stat(path)
  if (info.size <= maxBytes) return { text: await readFile(path, "utf8"), truncated: false }
  const handle = await open(path, "r")
  try {
    const buffer = Buffer.alloc(maxBytes)
    await handle.read(buffer, 0, maxBytes, info.size - maxBytes)
    const text = buffer.toString("utf8")
    const firstNewline = text.indexOf("\n")
    return { text: firstNewline >= 0 ? text.slice(firstNewline + 1) : "", truncated: true }
  } finally {
    await handle.close()
  }
}

function tank(
  id: string,
  label: string,
  used: number,
  burn: number,
  ceiling: number,
  hardCap: number,
  configuredFinishAt: number,
  resetAt: number,
  windowMinutes: number,
  governed = true,
): UsageTank {
  const known = used >= 0
  const backendFinishAt = hardCap >= 0 ? Math.min(100, hardCap) : configuredFinishAt
  return {
    id,
    label,
    used: known ? used : null,
    burn,
    ceiling: ceiling >= 0 ? ceiling : null,
    hardCap: hardCap >= 0 ? hardCap : null,
    projected: known ? used + burn : null,
    governed,
    finishAt: Math.min(configuredFinishAt, backendFinishAt),
    resetAt: resetAt > 0 ? resetAt : null,
    windowMinutes: windowMinutes > 0 ? windowMinutes : null,
  }
}

function gateFrom(usage: CommandResult, capacity: CommandResult, config: AutoTaoConfig): GateState {
  const values = parseKeyValues(usage.stdout)
  const usageRc = integer(values.USAGE_RC, usage.code)
  const engine = values.USAGE_ENGINE ?? "unknown"
  const burnWeek = integer(values.USAGE_BURN_WEEK, 0)
  const ceilingWeek = integer(values.USAGE_CEIL_WEEK)
  const configuredFinishAt = 100 - config.usage.reservePercent
  const tanks: UsageTank[] = []

  if (engine === "codex") {
    const uncapped = values.USAGE_UNCAPPED === "1"
    tanks.push(tank(
      "weekly",
      "Weekly allowance",
      integer(values.USAGE_WEEK),
      burnWeek,
      uncapped ? 100 : ceilingWeek,
      integer(values.USAGE_HARD_CAP_WEEK, uncapped ? 100 : ceilingWeek),
      configuredFinishAt,
      integer(values.USAGE_RESET_AT),
      integer(values.USAGE_WINDOW_MIN),
    ))
  } else {
    tanks.push(tank("session", "Current 5-hour window", integer(values.USAGE_SESSION), integer(values.USAGE_BURN_SESSION, 0), integer(values.USAGE_CEIL_SESSION), integer(values.USAGE_HARD_CAP_SESSION), configuredFinishAt, integer(values.USAGE_SESSION_RESET_AT), 300))
    tanks.push(tank("weekly", "Weekly allowance", integer(values.USAGE_WEEK), burnWeek, ceilingWeek, integer(values.USAGE_HARD_CAP_WEEK), configuredFinishAt, integer(values.USAGE_WEEK_RESET_AT), 10_080))
    const modelWeek = values.USAGE_MODEL_WEEK
    tanks.push(tank("model-week", `Weekly · ${values.USAGE_MODEL_KEY ?? "model"}`, modelWeek === "n/a" ? -1 : integer(modelWeek), burnWeek, ceilingWeek, integer(values.USAGE_HARD_CAP_WEEK), configuredFinishAt, integer(values.USAGE_WEEK_RESET_AT), 10_080, modelWeek !== "n/a"))
  }

  const phase = usageRc === 0 && capacity.code === 0 ? "open" : usageRc === 3 ? "unknown" : "closed"
  const reason = values.USAGE_REASON || (capacity.code !== 0 ? capacity.stdout.trim() || capacity.stderr.trim() : "")
  return {
    phase,
    health: phase === "open" ? "healthy" : phase === "unknown" ? "warning" : "critical",
    usageRc,
    capacityRc: capacity.code,
    reason: reason || (phase === "open" ? "All launch checks pass" : `gate rc=${usageRc}, capacity rc=${capacity.code}`),
    source: values.USAGE_SOURCE ?? null,
    sampleAgeSeconds: integer(values.USAGE_AGE) >= 0 ? integer(values.USAGE_AGE) : null,
    uncapped: values.USAGE_UNCAPPED === "1",
    policy: config.usage,
    tanks,
  }
}

async function runState(root: string): Promise<RunState> {
  const now = Date.now()
  const lockPath = join(root, "attempts/.run.lock")
  const [lock, log, lockStat] = await Promise.all([
    optionalRead(lockPath),
    newestLog(root),
    stat(lockPath).catch(() => null),
  ])
  const pid = /^\d+$/.test(lock.trim()) ? Number.parseInt(lock.trim(), 10) : null
  const alive = pid != null && processAlive(pid)
  // The lock is written by run-once.sh at the instant the run starts and is not
  // touched again, so its mtime is when this run began.
  //
  // This used to read attempts/supervision/.last-launch, which nothing has
  // written since the Bash console was retired — it held a timestamp from nine
  // days earlier, and every run was reported as ~209 hours old.
  const launchedMs = lockStat?.mtimeMs ?? null
  return {
    phase: alive ? "running" : pid == null ? "idle" : "stale-lock",
    pid,
    elapsedSeconds: alive && launchedMs != null ? Math.max(0, Math.floor((now - launchedMs) / 1000)) : null,
    lastWriteSeconds: log ? Math.max(0, Math.floor((now - log.mtimeMs) / 1000)) : null,
    newestLog: log ? basename(log.path) : null,
    newestLogBytes: log?.size ?? null,
  }
}

function actionSummary(label: string, result: CommandResult): ActionResult {
  const output = [result.stdout.trim(), result.stderr.trim()].filter(Boolean).join("\n")
  if (result.timedOut) return { ok: false, summary: `${label} timed out`, output }
  return {
    ok: result.code === 0,
    summary: result.code === 0 ? `${label} completed` : `${label} refused (rc ${result.code})`,
    output,
  }
}

export class RepositoryController implements AutoTaoController {
  private usageSample: { sampledAt: number; result: CommandResult } | null = null
  private readonly stateStore: LocalStateStore

  constructor(private readonly root: string, private readonly config: AutoTaoConfig) {
    this.stateStore = new LocalStateStore(root)
  }

  private run(argv: string[], timeoutMs = 15000): Promise<CommandResult> {
    const finishAt = String(100 - this.config.usage.reservePercent)
    return runCommand(argv, this.root, timeoutMs, {
      RUN_ENGINE: this.config.engine,
      AUTOTAO_FINISH_AT: finishAt,
    })
  }

  private async sampleUsage(): Promise<CommandResult> {
    const now = Date.now()
    if (this.usageSample && now - this.usageSample.sampledAt < 60_000) return this.usageSample.result
    const result = await this.run(["bash", "scripts/usage.sh", "launch"], 20000)
    this.usageSample = { sampledAt: now, result }
    return result
  }

  async snapshot(): Promise<ProjectSnapshot> {
    const [usage, capacity, engineResult, modelResult, run, tickText, ledgerText, wantedText, escalateText] = await Promise.all([
      this.sampleUsage(),
      this.run(["bash", "scripts/capacity.sh"], 5000),
      this.run(["bash", "scripts/run-engine.sh"], 5000),
      this.run(["bash", "scripts/run-model.sh"], 5000),
      runState(this.root),
      readTail(join(this.root, "attempts/supervision/tick.log"), 128 * 1024),
      readTail(join(this.root, "attempts/LOG.md")),
      optionalRead(join(this.root, "papers/WANTED.md")),
      optionalRead(join(this.root, "attempts/supervision/ESCALATE")),
    ])
    const alerts: string[] = []
    if (run.phase === "stale-lock") alerts.push(`Stale run lock for pid ${run.pid}`)
    if (escalateText.trim()) alerts.push("Tier-2 escalation is pending")
    const gate = gateFrom(usage, capacity, this.config)
    if (gate.phase === "unknown") alerts.push(gate.reason)
    const papersWanted = parsePapersWanted(wantedText)
    if (papersWanted.length > 0) alerts.push(`${papersWanted.length} paper request${papersWanted.length === 1 ? "" : "s"} need operator attention`)

    const modelParts = modelResult.stdout.trim().split(/\s+/)
    const snapshot: ProjectSnapshot = {
      schemaVersion: SNAPSHOT_SCHEMA_VERSION,
      sampledAt: new Date().toISOString(),
      project: {
        name: this.config.project.name,
        root: this.root,
        adapter: this.config.project.adapter,
      },
      engine: engineResult.stdout.trim() || "unknown",
      model: engineResult.stdout.trim() === "codex"
        ? process.env.CODEX_MODEL || "configured default"
        : modelParts[0] || "configured default",
      run,
      gate,
      resources: {
        availableMemoryMb: Math.round(freemem() / 1024 / 1024),
        loadAverage: loadavg() as [number, number, number],
        papersWanted,
      },
      ledger: parseLatestLedger(ledgerText),
      pipeline: parsePipelineEvents(tickText),
      alerts,
    }
    // The problem file is the only place that says, in words, what is being
    // worked on. Reading it is display-only and must never be able to fail the
    // snapshot: a missing or unreadable file simply means less to show.
    if (snapshot.ledger?.problem) {
      const slug = snapshot.ledger.problem.trim()
      if (/^[A-Za-z0-9._-]+$/.test(slug)) {
        const markdown = await optionalRead(join(this.root, "problems", `${slug}.md`))
        if (markdown) snapshot.problemBrief = parseProblemFile(slug, markdown)
      }
    }
    const legacySample = await readLegacyConsoleSample(this.root)
    const merged = overlayLegacyConsoleSample(snapshot, legacySample)
    await this.stateStore.updateSnapshot(merged).catch(() => undefined)
    return merged
  }

  async importState(): Promise<AutoTaoState> {
    const [snapshot, legacySample] = await Promise.all([this.snapshot(), readLegacyConsoleSample(this.root)])
    // An explicit migration imports the last durable console sample even after
    // the old console has stopped. Normal live refreshes require a fresh cache.
    const merged = overlayLegacyConsoleSample(snapshot, { ...legacySample, fresh: true })
    return await this.stateStore.importLegacy(merged, legacySample.imported)
  }

  async listSessions(): Promise<SessionSummary[]> {
    return await sessionSummaries(this.root)
  }

  async readSession(id: string): Promise<SessionTranscript> {
    if (basename(id) !== id || !id.endsWith(".log")) throw new Error("Invalid session id")
    const directory = join(this.root, "attempts/raw-logs")
    const path = join(directory, id)
    const [names, info, latest, lock] = await Promise.all([
      readdir(directory),
      stat(path),
      newestLog(this.root),
      optionalRead(join(this.root, "attempts/.run.lock")),
    ])
    if (!names.includes(id)) throw new Error(`Session not found: ${id}`)
    const pid = /^\d+$/.test(lock.trim()) ? Number.parseInt(lock.trim(), 10) : null
    const session: SessionSummary = {
      id,
      modifiedAt: info.mtime.toISOString(),
      bytes: info.size,
      engine: sessionEngine(id),
      active: pid != null && processAlive(pid) && basename(latest?.path ?? "") === id,
    }
    const content = await readBoundedLog(path)
    const parsed = parseSessionLog(content.text)
    return {
      session,
      threadId: parsed.threadId,
      truncated: content.truncated,
      lines: parsed.lines,
    }
  }

  async updateUsagePolicy(policy: UsagePolicy): Promise<ActionResult> {
    if (!Number.isInteger(policy.reservePercent) || policy.reservePercent < 5 || policy.reservePercent > 90) {
      return { ok: false, summary: "Protected reserve must be an integer from 5% to 90%", output: "" }
    }
    if (policy.pace !== "even" && policy.pace !== "eager") {
      return { ok: false, summary: "Pacing must be even or eager", output: "" }
    }

    const path = join(this.root, "autotao.json")
    const temporary = `${path}.tmp-${process.pid}`
    try {
      const raw = JSON.parse(await readFile(path, "utf8")) as Record<string, unknown>
      const usage = raw.usage && typeof raw.usage === "object" && !Array.isArray(raw.usage)
        ? raw.usage as Record<string, unknown>
        : {}
      raw.usage = { ...usage, reservePercent: policy.reservePercent, pace: policy.pace }
      await writeFile(temporary, `${JSON.stringify(raw, null, 2)}\n`, { encoding: "utf8", mode: 0o600 })
      await rename(temporary, path)
      this.config.usage = { ...policy }
      this.usageSample = null
      return {
        ok: true,
        summary: `Usage plan saved: protect ${policy.reservePercent}%, ${policy.pace} pacing`,
        output: path,
      }
    } catch (error) {
      await unlink(temporary).catch(() => undefined)
      return { ok: false, summary: `Could not save usage plan: ${error instanceof Error ? error.message : String(error)}`, output: "" }
    }
  }

  async launch(): Promise<ActionResult> {
    return actionSummary("Launch", await this.run(this.config.commands.launch, 30000))
  }

  async tick(): Promise<ActionResult> {
    // Tier 1 may run for up to ten minutes. The client timeout must outlive the
    // supervisor's own bound or it can orphan an otherwise healthy triage process.
    return actionSummary("Supervisor tick", await this.run(this.config.commands.tick, 660_000))
  }
}
