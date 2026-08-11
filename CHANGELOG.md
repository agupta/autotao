# Changelog

All notable software changes to AutoTao are recorded here. Mathematical work belongs in
`attempts/LOG.md`; infrastructure work does not.

## Unreleased

### Added

- An in-TUI usage-plan editor (`u`) persists the protected allowance and even/eager
  pacing policy atomically, with a 5% minimum watchdog reserve.
- The mature research-loop contracts from `new-math`: a durable 50/30/20 target ladder,
  per-attempt credit/preemption checks, proof-first selection, adaptive agent rounds, and
  bounded heavy computation via `scripts/safe-compute.sh`.
- A reproducible `uv` verification environment and `scripts/selftest-harness.sh`, which
  prevents future packaging work from silently dropping replacement-critical behavior.
- `docs/MIGRATION.md` documents existing-workspace compatibility and target-state
  translation from `new-math`.
- The dashboard shows what the *running* attempt is doing, not just the last closed
  one. It reads that attempt's `RESULT.md` — the artifact `harness/loop.md` requires it
  to ship by the halfway mark — for the run's own attempt number, ambition tier, selected
  target, section headings (its actual lines of attack) and its outcome paragraph. Before
  that artifact exists it falls back to the newest agent message in the transcript. The
  ledger's newest line is demoted to a "previously" line, since it describes the previous
  attempt and frequently a different problem entirely.
- The dashboard says what problem is being worked on, in words. It reads the problem
  file's title, an optional `## IN PLAIN TERMS` section, and the ACTIVE named target,
  and shows those instead of only a slug. `problems/TEMPLATE.md` documents the optional
  section. Reading is display-only; nothing here reaches the loop.
- Internal bookkeeping is translated rather than shown raw. `T1 ACTIVE (attempt A=102,
  tier P)` now reads as the attempt number, the named target, and the ambition tier in
  words — publishable rung, decisive bottleneck, or full conjecture, per the schedule in
  `harness/loop.md`.

### Changed

- Usage refreshes are serialized, throttled, OAuth-refresh aware, and honor Retry-After;
  a newer interactive status-line sample can supply aggregate Claude limits without an
  extra endpoint request.
- Operational alerts and pending paper requests are visible in the TUI, rather than only
  present in the headless snapshot.
- A two-column dashboard above 100 columns: the header, usage plan and run status stack
  down a narrow left column, and the mathematics gets the whole right-hand side, where
  its text wraps instead of being cut off. Narrower terminals keep the previous layouts.

### Fixed

- Codex solve runs use the current `--approve-for-me` interface, and
  `RESUME_SESSION` now invokes `codex exec resume` instead of starting a fresh session.
- The TUI and shell gate now both reject a projected run exactly at the launch ceiling.
- Pre-launch orphan cleanup is wired into the only launch entrypoint; the reaper is no
  longer a diagnostic that nothing calls.
- Panel content that was taller than its panel spilled outside the border and painted
  over whatever occupied those rows, so two lines merged into one and read as corrupted
  text — `20h 23m elapsed` arriving as `208hi23moelapsed`. Panels now clip their content.
- The orphan reaper protected the retired console's process name but not `autotao`, so a
  running console was reapable. It now excludes the name it actually runs under.

### Removed

- The legacy-console compatibility layer: `autotao import`, `attempts/supervision/.gate.cache`
  overlay, and the `legacy-new-math` adapter alias. Nothing has written that cache since the
  Bash console was retired, yet it was read on every refresh — six file reads per tick behind
  a second, silently-overriding source of truth for gate state, engine, and model. The live
  predicates in `scripts/` are now the only source. `autotao.json` must set
  `project.adapter: "autotao"`.
- `scripts/supervise-console.sh`, a shim that only re-executed `scripts/autotao.sh`.

## 0.1.0 — 2026-08-10

First public release.

### Added

- Prebuilt binaries for Linux and macOS on x64 and arm64, published to GitHub Releases with
  SHA-256 checksums, plus `scripts/install.sh` for a one-line install.
- `autotao update` — verifies the published checksum, runs the downloaded binary once
  before trusting it, and replaces the running executable atomically. `autotao update
  --check` reports without installing. A cached daily check surfaces a notice in the
  dashboard's idle status row; `AUTOTAO_NO_UPDATE_CHECK=1` disables it.
- `autotao --version`.
- macOS support. `scripts/portable.sh` carries every place GNU and BSD userlands diverge —
  available memory, file metadata, checksums, process listings, elapsed time, per-process
  environments and working directories, and the single-instance lock.
- `scripts/preflight.sh` — checks this box can run the harness and names the exact remedy
  for anything missing, rather than failing partway into a run that costs real allowance.
- CI on Linux and macOS: typecheck, tests, standalone build, shellcheck, and behavioral
  tests that plant an orphaned process and assert the reaper scopes and kills it.
- Contribution, security, and conduct documentation, and issue templates.

### Changed

- The supervisor tick's single-instance lock no longer uses `flock`, which macOS does not
  ship. The replacement is a mkdir lock carrying its holder's pid, so a lock left behind by
  a killed tick is reclaimed rather than deadlocking against its own corpse.
- A run refuses to start when no `timeout` implementation is available, instead of silently
  running uncapped. The ship-by-halfway discipline is derived from the wall, so a run that
  believes in a deadline it does not have paces itself wrongly.

### Fixed

- Released binaries no longer leak ~19MB into the temp directory on every invocation.
  OpenTUI reaches its native core through `dlopen`, so a `bun build --compile` binary
  extracts the embedded library to `$TMPDIR` at startup under a fresh name and never
  removes it. Running from source never did this, and an ephemeral CI runner cannot
  observe it, so it only affected real installations — where `/tmp` is usually a tmpfs
  sharing RAM with the runs. Startup now clears extractions older than an hour, which
  leaves the current process's own copy and any concurrent instance untouched.
- The compiled binary no longer fails to start when its working directory contains a
  `bunfig.toml` declaring a preload. The Solid preload is now passed explicitly by the dev
  script rather than through a config file that any nearby directory could shadow.

## Pre-release

### Added

- Campaign-free Solid/OpenTUI supervision console with responsive 80-column and wide layouts.
- Versioned TypeScript state protocol and headless JSON snapshots.
- Native AutoTao repository adapter plus the `legacy-new-math` compatibility alias.
- Persistent per-project Claude/Codex engine selection propagated to all adapter commands.
- One-time, whitelisted import of legacy console state into atomic owner-only local storage.
- Configurable periodic supervisor ticks and gated auto-launch checks, preserving the
  autonomous behavior of the retired foreground console.
- Reset-aware usage runway: protect a simple percentage reserve and let AutoTao fill only
  the gap between normal usage and an even path to the finish line.
- Plain-language TUI controls, in-product help, and a usage-first observatory visual system.
- Current and historical session browser with readable agent/tool transcripts, keyboard
  scrollback, and live-follow mode.
- Ignored private workspace initialization and automatic discovery, separating distributable
  application/templates from operator-owned mathematical state and Git history.
- Global/local state selection with an ambiguity-only startup chooser, CLI/environment
  overrides, a machine-local global-profile pointer, and an optional PATH launcher.
- Standalone Bun build with configurable target, output path, and libc.
- Parser, renderer, state-import, permissions, and atomic-write tests.

### Changed

- The OpenTUI console is the foreground supervisor; the former Bash renderer is now a thin
  compatibility entry point.
- Campaign descriptors and campaign state are intentionally absent from the new protocol and UI.
- Action feedback uses a dedicated status row; successful notices clear after five seconds,
  while errors remain visible until the next action.
- Primary mathematical targets wrap into the available dashboard space instead of being
  shortened to arbitrary character counts; long outcomes use a clear headline and point to
  the complete work transcript.
- The dashboard suppresses a redundant project label when the native workspace is itself
  named AutoTao.

### Removed

- Campaign descriptors, probes, rendering, and example configuration from the distributed
  supervision console.

### Security

- `.autotao/` is ignored repository-wide.
- State import excludes raw-log contents and process environments.
