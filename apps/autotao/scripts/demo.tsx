/**
 * Render the real dashboard against synthetic data and emit an animated SVG.
 *
 *   bun --conditions=browser scripts/demo.tsx [outfile]
 *
 * The data here is invented on purpose. The console's live state comes from an
 * operator's private workspace — problem slugs, targets, ledger lines — and none
 * of that belongs in a README. This renders the same <Dashboard> component the
 * app renders, so the asset cannot drift from the product, but every value in it
 * is fictional.
 *
 * Output is SVG rather than a GIF because the source is already a grid of
 * characters with colors: rasterizing it would only lose fidelity, and text
 * stays crisp at any zoom.
 */
import { testRender } from "@opentui/solid"
import type { CapturedFrame } from "@opentui/core"
import { writeFile } from "node:fs/promises"
import { resolve } from "node:path"
import { Dashboard } from "../src/app.tsx"
import type { ProjectSnapshot } from "../src/protocol.ts"

const COLS = 100
// The dashboard needs 24 rows before its key-hint footer stops being pushed
// off the bottom; below that the flex-grown middle band eats it. It then leaves
// blank rows at the end, which would render as dead space, so frames are
// captured at full height and trimmed to the tallest row anything actually
// occupies.
const CAPTURE_ROWS = 24
const CELL_W = 8.4
const CELL_H = 18
const FONT_SIZE = 14
const PAD = 16
const SECONDS_PER_FRAME = 2.6

const BASE = Date.parse("2026-08-09T14:00:00.000Z")

function snapshot(overrides: {
  runPhase: ProjectSnapshot["run"]["phase"]
  elapsedSeconds?: number
  lastWriteSeconds?: number
  gatePhase: ProjectSnapshot["gate"]["phase"]
  gateReason: string
  used: number
  burn: number
  pipeline: [string, string][]
  ledger?: ProjectSnapshot["ledger"]
  alerts?: string[]
}): ProjectSnapshot {
  return {
    schemaVersion: 1,
    sampledAt: new Date(BASE).toISOString(),
    project: { name: "autotao", root: "/home/you/autotao", adapter: "autotao" },
    engine: "claude",
    model: "claude-opus-4-6",
    run: {
      phase: overrides.runPhase,
      pid: overrides.runPhase === "running" ? 31_884 : null,
      elapsedSeconds: overrides.elapsedSeconds ?? 0,
      lastWriteSeconds: overrides.lastWriteSeconds ?? 0,
      newestLog: "20260809-140000-claude-loop.log",
      newestLogBytes: Math.max(1, (overrides.elapsedSeconds ?? 0)) * 1_400,
    },
    gate: {
      phase: overrides.gatePhase,
      health: overrides.gatePhase === "open" ? "healthy" : overrides.gatePhase === "unknown" ? "warning" : "critical",
      usageRc: overrides.gatePhase === "open" ? 0 : 1,
      capacityRc: 0,
      reason: overrides.gateReason,
      source: "endpoint",
      sampleAgeSeconds: 12,
      uncapped: false,
      policy: { reservePercent: 10, pace: "even" },
      tanks: [
        {
          id: "session",
          label: "Current 5-hour window",
          used: overrides.used,
          burn: overrides.burn,
          ceiling: 90,
          hardCap: 90,
          projected: overrides.used + overrides.burn,
          governed: true,
          finishAt: 90,
          resetAt: (BASE + 2 * 3600 * 1000) / 1000,
          windowMinutes: 300,
        },
        {
          id: "weekly",
          label: "Weekly allowance",
          used: 34,
          burn: 3,
          ceiling: 90,
          hardCap: 90,
          projected: 37,
          governed: true,
          finishAt: 90,
          resetAt: (BASE + 4 * 86_400 * 1000) / 1000,
          windowMinutes: 10_080,
        },
      ],
    },
    resources: { availableMemoryMb: 1_180, loadAverage: [1.4, 1.1, 0.9], papersWanted: [] },
    ledger: overrides.ledger ?? {
      date: "2026-08-09",
      model: "claude-opus-4-6",
      problem: "example-problem",
      target: "the named partial one notch below the conjecture",
      duration: "~1.5h",
      verdict: "fragment",
      outcome: "No target progress; an approach was rigorously eliminated and recorded.",
    },
    pipeline: overrides.pipeline.map(([timestamp, message]) => ({ timestamp, message })),
    alerts: overrides.alerts ?? [],
  }
}

// A believable hour of the loop: waiting under the runway, launching, working,
// then closing the books on a failure — because most runs fail, and a demo that
// only shows a win misrepresents the tool.
const STORY: { snapshot: ProjectSnapshot; caption: string }[] = [
  {
    caption: "Holding: the next run would not fit under the runway.",
    snapshot: snapshot({
      runPhase: "idle",
      gatePhase: "closed",
      gateReason: "next run (28pts) would cross the even runway at 61% — waiting",
      used: 58,
      burn: 0,
      pipeline: [
        ["2026-08-09-12:31:02", "tier-1 decision: idle"],
        ["2026-08-09-13:45:00", "gate closed — runway"],
      ],
    }),
  },
  {
    caption: "The window resets. Now a run fits under the runway.",
    snapshot: snapshot({
      runPhase: "idle",
      gatePhase: "open",
      gateReason: "All launch checks pass",
      used: 31,
      burn: 0,
      pipeline: [
        ["2026-08-09-13:45:00", "gate closed — runway"],
        ["2026-08-09-14:00:11", "5-hour window reset — gate open"],
      ],
    }),
  },
  {
    caption: "One checked run starts. Memory and lock gates pass first.",
    snapshot: snapshot({
      runPhase: "running",
      elapsedSeconds: 96,
      lastWriteSeconds: 3,
      gatePhase: "open",
      gateReason: "All launch checks pass",
      used: 33,
      burn: 26,
      pipeline: [
        ["2026-08-09-14:00:11", "5-hour window reset — gate open"],
        ["2026-08-09-14:02:04", "run launched pid 31884 (cap 90m)"],
      ],
    }),
  },
  {
    caption: "Working. The halfway mark is a hard deliverable, not a checkpoint.",
    snapshot: snapshot({
      runPhase: "running",
      elapsedSeconds: 2_760,
      lastWriteSeconds: 6,
      gatePhase: "open",
      gateReason: "All launch checks pass",
      used: 46,
      burn: 13,
      pipeline: [
        ["2026-08-09-14:02:04", "run launched pid 31884 (cap 90m)"],
        ["2026-08-09-14:47:30", "minute 45 — complete artifact committed"],
      ],
    }),
  },
  {
    caption: "Books closed. The failure is logged, and the line is never deleted.",
    snapshot: snapshot({
      runPhase: "idle",
      gatePhase: "closed",
      gateReason: "next run would cross the even runway — waiting for the window",
      used: 61,
      burn: 0,
      pipeline: [
        ["2026-08-09-15:31:52", "run finished (86m) — triage queued"],
        ["2026-08-09-15:33:10", "tier-1: LOG.md line appended, decision idle"],
      ],
      ledger: {
        date: "2026-08-09",
        model: "claude-opus-4-6",
        problem: "example-problem",
        target: "the named partial one notch below the conjecture",
        duration: "~1.4h",
        verdict: "failed",
        outcome: "Claimed bound did not survive the independently written checker.",
      },
    }),
  },
]

function hex(color: { r: number; g: number; b: number; a: number }): string {
  const channel = (value: number) => Math.round(Math.max(0, Math.min(1, value)) * 255)
  return `#${[channel(color.r), channel(color.g), channel(color.b)].map((v) => v.toString(16).padStart(2, "0")).join("")}`
}

function escapeXml(text: string): string {
  return text.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!)
}

/** Index of the last row with any visible content, or -1 when the frame is empty. */
function lastUsedRow(frame: CapturedFrame): number {
  for (let row = frame.lines.length - 1; row >= 0; row--) {
    if (frame.lines[row]?.spans.some((span) => span.text.trim() || span.bg.a > 0)) return row
  }
  return -1
}

/** One captured terminal frame as a <g> of background rects and text runs. */
function frameToSvg(frame: CapturedFrame, caption: string, index: number, rows: number): string {
  const parts: string[] = []
  frame.lines.slice(0, rows).forEach((line, row) => {
    let col = 0
    for (const span of line.spans) {
      const y = PAD + row * CELL_H
      const x = PAD + col * CELL_W
      const width = span.width * CELL_W
      const background = hex(span.bg)
      // The canvas already paints the page; only deviations are worth emitting.
      if (span.bg.a > 0 && background !== "#12141c") {
        parts.push(`<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${width.toFixed(1)}" height="${CELL_H}" fill="${background}"/>`)
      }
      if (span.text.trim()) {
        const bold = (span.attributes & 1) === 1 ? ' font-weight="700"' : ""
        parts.push(
          `<text x="${x.toFixed(1)}" y="${(y + FONT_SIZE).toFixed(1)}" fill="${hex(span.fg)}"${bold} xml:space="preserve">${escapeXml(span.text)}</text>`,
        )
      }
      col += span.width
    }
  })
  const captionY = PAD + rows * CELL_H + 22
  parts.push(
    `<text x="${PAD}" y="${captionY}" fill="#7d8799" font-style="italic" font-size="13">${escapeXml(caption)}</text>`,
  )
  return `<g class="f" id="f${index}">${parts.join("")}</g>`
}

// Capture every frame first, so the shared height can be the tallest row any
// single frame reaches. Sizing each frame independently would make the image
// jump as the animation cycles.
const captured: CapturedFrame[] = []
for (const beat of STORY) {
  const setup = await testRender(
    () => <Dashboard snapshot={beat.snapshot} width={COLS} autoLaunch help={false} />,
    { width: COLS, height: CAPTURE_ROWS },
  )
  await setup.renderOnce()
  captured.push(setup.captureSpans())
  setup.renderer.destroy()
}

const ROWS = Math.max(...captured.map((frame) => lastUsedRow(frame) + 1))
const width = COLS * CELL_W + PAD * 2
const height = ROWS * CELL_H + PAD * 2 + 30

const frames = captured.map((frame, index) => frameToSvg(frame, STORY[index]!.caption, index, ROWS))

const total = (STORY.length * SECONDS_PER_FRAME).toFixed(1)
// Each frame is visible for exactly one slice and hidden otherwise. Using
// discrete keyframes rather than opacity tweens keeps text from ghosting
// through a cross-fade.
const keyframes = STORY.map((_, index) => {
  const start = (index / STORY.length) * 100
  const end = ((index + 1) / STORY.length) * 100
  const before = Math.max(0, start - 0.01)
  return `#f${index}{animation:f${index} ${total}s steps(1,end) infinite}
@keyframes f${index}{0%{opacity:0}${before.toFixed(2)}%{opacity:0}${start.toFixed(2)}%{opacity:1}${(end - 0.01).toFixed(2)}%{opacity:1}${end.toFixed(2)}%{opacity:0}100%{opacity:0}}`
}).join("\n")

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width.toFixed(0)}" height="${height.toFixed(0)}" viewBox="0 0 ${width.toFixed(0)} ${height.toFixed(0)}" font-family="ui-monospace, SFMono-Regular, Menlo, DejaVu Sans Mono, Consolas, monospace" font-size="${FONT_SIZE}">
<title>autotao — one iteration of the loop</title>
<style>
.f{opacity:0}
${keyframes}
</style>
<rect width="100%" height="100%" fill="#12141c" rx="8"/>
${frames.join("\n")}
</svg>
`

const outfile = process.argv[2] ?? resolve(import.meta.dir, "../../../docs/demo.svg")
await writeFile(outfile, svg)
console.log(`Wrote ${outfile} — ${STORY.length} frames, ${total}s loop, ${(svg.length / 1024).toFixed(0)}KB`)
