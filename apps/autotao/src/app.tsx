import { For, Show, createEffect, createMemo, createSignal, onCleanup, onMount, type JSX } from "solid-js"
import { useKeyboard, useRenderer, useTerminalDimensions } from "@opentui/solid"
import type { ActionResult, AutoTaoController, ProjectSnapshot, SessionSummary, SessionTranscript, TranscriptLine, TranscriptLineKind, UsagePolicy } from "./protocol.ts"
import { bytes, duration, truncate } from "./format.ts"
import { resetLabel, usageRunway } from "./usage-plan.ts"
import { checkForUpdate, updateNotice } from "./update.ts"
import { attemptSummary, parseAttemptTarget, tierDetail } from "./problem-brief.ts"
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
      // Content taller than its panel must be cut off, not spilled. Without
      // this, an overflowing line is painted outside the border and lands on
      // top of whatever else occupies that row — two strings interleaved in
      // one line, which reads as corruption rather than as truncation.
      overflow="hidden"
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

function UsagePlan(props: { snapshot: ProjectSnapshot; width: number; stacked?: boolean }) {
  const plan = createMemo(() => usageRunway(props.snapshot.gate, new Date(props.snapshot.sampledAt).getTime()))
  const primary = () => plan().primary
  const status = () => usageSentence(props.snapshot, plan().nextRunFits)
  const barWidth = () => Math.max(16, Math.min(76, props.width - (props.stacked ? 6 : 10)))
  // Stacked in a narrow column: the four figures read as a list rather than a
  // row that would have to be squeezed or truncated.
  const height = () => props.stacked ? 11 : props.width >= 108 ? 6 : 5
  return (
    <Panel title="YOUR USAGE PLAN" accent={theme.sky} style={{ height: height(), flexShrink: 0 }}>
      <Show when={primary()} fallback={
        <box flexDirection="column">
          <text fg={theme.coral}><strong>Usage data is not ready</strong></text>
          <text fg={theme.quiet}>AutoTao will not start work until it can read your allowance.</text>
        </box>
      }>
        {(runway) => (
          <box flexDirection="column">
            <Show when={props.stacked} fallback={
              <box flexDirection="row" justifyContent="space-between">
                <text fg={status().color}><strong>{status().text}</strong></text>
                <text fg={theme.quiet}>{runway().tank.label}</text>
              </box>
            }>
              <text height={wrapParagraph(status().text, barWidth()).length} flexShrink={0} fg={status().color}>
                <strong>{wrapParagraph(status().text, barWidth()).join("\n")}</strong>
              </text>
              <text height={1} flexShrink={0} fg={theme.quiet}>{runway().tank.label}</text>
            </Show>
            <RunwayBar
              used={runway().tank.used ?? 0}
              paceAt={runway().paceAt}
              finishAt={runway().tank.finishAt}
              width={barWidth()}
            />
            <Show when={props.stacked} fallback={
              <box flexDirection="row" justifyContent="space-between">
                <text fg={theme.sage}>{Math.round(runway().tank.used ?? 0)}% used</text>
                <text fg={theme.sky}>{runway().paced ? `${Math.round(runway().paceAt)}% pace now` : "use spare capacity now"}</text>
                <text fg={theme.paper}>finish at {Math.round(runway().tank.finishAt)}%</text>
                <text fg={theme.reserve}>{Math.max(0, 100 - Math.round(runway().tank.finishAt))}% protected</text>
              </box>
            }>
              <text height={1} flexShrink={0} fg={theme.sage}>{`${Math.round(runway().tank.used ?? 0)}% used`}</text>
              <text height={1} flexShrink={0} fg={theme.sky}>{runway().paced ? `${Math.round(runway().paceAt)}% pace right now` : "use spare capacity now"}</text>
              <text height={1} flexShrink={0} fg={theme.paper}>{`finish at ${Math.round(runway().tank.finishAt)}%`}</text>
              <text height={1} flexShrink={0} fg={theme.reserve}>{`${Math.max(0, 100 - Math.round(runway().tank.finishAt))}% protected`}</text>
              <text height={1} flexShrink={0} fg={theme.quiet}>{resetLabel(runway().tank, new Date(props.snapshot.sampledAt).getTime())}</text>
            </Show>
            <Show when={!props.stacked && props.width >= 108}>
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

function NowPanel(props: { snapshot: ProjectSnapshot; textWidth: number; compact?: boolean; style?: Record<string, unknown> }) {
  const running = () => props.snapshot.run.phase === "running"
  const latestEvent = () => props.snapshot.pipeline.at(-1)?.message
  return (
    <Panel title="NOW" accent={running() ? theme.sage : theme.border} style={props.style ?? { width: "100%", flexShrink: 0 }}>
      {/* Every line below is a single string child on purpose. Splitting one
          line across several children makes it several spans, which the live
          renderer has been observed to paint over each other in a narrow box —
          a header and its detail line landing in the same row, interleaved. */}
      <text height={1} flexShrink={0} fg={running() ? theme.sage : theme.paper}>
        <strong>{running() ? "Working on mathematics" : "Waiting for the runway"}</strong>
      </text>
      <Show when={running()} fallback={
        <text height={1} flexShrink={0} fg={theme.quiet}>AutoTao checks again automatically.</text>
      }>
        <text height={1} flexShrink={0} fg={theme.quiet}>{`${duration(props.snapshot.run.elapsedSeconds)} elapsed`}</text>
        <text height={1} flexShrink={0} fg={theme.quiet}>{`last output ${duration(props.snapshot.run.lastWriteSeconds)} ago`}</text>
      </Show>
      {/* Stacked under the problem panel, this is a status strip and must not
          take room the mathematics needs. */}
      <Show when={!props.compact}>
        <Show when={latestEvent()}>
          {(event) => (
            <text
              height={wrapParagraph(event(), props.textWidth).length}
              flexShrink={0}
              fg={theme.quiet}
            >{wrapParagraph(event(), props.textWidth).join("\n")}</text>
          )}
        </Show>
        <Show when={props.snapshot.run.newestLog}>
          <text height={1} flexShrink={0} fg={theme.reserve}>{truncate(props.snapshot.run.newestLog ?? "", props.textWidth)}</text>
          <text height={1} flexShrink={0} fg={theme.reserve}>{bytes(props.snapshot.run.newestLogBytes)}</text>
        </Show>
      </Show>
    </Panel>
  )
}

/**
 * Wrapped prose occupying exactly as many rows as it wraps to.
 *
 * The line count has to come from a memo. Computing it eagerly at the call site
 * reserved the right number of rows but left the last one unpainted, so the
 * final line of a paragraph silently vanished.
 */
function WrappedText(props: { body: string; width: number; fg?: string }) {
  const lines = createMemo(() => wrapParagraph(props.body, props.width))
  return (
    <text
      height={lines().length}
      flexShrink={0}
      fg={props.fg ?? theme.paper}
    >{lines().join("\n")}</text>
  )
}

/** A labelled block of wrapped prose. Nothing is truncated; long text wraps. */
function Section(props: { label: string; body: string; width: number; fg?: string }) {
  return (
    <box flexDirection="column" flexShrink={0}>
      <text height={1} flexShrink={0} fg={theme.reserve}>{props.label}</text>
      <WrappedText body={props.body} width={props.width} fg={props.fg} />
      <text height={1} flexShrink={0}> </text>
    </box>
  )
}

function LastAttemptPanel(props: { snapshot: ProjectSnapshot; textWidth: number; style?: Record<string, unknown> }) {
  const verdict = () => props.snapshot.ledger?.verdict.toLowerCase() ?? ""
  const verdictColor = () => /resolved|pass|partial|closed/.test(verdict()) ? theme.sage : /fail|invalid/.test(verdict()) ? theme.coral : theme.brass
  const brief = () => props.snapshot.problemBrief ?? null
  const coordinates = createMemo(() => parseAttemptTarget(props.snapshot.ledger?.target ?? ""))

  // The slug is an identifier, not a description. Prefer the problem file's
  // own title, which is written for humans.
  const heading = () => brief()?.title ?? props.snapshot.ledger?.problem ?? ""
  // The verdict shares the first line, so only that line is narrowed for it.
  const headingLines = createMemo(() => wrapParagraph(heading(), Math.max(10, props.textWidth - 10)))
  const outcome = (value: string) => value.replace(/[`*_]/g, "").trim()

  return (
    <Panel title="THE PROBLEM BEING WORKED ON" accent={verdictColor()} style={props.style ?? { width: "100%", flexGrow: 1 }}>
      <Show when={props.snapshot.ledger} fallback={
        <text fg={theme.quiet}>No attempt yet. Add a problem, then AutoTao can begin.</text>
      }>
        {(ledger) => (
          <box flexDirection="column">
            {/* The verdict sits on the first line, so only that line has to
                leave room for it; the title wraps into the full width below
                rather than being cut off. */}
            <box height={1} flexShrink={0} flexDirection="row" justifyContent="space-between">
              <text fg={theme.paper}><strong>{headingLines()[0]}</strong></text>
              <text fg={verdictColor()}>{ledger().verdict.toUpperCase()}</text>
            </box>
            <Show when={headingLines().length > 1}>
              <text height={headingLines().length - 1} flexShrink={0} fg={theme.paper}>
                <strong>{headingLines().slice(1).join("\n")}</strong>
              </text>
            </Show>
            {/* The slug is only worth a line when it is not already the
                heading — otherwise it is the same string twice. */}
            <Show when={heading() !== ledger().problem}>
              <text height={1} flexShrink={0} fg={theme.reserve}>{ledger().problem}</text>
            </Show>
            <text height={1} flexShrink={0}> </text>

            {/* Written for a mathematician outside the subfield, when the
                problem file supplies one. */}
            <Show when={brief()?.plain}>
              {(plain) => <Section label="WHAT THE PROBLEM IS" body={plain()} width={props.textWidth} />}
            </Show>

            {/* What a result would have to establish, in the problem file's own
                words — including the constraints a proof has to satisfy. */}
            <Show when={brief()?.activeTarget} fallback={
              <Show when={coordinates().statement}>
                <Section label="WHAT THIS ATTEMPT WENT AFTER" body={coordinates().statement} width={props.textWidth} />
              </Show>
            }>
              {(target) => <Section label="WHAT A RESULT WOULD HAVE TO SHOW" body={target()} width={props.textWidth} fg={theme.quiet} />}
            </Show>

            <Show when={attemptSummary(coordinates())}>
              {(summary) => (
                <box flexDirection="column" flexShrink={0}>
                  <text height={1} flexShrink={0} fg={theme.reserve}>THIS ATTEMPT</text>
                  <text height={1} flexShrink={0} fg={theme.sky}>{truncate(summary(), props.textWidth)}</text>
                  {/* Through WrappedText, whose line count is a memo. Computing
                      the height eagerly here dropped the last wrapped line:
                      the row was reserved but never painted. */}
                  <Show when={tierDetail(coordinates().tier)}>
                    {(detail) => <WrappedText body={detail()} width={props.textWidth} fg={theme.quiet} />}
                  </Show>
                  <text height={1} flexShrink={0}> </text>
                </box>
              )}
            </Show>

            <box flexDirection="column" flexShrink={0}>
              <text height={1} flexShrink={0} fg={theme.reserve}>HOW IT WENT</text>
              <WrappedText body={outcome(ledger().outcome)} width={props.textWidth} fg={theme.quiet} />
            </box>

            <text height={1} flexShrink={0} fg={theme.sky}>Enter opens the complete work transcript</text>
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
      <text fg={theme.paper}>Autopilot follows a steady path to {Math.round(finishAt())}% by reset.</text>
      <text fg={theme.quiet}>Your normal usage counts; AutoTao fills only the gap.</text>
      <text fg={theme.quiet}>Each run rechecks usage, memory, and the active-run lock.</text>
      <text fg={theme.brass}>Enter live work · s past sessions · u change usage plan</text>
      <text fg={theme.brass}>Space pause/resume</text>
      <text fg={theme.quiet}>n run now · r refresh · t maintenance · ? close help</text>
    </Panel>
  )
}

export function Dashboard(props: {
  snapshot: ProjectSnapshot
  message?: ActionResult | null
  width: number
  autoLaunch?: boolean
  help?: boolean
  updateNotice?: string | null
}) {
  const wide = () => props.width >= 108
  // Two columns once the right-hand column can still hold readable prose. The
  // problem text is the reason this screen exists, so it gets the wide side and
  // the operational panels stack down the narrow one.
  const twoColumn = () => props.width >= 100
  const active = () => props.autoLaunch ?? false
  const showProjectName = () => props.snapshot.project.name.trim().toLowerCase() !== "autotao"
  const sideWidth = () => Math.max(30, Math.min(46, Math.floor(props.width * 0.34)))
  const sideText = () => Math.max(16, sideWidth() - 4)
  const sideBySide = () => props.width >= 76
  const mainText = () =>
    twoColumn() ? Math.max(24, props.width - sideWidth() - 11)
    : sideBySide() ? Math.max(20, Math.floor(props.width * 0.62) - 7)
    : Math.max(20, props.width - 6)

  const header = (
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
        <Show when={showProjectName()}><text fg={theme.paper}>{props.snapshot.project.name}</text></Show>
      </box>
      <box flexDirection="row" gap={1}>
        <text fg={active() ? theme.sage : theme.brass}>● {active() ? "AUTOPILOT ON" : "AUTOPILOT PAUSED"}</text>
        <Show when={wide() && !twoColumn()}><text fg={theme.quiet}>· {props.snapshot.engine} · {props.snapshot.model}</text></Show>
      </box>
    </box>
  )

  return (
    <box width="100%" height="100%" flexDirection="column" backgroundColor={theme.canvas} padding={1} gap={1}>
      <Show when={twoColumn()} fallback={
        <>
          {header}
          <UsagePlan snapshot={props.snapshot} width={props.width} stacked={false} />
          {/* Between 76 and 100 columns there is not enough height to stack
              both panels, so they sit side by side as before. */}
          <box minHeight={8} flexGrow={1} flexDirection={sideBySide() ? "row" : "column"} gap={1}>
            <Show when={!props.help} fallback={<HelpPanel snapshot={props.snapshot} />}>
              <NowPanel
                snapshot={props.snapshot}
                textWidth={sideBySide() ? Math.max(16, Math.floor(props.width * 0.38) - 4) : mainText()}
                compact
                style={sideBySide() ? { width: "38%", flexGrow: 0 } : { width: "100%", height: 5, flexShrink: 0 }}
              />
              <LastAttemptPanel snapshot={props.snapshot} textWidth={mainText()} style={{ flexGrow: 1 }} />
            </Show>
          </box>
        </>
      }>
        <box flexGrow={1} flexDirection="row" gap={1}>
          <box width={sideWidth()} flexShrink={0} flexDirection="column" gap={1}>
            {header}
            <UsagePlan snapshot={props.snapshot} width={sideWidth()} stacked />
            <NowPanel snapshot={props.snapshot} textWidth={sideText()} style={{ width: "100%", flexGrow: 1 }} />
          </box>
          <box flexGrow={1} flexDirection="column">
            <Show when={!props.help} fallback={<HelpPanel snapshot={props.snapshot} />}>
              <LastAttemptPanel snapshot={props.snapshot} textWidth={mainText()} style={{ width: "100%", flexGrow: 1 }} />
            </Show>
          </box>
        </box>
      </Show>

      {/* Action feedback owns this row. An available update is not news worth
          displacing a live result, so it fills the row only while idle. */}
      <box height={1} flexShrink={0} paddingX={1}>
        <Show when={props.message} fallback={
          <Show when={props.snapshot.alerts[0]} fallback={
            <Show when={props.updateNotice} fallback={<text> </text>}>
              {(notice) => (
                <text fg={theme.brass}>↑ {truncate(notice(), Math.max(20, props.width - 6))}</text>
              )}
            </Show>
          }>
            {(alert) => <text fg={theme.coral}>! {truncate(alert(), Math.max(20, props.width - 6))}</text>}
          </Show>
        }>
          {(message) => (
            <text fg={message().ok ? theme.sage : theme.coral}>
              <strong>{message().ok ? "✓" : "!"}</strong> {truncate(message().summary, Math.max(20, props.width - 6))}
            </text>
          )}
        </Show>
      </box>

      <box height={1} flexShrink={0} flexDirection="row" justifyContent="space-between" paddingX={1}>
        <text fg={theme.paper}>{wide() ? "Enter  Live work   s  Sessions   u  Usage plan   Space  Pause   n  Run now   ?  Help   q  Quit" : "Enter live work · s sessions · u usage · Space pause · n run now · ? help"}</text>
      </box>
    </box>
  )
}

export function UsageSettings(props: { policy: UsagePolicy; width: number }) {
  const finishAt = () => 100 - props.policy.reservePercent
  const barWidth = () => Math.max(20, Math.min(60, props.width - 12))
  return (
    <box width="100%" height="100%" flexDirection="column" backgroundColor={theme.canvas} padding={1} gap={1}>
      <box height={3} flexShrink={0} flexDirection="row" alignItems="center" backgroundColor={theme.header} border borderStyle="rounded" borderColor={theme.sky} paddingX={1}>
        <text fg={theme.sky}><strong>◆ AUTOTAO</strong>  USAGE PLAN</text>
      </box>
      <Panel title="HOW MUCH SHOULD AUTOTAO PROTECT?" accent={theme.sky} style={{ flexGrow: 1 }}>
        <box flexDirection="column" gap={1}>
          <text fg={theme.paper}><strong>{`${props.policy.reservePercent}% protected for you`}</strong></text>
          <box flexDirection="row">
            <text fg={theme.sky}>{"━".repeat(Math.round(finishAt() / 100 * barWidth()))}</text>
            <text fg={theme.reserve}>{"·".repeat(barWidth() - Math.round(finishAt() / 100 * barWidth()))}</text>
          </box>
          <text fg={theme.quiet}>{`AutoTao may use up to ${finishAt()}% before each allowance resets.`}</text>
          <text fg={theme.paper}>{`Pacing: ${props.policy.pace === "even" ? "evenly through the window" : "use available headroom now"}`}</text>
          <Show when={props.policy.pace === "even"} fallback={
            <text fg={theme.quiet}>Eager mode starts whenever a checked run fits below the final limit.</text>
          }>
            <text fg={theme.quiet}>Even mode follows a steady runway, so the week is not spent on day one.</text>
          </Show>
          <text fg={theme.brass}>Your ordinary interactive usage counts first; AutoTao only fills the gap.</text>
        </box>
      </Panel>
      <box height={1} flexShrink={0} paddingX={1}>
        <text fg={theme.paper}>←→ change protected % · p toggle pacing · Enter save · Esc cancel</text>
      </box>
    </box>
  )
}

interface DisplayRow {
  kind: TranscriptLineKind
  text: string
}

const transcriptPrefix: Record<TranscriptLineKind, string> = {
  agent: "◆ AGENT  ",
  command: "› ",
  output: "  ",
  file: "Δ ",
  status: "· ",
  error: "! ",
  tool: "◇ ",
}

const transcriptColor: Record<TranscriptLineKind, string> = {
  agent: theme.paper,
  command: theme.sky,
  output: theme.quiet,
  file: theme.brass,
  status: theme.reserve,
  error: theme.coral,
  tool: theme.sage,
}

function wrapParagraph(text: string, width: number): string[] {
  if (!text) return [""]
  const rows: string[] = []
  let rest = text
  while (rest.length > width) {
    const candidate = rest.slice(0, width + 1)
    const space = candidate.lastIndexOf(" ")
    const cut = space >= Math.floor(width * 0.45) ? space : width
    rows.push(rest.slice(0, cut))
    rest = rest.slice(cut).replace(/^\s+/, "")
  }
  rows.push(rest)
  return rows
}

export function formatTranscriptRows(lines: TranscriptLine[], width: number): DisplayRow[] {
  const safeWidth = Math.max(12, width)
  return lines.flatMap((line) => {
    const prefix = transcriptPrefix[line.kind]
    const continuation = " ".repeat(prefix.length)
    const contentWidth = Math.max(8, safeWidth - prefix.length)
    let first = true
    return line.text.split("\n").flatMap((paragraph) => wrapParagraph(paragraph, contentWidth).map((row) => {
      const display = `${first ? prefix : continuation}${row}`
      first = false
      return { kind: line.kind, text: display }
    }))
  })
}

function sessionDate(session: SessionSummary): string {
  const match = /^(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})/.exec(session.id)
  if (match) return `${match[1]}-${match[2]}-${match[3]}  ${match[4]}:${match[5]}:${match[6]}`
  return new Date(session.modifiedAt).toLocaleString()
}

export function SessionBrowser(props: { sessions: SessionSummary[]; selected: number; width: number; height: number; loading?: boolean }) {
  const pageSize = () => Math.max(4, props.height - 10)
  const start = () => Math.max(0, Math.min(props.selected - Math.floor(pageSize() / 2), props.sessions.length - pageSize()))
  const visible = () => props.sessions.slice(start(), start() + pageSize())
  return (
    <box width="100%" height="100%" flexDirection="column" backgroundColor={theme.canvas} padding={1} gap={1}>
      <box height={3} flexShrink={0} flexDirection="row" alignItems="center" justifyContent="space-between" backgroundColor={theme.header} border borderStyle="rounded" borderColor={theme.border} paddingX={1}>
        <text fg={theme.sky}><strong>◆ AUTOTAO</strong>  SESSION HISTORY</text>
        <text fg={theme.quiet}>{props.sessions.length} recorded runs</text>
      </box>
      <Panel title="CHOOSE A SESSION" accent={theme.sky} style={{ flexGrow: 1 }}>
        <Show when={!props.loading} fallback={<text fg={theme.sky}>Reading session history…</text>}>
          <Show when={props.sessions.length > 0} fallback={<text fg={theme.quiet}>No raw session logs found yet.</text>}>
            <For each={visible()}>{(session, index) => {
              const absolute = () => start() + index()
              const selected = () => absolute() === props.selected
              return (
                <box height={1} flexShrink={0} flexDirection="row" justifyContent="space-between" backgroundColor={selected() ? theme.header : theme.panel} paddingX={1}>
                  <text fg={session.active ? theme.sage : selected() ? theme.paper : theme.quiet}>{selected() ? "›" : " "} {session.active ? "● LIVE" : "○ DONE"}  {sessionDate(session)}</text>
                  <text fg={theme.reserve}>{session.engine} · {bytes(session.bytes)} · {truncate(session.id, props.width >= 100 ? 42 : 24)}</text>
                </box>
              )
            }}</For>
          </Show>
        </Show>
      </Panel>
      <box height={1} flexShrink={0} flexDirection="row" justifyContent="space-between" paddingX={1}>
        <text fg={theme.paper}>↑↓ choose · Enter open · Home/End jump · Esc dashboard · q quit</text>
        <text fg={theme.quiet}>{props.sessions.length ? `${props.selected + 1} / ${props.sessions.length}` : ""}</text>
      </box>
    </box>
  )
}

export function TranscriptView(props: { transcript: SessionTranscript; rows: DisplayRow[]; offset: number; pageSize: number; follow: boolean }) {
  const visible = () => props.rows.slice(props.offset, props.offset + props.pageSize)
  const end = () => Math.min(props.rows.length, props.offset + props.pageSize)
  const liveLabel = () => props.transcript.session.active
    ? props.follow ? "● FOLLOWING LIVE" : "◐ LIVE · SCROLLBACK"
    : "○ FINISHED"
  const followAction = () => props.transcript.session.active ? (props.follow ? "pause" : "follow") : "end"
  return (
    <box width="100%" height="100%" flexDirection="column" backgroundColor={theme.canvas} padding={1} gap={1}>
      <box height={3} flexShrink={0} flexDirection="row" alignItems="center" justifyContent="space-between" backgroundColor={theme.header} border borderStyle="rounded" borderColor={props.transcript.session.active ? theme.sage : theme.border} paddingX={1}>
        <box flexDirection="row" gap={1}>
          <text fg={theme.sky}><strong>◆ AUTOTAO</strong></text>
          <text fg={theme.paper}>{props.transcript.session.active ? "LIVE WORK" : "SESSION TRANSCRIPT"}</text>
        </box>
        <text fg={props.transcript.session.active ? theme.sage : theme.quiet}>{liveLabel()} · {sessionDate(props.transcript.session)}</text>
      </box>
      <Panel title={truncate(props.transcript.session.id, 58)} accent={props.transcript.session.active ? theme.sage : theme.sky} style={{ flexGrow: 1 }}>
        <Show when={!props.transcript.truncated}><Show when={props.rows.length === 0}><text fg={theme.quiet}>This session has not emitted readable work yet.</text></Show></Show>
        <Show when={props.transcript.truncated && props.offset === 0}><text fg={theme.brass}>Older output exceeds the 16 MB viewer window and is omitted.</text></Show>
        <For each={visible()}>{(row) => <text fg={transcriptColor[row.kind]}>{row.text}</text>}</For>
      </Panel>
      <box height={1} flexShrink={0} flexDirection="row" justifyContent="space-between" paddingX={1}>
        <text fg={theme.paper}>↑↓/Pg scroll · Home/End · f {followAction()} · s sessions · Esc back</text>
        <text fg={theme.quiet}>{props.rows.length ? `${props.offset + 1}–${end()} / ${props.rows.length}` : "empty"}</text>
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
  const [screen, setScreen] = createSignal<"dashboard" | "sessions" | "transcript" | "usage">("dashboard")
  const [returnScreen, setReturnScreen] = createSignal<"dashboard" | "sessions">("dashboard")
  const [sessions, setSessions] = createSignal<SessionSummary[]>([])
  const [selectedSession, setSelectedSession] = createSignal(0)
  const [transcript, setTranscript] = createSignal<SessionTranscript | null>(null)
  const [transcriptOffset, setTranscriptOffset] = createSignal(0)
  const [follow, setFollow] = createSignal(true)
  const [sessionsLoading, setSessionsLoading] = createSignal(false)
  const [update, setUpdate] = createSignal<string | null>(null)
  const [draftUsage, setDraftUsage] = createSignal<UsagePolicy>({ reservePercent: 10, pace: "even" })
  let refreshInFlight: Promise<void> | null = null
  let transcriptInFlight: Promise<void> | null = null
  let lastLaunchAttemptAt = 0

  const transcriptPageSize = createMemo(() => Math.max(4, dimensions().height - 10))
  const transcriptRows = createMemo(() => formatTranscriptRows(transcript()?.lines ?? [], Math.max(20, dimensions().width - 6)))
  const maxTranscriptOffset = createMemo(() => Math.max(0, transcriptRows().length - transcriptPageSize()))

  createEffect(() => {
    if (follow()) setTranscriptOffset(maxTranscriptOffset())
    else setTranscriptOffset((value) => Math.min(value, maxTranscriptOffset()))
  })

  createEffect(() => {
    const current = message()
    if (!current?.ok) return
    const timer = setTimeout(() => {
      if (message() === current) setMessage(null)
    }, 5_000)
    onCleanup(() => clearTimeout(timer))
  })

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

  const loadSessions = async (): Promise<SessionSummary[]> => {
    setSessionsLoading(true)
    try {
      const selectedId = sessions()[selectedSession()]?.id
      const result = await props.controller.listSessions()
      setSessions(result)
      const preserved = selectedId ? result.findIndex((session) => session.id === selectedId) : -1
      setSelectedSession(preserved >= 0 ? preserved : (value) => Math.max(0, Math.min(value, result.length - 1)))
      return result
    } catch (error) {
      setMessage({ ok: false, summary: error instanceof Error ? error.message : String(error), output: "" })
      return []
    } finally {
      setSessionsLoading(false)
    }
  }

  const loadTranscript = async (id: string, destination?: "dashboard" | "sessions"): Promise<void> => {
    if (transcriptInFlight) return transcriptInFlight
    if (destination) setReturnScreen(destination)
    transcriptInFlight = (async () => {
      try {
        const result = await props.controller.readSession(id)
        setTranscript(result)
        if (destination) {
          setFollow(result.session.active)
          setTranscriptOffset(result.session.active ? Number.MAX_SAFE_INTEGER : 0)
        }
        setScreen("transcript")
      } catch (error) {
        setMessage({ ok: false, summary: error instanceof Error ? error.message : String(error), output: "" })
      } finally {
        transcriptInFlight = null
      }
    })()
    return transcriptInFlight
  }

  const openNewestSession = async () => {
    const result = await loadSessions()
    const newest = result[0]
    if (!newest) {
      setMessage({ ok: false, summary: "No session logs yet", output: "" })
      return
    }
    setSelectedSession(0)
    await loadTranscript(newest.id, "dashboard")
  }

  const browseSessions = async () => {
    setScreen("sessions")
    const currentId = transcript()?.session.id
    const result = await loadSessions()
    if (currentId) {
      const index = result.findIndex((session) => session.id === currentId)
      if (index >= 0) setSelectedSession(index)
    }
  }

  const scrollTranscript = (delta: number) => {
    setFollow(false)
    setTranscriptOffset((value) => Math.max(0, Math.min(maxTranscriptOffset(), value + delta)))
  }

  const reloadOpenTranscript = async () => {
    const current = transcript()
    if (!current) return
    await loadTranscript(current.session.id)
  }

  const openUsageSettings = () => {
    const policy = snapshot()?.gate.policy
    if (policy) setDraftUsage({ ...policy })
    setScreen("usage")
  }

  const saveUsageSettings = async () => {
    if (busy()) return
    setBusy(true)
    try {
      const result = await props.controller.updateUsagePolicy(draftUsage())
      setMessage(result)
      if (result.ok) {
        setScreen("dashboard")
        await refresh()
      }
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
    const name = key.name.toLowerCase()
    if (name === "q") {
      renderer.destroy()
      return
    }

    if (screen() === "usage") {
      if (name === "escape") setScreen("dashboard")
      if (name === "left" || name === "down" || name === "h" || name === "j") {
        setDraftUsage((value) => ({ ...value, reservePercent: Math.max(5, value.reservePercent - 5) }))
      }
      if (name === "right" || name === "up" || name === "l" || name === "k") {
        setDraftUsage((value) => ({ ...value, reservePercent: Math.min(90, value.reservePercent + 5) }))
      }
      if (name === "p" || name === "space") {
        setDraftUsage((value) => ({ ...value, pace: value.pace === "even" ? "eager" : "even" }))
      }
      if (name === "return" || name === "enter") void saveUsageSettings()
      return
    }

    if (screen() === "sessions") {
      if (name === "escape" || name === "left") setScreen("dashboard")
      if (name === "up" || name === "k") setSelectedSession((value) => Math.max(0, value - 1))
      if (name === "down" || name === "j") setSelectedSession((value) => Math.max(0, Math.min(sessions().length - 1, value + 1)))
      if (name === "home" || (name === "g" && !key.shift)) setSelectedSession(0)
      if (name === "end" || (name === "g" && key.shift)) setSelectedSession(Math.max(0, sessions().length - 1))
      if (name === "return" || name === "enter" || name === "right") {
        const selected = sessions()[selectedSession()]
        if (selected) void loadTranscript(selected.id, "sessions")
      }
      if (name === "r") void loadSessions()
      return
    }

    if (screen() === "transcript") {
      if (name === "escape" || name === "left") setScreen(returnScreen())
      if (name === "s") void browseSessions()
      if (name === "up" || name === "k") scrollTranscript(-1)
      if (name === "down" || name === "j") scrollTranscript(1)
      if (name === "pageup") scrollTranscript(-transcriptPageSize())
      if (name === "pagedown") scrollTranscript(transcriptPageSize())
      if (name === "home" || (name === "g" && !key.shift)) {
        setFollow(false)
        setTranscriptOffset(0)
      }
      if (name === "end" || (name === "g" && key.shift)) {
        setFollow(true)
        setTranscriptOffset(maxTranscriptOffset())
      }
      if (name === "f") {
        const next = !follow()
        setFollow(next)
        if (next) setTranscriptOffset(maxTranscriptOffset())
      }
      if (name === "r") void reloadOpenTranscript()
      return
    }

    if (name === "escape") renderer.destroy()
    if (name === "return" || name === "enter") void openNewestSession()
    if (name === "s") void browseSessions()
    if (name === "u") openUsageSettings()
    if (name === "space") {
      setAutopilot((value) => !value)
      setMessage({ ok: true, summary: autopilot() ? "Autopilot resumed" : "Autopilot paused", output: "" })
      maybeLaunch()
    }
    if (name === "?" || name === "h") setHelp((value) => !value)
    if (name === "n" || name === "l") void act("launch")
    if (name === "r") void refresh()
    if (name === "t") void act("tick")
  })

  onMount(() => {
    const cycle = async () => {
      await refresh()
      if (screen() === "sessions") await loadSessions()
      if (screen() === "transcript" && transcript()?.session.id === snapshot()?.run.newestLog) await reloadOpenTranscript()
      maybeLaunch()
    }
    const start = async () => {
      await refresh()
      if (props.automation.tickIntervalMs > 0) await act("tick")
      maybeLaunch()
    }
    void start()

    // Deliberately not awaited: the dashboard's job is to show the usage
    // meters, and it must paint immediately on a box with no network. The
    // check is cached for a day and swallows its own failures, so the worst
    // case is that this row stays empty.
    void checkForUpdate().then((status) => setUpdate(updateNotice(status)))

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
    <Show when={screen() !== "usage"} fallback={
      <UsageSettings policy={draftUsage()} width={dimensions().width} />
    }>
    <Show when={screen() !== "sessions"} fallback={
      <SessionBrowser sessions={sessions()} selected={selectedSession()} width={dimensions().width} height={dimensions().height} loading={sessionsLoading()} />
    }>
      <Show when={screen() !== "transcript" || !transcript()} fallback={
        <TranscriptView transcript={transcript()!} rows={transcriptRows()} offset={Math.min(transcriptOffset(), maxTranscriptOffset())} pageSize={transcriptPageSize()} follow={follow()} />
      }>
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
              updateNotice={update()}
            />
          )}
        </Show>
      </Show>
    </Show>
    </Show>
  )
}
