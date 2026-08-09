#!/usr/bin/env bun
import { access } from "node:fs/promises"
import { join } from "node:path"
import { render } from "@opentui/solid"
import { App } from "./app.tsx"
import { loadConfig } from "./config.ts"
import { RepositoryController } from "./repository.ts"

function help(): string {
  return `AutoTao — autonomous workload supervision

Usage:
  autotao                 Open the terminal dashboard
  autotao import [--json] Import legacy console state into .autotao/state.json
  autotao state --json    Print AutoTao's persisted last-known state
  autotao snapshot --json Print one versioned state snapshot
  autotao doctor          Validate configuration and adapter paths
  autotao --help          Show this help

Dashboard keys: Space pause/resume autopilot · n run once · ? help · q quit`
}

async function doctor(root: string): Promise<number> {
  const required = [
    "scripts/usage.sh",
    "scripts/codex-usage.sh",
    "scripts/capacity.sh",
    "scripts/run-engine.sh",
    "scripts/run-model.sh",
    "scripts/invoke-agent.sh",
    "scripts/result-info.sh",
    "attempts/LOG.md",
  ]
  let ok = true
  for (const relative of required) {
    try {
      await access(join(root, relative))
      console.log(`ok  ${relative}`)
    } catch {
      ok = false
      console.log(`missing  ${relative}`)
    }
  }
  return ok ? 0 : 1
}

const args = process.argv.slice(2)
if (args.includes("--help") || args.includes("-h")) {
  console.log(help())
  process.exit(0)
}

const loaded = await loadConfig()
const controller = new RepositoryController(loaded.root, loaded.config)

if (args[0] === "snapshot") {
  const snapshot = await controller.snapshot()
  console.log(args.includes("--json") ? JSON.stringify(snapshot, null, 2) : snapshot)
  process.exit(0)
}

if (args[0] === "import") {
  const state = await controller.importState()
  if (args.includes("--json")) console.log(JSON.stringify(state, null, 2))
  else {
    console.log(`Imported legacy console state into ${loaded.root}/.autotao/state.json`)
    console.log(`engine=${state.snapshot.engine} gate=${state.snapshot.gate.phase} run=${state.snapshot.run.phase}`)
  }
  process.exit(0)
}

if (args[0] === "state") {
  const { LocalStateStore } = await import("./state-store.ts")
  const state = await new LocalStateStore(loaded.root).read()
  if (!state) {
    console.error("No imported AutoTao state. Run `autotao import` first.")
    process.exit(1)
  }
  console.log(args.includes("--json") ? JSON.stringify(state, null, 2) : state)
  process.exit(0)
}

if (args[0] === "doctor") {
  process.exit(await doctor(loaded.root))
}

if (args.length > 0) {
  console.error(`Unknown command: ${args.join(" ")}\n\n${help()}`)
  process.exit(2)
}

if (!process.stdin.isTTY || !process.stdout.isTTY) {
  console.error("AutoTao needs an interactive terminal. Use `autotao snapshot --json` for headless output.")
  process.exit(2)
}

await render(() => <App controller={controller} refreshMs={loaded.config.refreshMs} automation={loaded.config.automation} />, {
  exitOnCtrlC: true,
  useMouse: true,
})
