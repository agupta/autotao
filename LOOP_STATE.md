# Loop state

The loop reads and rewrites this file every iteration. It is also the **operator's
steering wheel** — the `priority:` list below overrides index rotation entirely.

```
iteration: 0
last_problem: none
sourcing_counter: 0
```

- **iteration** — incremented by each loop iteration.
- **last_problem** — slug of the last attempted problem; rotation resumes after it.
- **sourcing_counter** — at ≥ 4, the next iteration is a SOURCING iteration
  (`harness/formalize.md` on a new candidate) and the counter resets. This is what keeps
  new problems entering the portfolio.
This file no longer carries `run_model:`. What the solving agents run as — engine, model
and reasoning effort — is configured in **one place, `autotao.json`**:

```json
"engine": "claude", "model": "claude-fable-5", "effort": "xhigh"
```

The app exports those as `RUN_ENGINE` / `RUN_MODEL` / `RUN_EFFORT` into every command it
spawns, and `run-model.sh` / `run-once.sh` already prefer the environment over their own
fallbacks. Splitting them across this file and a hardcoded script default meant the model
an operator selected was not reliably the model that ran. A stale `run_model:` line here
is now ignored by the app-launched loop; delete it. (`RUN_MODEL=... bash scripts/...`
still works for a one-off manual override.)

## priority

Uncomment and list slugs to override rotation. The loop takes the first entry whose
ACTIVE target is unresolved and which does not already have 2+ consecutive dead runs.

```
# priority:
#   - my-problem
#   - my-other-problem
```

Remove the list to return to `problems/INDEX.md` rotation.

## push

Nothing is pushed to any remote unless this file contains the line `push: allowed`.
Absent that line, runs commit locally and stop. There is no override flag, and no
unattended run makes a public claim, opens a PR, or contacts anyone under any
circumstances.

## Operator notes

Free-form. The loop reads this section, so it is the place to record decisions you want
the next iteration to respect: a certification waiver, a parked problem and why, a
deadline, a known-broken dependency. Convert relative dates to absolute — the run has no
memory of when you wrote this.
