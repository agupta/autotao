# AutoTao console

The AutoTao console is a campaign-free Solid/OpenTUI client for the repository's
supervision layer. Rendering is separate from orchestration: the client consumes a
versioned snapshot and invokes only the explicit commands in `autotao.json`.

The native `autotao` adapter reads the run lock, raw-log metadata, quota predicates,
supervisor events, paper requests, and mathematical attempt ledger already maintained by
the shell harness. The `legacy-new-math` adapter name is retained as a compatibility alias
for existing installations; both implement the same protocol and UI.

Automation is explicit in `autotao.json`. The checked-in harness config enables a
15-minute supervisor tick and gated auto-launch checks. Launch commands remain the final
authority and re-run quota, memory, and run-lock checks.

The usage policy is expressed as a reserve, not an internal gate ceiling. With
`reservePercent: 5` and `pace: "even"`, AutoTao draws a straight usage runway from the
window start to 95% at reset. Ordinary interactive usage counts toward the runway and
AutoTao starts work only when the next estimated run fits below it. `pace: "eager"` skips
the time-based runway and consumes available headroom immediately.

Engine selection is explicit (`engine: "claude" | "codex"`) and is passed to
every status, launch, and supervisor command. It therefore survives terminal and tmux
restarts instead of depending on an inherited shell environment.

The persistent controls use plain-language actions: `Enter` follows the current run's
readable work transcript, `s` browses current and past sessions, `Space` pauses or resumes
autopilot, `n` starts one checked run, `?` explains the screen, and `q` quits. In a
transcript, arrows and Page Up/Down scroll, Home/End jump, and `f` toggles live follow.
Refresh (`r`) and a manual maintenance tick (`t`) remain available from the help view.

Session history is read lazily from the project's existing `attempts/raw-logs/` files.
It is not copied into `.autotao/state.json`, the mathematical ledger, the package, or a
release artifact. The browser presents agent messages and observable activity—commands,
outputs, file changes, tools, and verification results—and intentionally omits internal
reasoning payloads. Individual logs larger than 16 MB open at their newest 16 MB.

## Development

Requires Bun 1.2 or newer:

```bash
cd apps/autotao
bun install --frozen-lockfile
bun run verify
bun run dev
```

From the repository root, `bash scripts/autotao.sh` runs a compiled local binary when one
exists and otherwise uses Bun. When `.autotao/workspace/autotao.json` exists, configuration
discovery prefers that ignored private project over the public checkout's clean template.
Headless integrations consume the same selected project state model:

```bash
bash scripts/autotao.sh snapshot --json
bash scripts/autotao.sh doctor
```

## State migration

Existing installations may import the last durable state written by the retired Bash
console once:

```bash
bash scripts/autotao.sh import
bash scripts/autotao.sh state --json
```

The import whitelists the effective gate, engine, reset, lifecycle cursors, and escalation
marker. It never copies raw logs or process environments. AutoTao then maintains its
atomic last-known snapshot at `.autotao/state.json`; the complete `.autotao/` directory is
ignored by git. Normal snapshot updates are runtime persistence, not repeated imports.

## Distribution

`bun run build` emits a standalone executable at `dist/autotao`. Release jobs can set
`AUTOTAO_BUILD_TARGET`, `AUTOTAO_BUILD_OUTPUT`, and `AUTOTAO_LIBC` for each Bun target.
The executable discovers `autotao.json` by walking upward from its current directory, so
one binary can supervise multiple configured checkouts.

The package and repository are MIT licensed. No runtime state, mathematical attempt data,
raw logs, credentials, or operator environment is compiled into release artifacts.
