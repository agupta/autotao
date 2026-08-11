#!/usr/bin/env bun
import { access } from "node:fs/promises"
import { join } from "node:path"
import { createInterface } from "node:readline/promises"
import { render } from "@opentui/solid"
import { App } from "./app.tsx"
import { discoverConfigChoices, isInside, loadConfig, type ConfigScope } from "./config.ts"
import { RepositoryController } from "./repository.ts"
import { VERSION, checkForUpdate, performUpdate } from "./update.ts"
import { pruneExtractedLibraries } from "./tmp-prune.ts"

function help(): string {
  return `AutoTao — autonomous workload supervision

Usage:
  autotao                 Open the terminal dashboard
  autotao state --json    Print the last snapshot AutoTao persisted
  autotao snapshot --json Print one versioned state snapshot
  autotao doctor          Validate configuration and adapter paths
  autotao update          Install the latest release
  autotao update --check  Report whether a newer release exists
  autotao --global        Use the shared AutoTao workspace
  autotao --local         Use state from the current project
  autotao --version       Print the version
  autotao --help          Show this help

Dashboard keys: Enter live work · s sessions · u usage plan · Space pause/resume · n run once · ? help · q quit`
}

function parseScope(rawArgs: string[]): { args: string[]; scope: ConfigScope | null } {
  let scope: ConfigScope | null = null
  const args: string[] = []
  for (const arg of rawArgs) {
    if (arg === "--global" || arg === "--local") {
      const next = arg.slice(2) as ConfigScope
      if (scope && scope !== next) throw new Error("Choose only one of --global or --local")
      scope = next
    } else {
      args.push(arg)
    }
  }
  const environmentScope = process.env.AUTOTAO_SCOPE
  if (environmentScope && environmentScope !== "global" && environmentScope !== "local") {
    throw new Error(`AUTOTAO_SCOPE must be global or local, got: ${environmentScope}`)
  }
  if (scope && environmentScope && scope !== environmentScope) {
    throw new Error(`CLI scope --${scope} conflicts with AUTOTAO_SCOPE=${environmentScope}`)
  }
  const inheritedScope = environmentScope as ConfigScope | undefined
  return { args, scope: scope ?? inheritedScope ?? null }
}

async function selectConfig(
  startDirectory: string,
  scope: ConfigScope | null,
  interactiveDashboard: boolean,
): Promise<string | undefined> {
  if (process.env.AUTOTAO_CONFIG) return undefined
  const choices = await discoverConfigChoices(startDirectory)
  if (scope) {
    const selected = choices[scope]
    if (!selected) throw new Error(`No ${scope} AutoTao state is available from ${startDirectory}`)
    return selected
  }
  if (choices.global && choices.local) {
    const runningFromGlobalHome = choices.globalHome
      ? isInside(startDirectory, choices.globalHome)
      : false
    if (interactiveDashboard && !runningFromGlobalHome) {
      const input = createInterface({ input: process.stdin, output: process.stdout })
      try {
        console.log("AutoTao found two state profiles:\n")
        console.log(`  [G] Global  ${choices.global}`)
        console.log(`  [L] Local   ${choices.local}\n`)
        const answer = (await input.question("Use which state? [G/l] ")).trim().toLowerCase()
        return answer === "l" || answer === "local" ? choices.local : choices.global
      } finally {
        input.close()
      }
    }
    return choices.global
  }
  return choices.global ?? choices.local ?? undefined
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
    "scripts/safe-compute.sh",
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

// Before anything else, and for every subcommand: a compiled binary extracts
// its embedded native library into $TMPDIR on startup and leaves it there, so
// each invocation costs ~19MB of a filesystem that is usually RAM. Clearing
// what previous runs left is the only place we can do it — the extraction has
// already happened by the time this file executes. See tmp-prune.ts.
pruneExtractedLibraries()

const parsed = parseScope(process.argv.slice(2))
const args = parsed.args
if (args.includes("--help") || args.includes("-h")) {
  console.log(help())
  process.exit(0)
}

if (args.includes("--version") || args.includes("-v")) {
  console.log(VERSION)
  process.exit(0)
}

// Updating must not depend on a valid project: a botched autotao.json is
// exactly when you most want to be able to move to a fixed release.
if (args[0] === "update") {
  if (args.includes("--check")) {
    const status = await checkForUpdate({ force: true })
    if (status.latest == null) {
      console.log(`autotao ${status.current} — could not reach GitHub to check for updates`)
      process.exit(1)
    }
    console.log(
      status.available
        ? `autotao ${status.current} — ${status.latest} is available. Run \`autotao update\`.`
        : `autotao ${status.current} is the latest release.`,
    )
    process.exit(0)
  }
  process.exit(await performUpdate())
}

const startDirectory = process.env.AUTOTAO_START_DIR ?? process.cwd()
const selectedConfig = await selectConfig(
  startDirectory,
  parsed.scope,
  args.length === 0 && process.stdin.isTTY && process.stdout.isTTY,
)
const loaded = await loadConfig(startDirectory, selectedConfig)
const controller = new RepositoryController(loaded.root, loaded.config)

if (args[0] === "snapshot") {
  const snapshot = await controller.snapshot()
  console.log(args.includes("--json") ? JSON.stringify(snapshot, null, 2) : snapshot)
  process.exit(0)
}


if (args[0] === "state") {
  const { LocalStateStore } = await import("./state-store.ts")
  const state = await new LocalStateStore(loaded.root).read()
  if (!state) {
    console.error("No persisted state yet. Run `autotao snapshot` or open the dashboard first.")
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
