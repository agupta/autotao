<!-- Console changes: describe the behavior change. Harness changes: see below. -->

**What this changes**

**Why**

<!--
If this touches harness/, scripts/, or criteria.md and REMOVES or relaxes an existing
directive: those are usually there because a specific run failed a specific way, with the
date in the comment. Say what makes that failure no longer possible.
-->

**Checks**

- [ ] `cd apps/autotao && bun run verify`
- [ ] `bash scripts/preflight.sh`
- [ ] `shellcheck scripts/*.sh` (if shell changed)
- [ ] No `.autotao/`, `attempts/raw-logs/`, or `papers/*.pdf` in the diff
- [ ] `CHANGELOG.md` updated under `## Unreleased` (if user-visible)
