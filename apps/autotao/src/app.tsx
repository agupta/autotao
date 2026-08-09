import { For, Show, createMemo, createSignal, onCleanup, onMount, type JSX } from "solid-js"
import { useKeyboard, useRenderer, useTerminalDimensions } from "@opentui/solid"
import type { ActionResult, AutoTaoController, ProjectSnapshot } from "./protocol.ts"
import { bytes, duration, truncate } from "./format.ts"
import { resetLabel, usageRunway } from "./usage-plan.ts"
import { theme } from "./theme.ts"

interface AppProps {
  controller: AutoTaoController
  refreshMs: number
  automation: {
    autoLaunch: boolean
    launchIntervalMs: number
    tickIntervalMs: number
  }
  initial?: ProjectSnapshot
}

interface PanelProps {
  title: string
  accent?: string
  style?: Record<string, unknown>
  children: JSX.Element
}

function Panel(props: PanelProps) {
  return (
    <box
      border
      borderStyle="rounded"
      borderColor={props.accent ?? theme.border}
      title={` ${props.title} `}
      titleColor={props.accent ?? theme.quiet}
      backgroundColor={theme.panel}
      paddingX={1}
      {...props.style}
    >
      {props.children}
    </box>
  )
}

function RunwayBar(props: { used: number; paceAt: number; finishAt: number; width: number }) {
  const cell = (percent: number) => Math.max(0, Math.min(props.width, Math.round(percent / 100 * props.width)))
  const usedEnd = () => cell(props.used)
  const paceEnd = () => Math.max(usedEnd(), cell(props.paceAt))
  const finishEnd = () => Math.max(paceEnd(), cell(props.finishAt))
  return (
    <box flexDirection="row">
      <text fg={theme.sage}>{"━".repeat(usedEnd())}</text>
      <text fg={theme.sky}>{"─".repeat(Math.max(0, paceEnd() - usedEnd()))}</text>
      <text fg={theme.quiet}>{"·".repeat(Math.max(0, finishEnd() - paceEnd()))}</text>
      <text fg={theme.reserve}>{"·".repeat(Math.max(0, props.width - finishEnd()))}</text>
    </box>
  )
}

function usageSentence(snapshot: ProjectSnapshot, nextRunFits: boolean): { text: string; color: string } {
  if (snapshot.run.phase === "running") return { text: "Using spare allowance now", color: theme.sage }
  if (snapshot.gate.phase === "unknown") return { text: "Usage is unavailable — automatic runs are paused", color: theme.coral }
  if (snapshot.gate.phase === "closed" && snapshot.gate.capacityRc !== 0) return { text: "Waiting for the current work to clear", color: theme.brass }
  if (nextRunFits && snapshot.gate.phase === "open") return { text: "Below your pace — another checked run fits now", color: theme.sky }
  return { text: "On pace — waiting before the next run", color: theme.sage }
}

function UsagePlan(props: { snapshot: ProjectSnapshot; width: number }) {
  const plan = createMemo(() => usageRunway(props.snapshot.gate, new Date(props.snapshot.sampledAt).getTime()))
  const primary = () => plan().primary
  const status = () => usageSentence(props.snapshot, plan().nextRunFits)
  const barWidth = () => Math.max(24, Math.min(76, props.width - 10))
  return (
    <Panel title="YOUR USAGE PLAN" accent={theme.sky} style={{ height: props.width >= 108 ? 6 : 5, flexShrink: 0 }}>
      <Show when={primary()} fallback={
        <box flexDirection="column">
          <text fg={theme.coral}><strong>Usage data is not ready</strong></text>
          <text fg={theme.quiet}>AutoTao will not start work until it can read your allowance.</text>
        </box>
      }>
        {(runway) => (
          <box flexDirection="column">
            <box flexDirection="row" justifyContent="space-between">
              <text fg={status().color}><strong>{status().text}</strong></text>
              <text fg={theme.quiet}>{runway().tank.label}</text>
            </box>
            <RunwayBar
              used={runway().tank.used ?? 0}
              paceAt={runway().paceAt}
              finishAt={runway().tank.finishAt}
              width={barWidth()}
            />
            <box flexDirection="row" justifyContent="space-between">
              <text fg={theme.sage}>{Math.round(runway().tank.used ?? 0)}% used</text>
              <text fg={theme.sky}>{runway().paced ? `${Math.round(runway().paceAt)}% pace now` : "use spare capacity now"}</text>
              <text fg={theme.paper}>finish at {Math.round(runway().tank.finishAt)}%</text>
              <text fg={theme.reserve}>{Math.max(0, 100 - Math.round(runway().tank.finishAt))}% protected</text>
            </box>
            <Show when={props.width >= 108}>
              <box flexDirection="row" justifyContent="space-between">
                <text fg={theme.quiet}>Your normal usage counts first; AutoTao fills only the gap.</text>
                <text fg={theme.quiet}>{resetLabel(runway().tank, new Date(props.snapshot.sampledAt).getTime())}</text>
              </box>
            </Show>
          </box>
        )}
      </Show>
    </Panel>
  )
}

function NowPanel(props: { snapshot: ProjectSnapshot; wide: boolean }) {
  const running = () => props.snapshot.run.phase === "running"
  const latestEvent = () => props.snapshot.pipeline.at(-1)?.message
  return (
    <Panel title="NOW" accent={running() ? theme.sage : theme.border} style={props.wide ? { width: "38%", flexGrow: 0 } : { width: "100%", height: 4, flexShrink: 0 }}>
      <text fg={running() ? theme.sage : theme.paper}>
        <strong>{running() ? "Working on mathematics" : "Waiting for the runway"}</strong>
      </text>
      <Show when={running()}>
        <text fg={theme.quiet}>{duration(props.snapshot.run.elapsedSeconds)} elapsed · output {duration(props.snapshot.run.lastWriteSeconds)} ago</text>
      </Show>
      <Show when={!running()}>
        <text fg={theme.quiet}>AutoTao checks again automatically.</text>
      </Show>
      <Show when={props.wide && latestEvent()}>
        {(event) => <text fg={theme.quiet}>{truncate(event(), 48)}</text>}
      </Show>
      <Show when={props.wide && props.snapshot.run.newestLog}>
        <text fg={theme.reserve}>{truncate(props.snapshot.run.newestLog ?? "", props.wide ? 44 : 24)} · {bytes(props.snapshot.run.newestLogBytes)}</text>
      </Show>
    </Panel>
  )
}

function LastAttemptPanel(props: { snapshot: ProjectSnapshot; wide: boolean }) {
  const verdict = () => props.snapshot.ledger?.verdict.toLowerCase() ?? ""
  const verdictColor = () => /resolved|pass|partial|closed/.test(verdict()) ? theme.sage : /fail|invalid/.test(verdict()) ? theme.coral : theme.brass
  return (
    <Panel title="LAST MATH ATTEMPT" accent={verdictColor()} style={props.wide ? { flexGrow: 1 } : { width: "100%", height: 5, flexShrink: 0 }}>
      <Show when={props.snapshot.ledger} fallback={
        <text fg={theme.quiet}>No attempt yet. Add a problem, then AutoTao can begin.</text>
      }>
        {(ledger) => (
          <box flexDirection="column">
            <box flexDirection="row" justifyContent="space-between">
              <text fg={theme.paper}><strong>{truncate(ledger().problem, props.wide ? 42 : 26)}</strong></text>
              <text fg={verdictColor()}>{ledger().verdict.toUpperCase()}</text>
            </box>
            <text fg={theme.quiet}>{truncate(ledger().target, props.wide ? 76 : 38)}</text>
            <Show when={props.wide}><text fg={theme.reserve}>{truncate(ledger().outcome, 84)}</text></Show>
          </box>
        )}
      </Show>
    </Panel>
  )
}

function HelpPanel(props: { snapshot: ProjectSnapshot }) {
  const finishAt = () => usageRunway(props.snapshot.gate).primary?.tank.finishAt ?? 95
  return (
    <Panel title="HOW AUTOTAO DECIDES" accent={theme.brass} style={{ flexGrow: 1 }}>
      <text fg={theme.paper}>Autopilot follows a steady path to {Math.round(finishAt())}% when your allowance resets.</text>
      <text fg={theme.quiet}>Your normal usage counts toward the path. AutoTao starts work only when a checked run fits below it.</text>
      <text fg={theme.quiet}>Every run still rechecks usage, memory, and whether another run is active.</text>
      <text fg={theme.brass}>Space pauses/resumes · n starts one checked run · r refreshes · t runs maintenance · ? closes help</text>
    </Panel>
  )
}

export function Dashboard(props: {
  snapshot: ProjectSnapshot
  message?: ActionResult | null
  width: number
  autoLaunch?: boolean
  help?: boolean
}) {
  const wide = () => props.width >= 108
  const active = () => props.autoLaunch ?? false
  return (
    <box width="100%" height="100%" flexDirection="column" backgroundColor={theme.canvas} padding={1} gap={1}>
      <box
        height={3}
        flexShrink={0}
        flexDirection="row"
        alignItems="center"
        justifyContent="space-between"
        backgroundColor={theme.header}
        border
        borderStyle="rounded"
        borderColor={theme.border}
        paddingX={1}
      >
        <box flexDirection="row" gap={1}>
          <text fg={theme.sky}><strong>◆ AUTOTAO</strong></text>
          <text fg={theme.paper}>{props.snapshot.project.name}</text>
        </box>
        <box flexDirection="row" gap={1}>
          <text fg={active() ? theme.sage : theme.brass}>● {active() ? "AUTOPILOT ON" : "AUTOPILOT PAUSED"}</text>
          <Show when={wide()}><text fg={theme.quiet}>· {props.snapshot.engine} · {props.snapshot.model}</text></Show>
        </box>
      </box>

      <UsagePlan snapshot={props.snapshot} width={props.width} />

      <box height={wide() ? 8 : 10} flexShrink={0} flexDirection={wide() ? "row" : "column"} gap={1}>
        <Show when={!props.help} fallback={<HelpPanel snapshot={props.snapshot} />}>
          <NowPanel snapshot={props.snapshot} wide={wide()} />
          <LastAttemptPanel snapshot={props.snapshot} wide={wide()} />
        </Show>
      </box>

      <box flexGrow={1} />

      <box height={1} flexShrink={0} flexDirection="row" justifyContent="space-between" paddingX={1}>
        <text fg={theme.paper}>{wide() ? "Space  Pause autopilot   n  Run one now   ?  Explain this screen   q  Quit" : "Space pause · n run now · ? help · q quit"}</text>
        <Show when={props.message}>
          {(message) => <text fg={message().ok ? theme.sage : theme.coral}>{truncate(message().summary, wide() ? 34 : 18)}</text>}
        </Show>
      </box>
    </box>
  )
}

export function App(props: AppProps) {
  const renderer = useRenderer()
  const dimensions = useTerminalDimensions()
  const [snapshot, setSnapshot] = createSignal<ProjectSnapshot | null>(props.initial ?? null)
  const [message, setMessage] = createSignal<ActionResult | null>(null)
  const [busy, setBusy] = createSignal(false)
  const [autopilot, setAutopilot] = createSignal(props.automation.autoLaunch)
  const [help, setHelp] = createSignal(false)
  let refreshInFlight: Promise<void> | null = null
  let lastLaunchAttemptAt = 0

  const refresh = (): Promise<void> => {
    if (refreshInFlight) return refreshInFlight
    refreshInFlight = (async () => {
      try {
        setSnapshot(await props.controller.snapshot())
      } catch (error) {
        setMessage({ ok: false, summary: error instanceof Error ? error.message : String(error), output: "" })
      } finally {
        refreshInFlight = null
      }
    })()
    return refreshInFlight
  }

  const act = async (action: "launch" | "tick") => {
    if (busy()) return
    setBusy(true)
    setMessage({ ok: true, summary: action === "launch" ? "Starting one checked run…" : "Running maintenance…", output: "" })
    try {
      const result = await props.controller[action]()
      setMessage({
        ...result,
        summary: result.ok ? (action === "launch" ? "Run started" : "Maintenance finished") : result.summary,
      })
      await refresh()
    } finally {
      setBusy(false)
    }
  }

  const maybeLaunch = () => {
    const current = snapshot()
    const now = Date.now()
    if (!autopilot() || busy() || !current) return
    if (current.run.phase === "running" || current.gate.phase !== "open") return
    if (!usageRunway(current.gate, now).nextRunFits) return
    if (now - lastLaunchAttemptAt < props.automation.launchIntervalMs) return
    lastLaunchAttemptAt = now
    void act("launch")
  }

  useKeyboard((key) => {
    if (key.name === "q" || key.name === "escape") renderer.destroy()
    if (key.name === "space") {
      setAutopilot((value) => !value)
      setMessage({ ok: true, summary: autopilot() ? "Autopilot resumed" : "Autopilot paused", output: "" })
      maybeLaunch()
    }
    if (key.name === "?" || key.name === "h") setHelp((value) => !value)
    if (key.name === "n" || key.name === "l") void act("launch")
    if (key.name === "r") void refresh()
    if (key.name === "t") void act("tick")
  })

  onMount(() => {
    const cycle = async () => {
      await refresh()
      maybeLaunch()
    }
    const start = async () => {
      await refresh()
      if (props.automation.tickIntervalMs > 0) await act("tick")
      maybeLaunch()
    }
    void start()
    const refreshTimer = setInterval(() => void cycle(), props.refreshMs)
    const tickTimer = props.automation.tickIntervalMs > 0
      ? setInterval(() => void act("tick"), props.automation.tickIntervalMs)
      : null
    onCleanup(() => {
      clearInterval(refreshTimer)
      if (tickTimer) clearInterval(tickTimer)
    })
  })

  return (
    <Show when={snapshot()} fallback={
      <box width="100%" height="100%" alignItems="center" justifyContent="center" backgroundColor={theme.canvas}>
        <text fg={theme.sky}>◆ Reading your usage allowance…</text>
      </box>
    }>
      {(current) => (
        <Dashboard
          snapshot={current()}
          message={message()}
          width={dimensions().width}
          autoLaunch={autopilot()}
          help={help()}
        />
      )}
    </Show>
  )
}
