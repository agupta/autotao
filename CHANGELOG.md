# Changelog

All notable software changes to AutoTao are recorded here. Mathematical work belongs in
`attempts/LOG.md`; infrastructure work does not.

## Unreleased

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
- Standalone Bun build with configurable target, output path, and libc.
- Parser, renderer, state-import, permissions, and atomic-write tests.

### Changed

- The OpenTUI console is the foreground supervisor; the former Bash renderer is now a thin
  compatibility entry point.
- Campaign descriptors and campaign state are intentionally absent from the new protocol and UI.

### Removed

- Campaign descriptors, probes, rendering, and example configuration from the distributed
  supervision console.

### Security

- `.autotao/` is ignored repository-wide.
- State import excludes raw-log contents and process environments.
