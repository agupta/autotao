# Migrating from new-math

AutoTao is the maintained replacement for the `new-math` harness, not merely a console
that watches it. The public repository now owns both layers:

| Capability | AutoTao home |
|---|---|
| autonomous orient/select/attempt/close loop | `harness/loop.md` |
| three-tier target schedule and operator steering | `LOOP_STATE.md`, `problems/TEMPLATE.md` |
| verification and append-only denominator | `verify/README.md`, `attempts/LOG.md` |
| Claude and Codex launch/watchdog pipeline | `scripts/run-once.sh`, `scripts/launch.sh` |
| paced reserve-based limit policy | `autotao.json`, `scripts/usage.sh` |
| interactive supervision and transcripts | `apps/autotao/` |
| bounded heavy computation | `scripts/safe-compute.sh` |

`scripts/selftest-harness.sh` guards the replacement-critical contracts so a later UI or
packaging change cannot silently reduce AutoTao back to a dashboard.

## Existing research workspace

Do not copy attempt directories into the public checkout and do not rewrite the legacy
repository's history. Install the AutoTao binary, leave the existing research repository
as the local workspace, and launch from there:

```bash
cd /path/to/new-math
autotao --local
```

Set `project.adapter` to `"autotao"`; it is the only accepted value. The TUI reads the
same lock, ledger, raw sessions, limits, paper requests, and supervision markers, and
samples them live — there is no import step.

For a fresh project, use `bash scripts/init-workspace.sh` from the AutoTao checkout. That
creates an ignored private clone containing the current harness. Move mathematical state
only when you intentionally want a new Git history; the append-only ledger and every
artifact must move together.

## Configuration translation

Legacy gate/watchdog caps are backend implementation details. Express the operator's goal
as a protected reserve and pacing mode instead:

```json
"usage": {
  "reservePercent": 10,
  "pace": "even"
}
```

The normal interface is the TUI's `u` screen. It writes those two fields atomically.
`scripts/budgets.conf` retains only expected per-run burn, the watchdog margin, and safe
fallbacks for direct shell or cron callers. Do not translate old launch and kill ceilings
into additional UI settings; that recreates multiple sources of truth.

## Target-state translation

Legacy `ACTIVE TARGET` files remain runnable. When editing them, add:

- a credit/preemption ledger;
- a `publishable-rung` label on ACTIVE;
- a natural `decisive-bottleneck` target when one exists;
- the exact `full-conjecture` target.

Add `attempt_counter` and `research_mode` to `LOOP_STATE.md` as shown in the shipped
template. Reconcile `attempt_counter` from prior ATTEMPT ledger rows before the first run;
SOURCING and infrastructure rows do not count.

## What is deliberately not migrated

Campaign-specific probes, private problem files, licensed paper text, raw sessions,
operator credentials, and historical attempt artifacts do not belong in the public
repository. They remain in the private workspace.
