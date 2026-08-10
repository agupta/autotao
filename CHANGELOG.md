# Changelog

All notable software changes to AutoTao are recorded here. Mathematical work belongs in
`attempts/LOG.md`; infrastructure work does not.

## Unreleased

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
