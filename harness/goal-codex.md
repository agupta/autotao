# Codex /goal text — paste after enabling goals

Enable once:

```bash
codex features enable goals
```

Then in an interactive `codex` session in this repo, set:

```
/goal Run autonomous research-loop iterations per harness/loop.md, one full
iteration at a time (orient → choose job → run the composed track harness with
multiagent v2 → close out per the output contract → update LOOP_STATE.md and commit
locally). Consult README.md and verify/README.md first, plus any repo-level agent instructions
(CLAUDE.md / AGENTS.md) if present; their rules are
binding. Done means: either an iteration produces an outcome of partial-or-better
whose verification artifact passes and NEEDS_HUMAN.md is written (stop immediately so
the operator can review), or 8 iterations complete, whichever comes first. Progress is proven
by new committed artifact directories under attempts/ and appended LOG.md lines — an
iteration with no LOG.md line does not count. Do not push, do not contact anyone, do
not claim results publicly.
```

Manage with `/goal` (status), `/goal pause`, `/goal resume`, `/goal clear`.

Why 8 iterations: a bounded stopping condition keeps the run reviewable and prevents
plan-limit exhaustion; relaunch the goal to continue — LOOP_STATE.md carries the
rotation forward.
