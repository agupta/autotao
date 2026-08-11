# Loop state

The loop reads and rewrites this file every iteration. It is also the **operator's
steering wheel** — `next_problem:` and `priority:` directives override index rotation.

```
iteration: 0
attempt_counter: 0
last_problem: none
sourcing_counter: 0
research_mode: proof-first
run_model: claude-opus-5
```

- **iteration** — incremented by each loop iteration.
- **attempt_counter** — increments only when an ATTEMPT selects a target. It drives the
  repeating `P, P, B, P, F, B, P, B, P, F` ambition schedule.
- **last_problem** — slug of the last attempted problem; rotation resumes after it.
- **sourcing_counter** — at ≥ 4, the next iteration is a SOURCING iteration
  (`harness/formalize.md` on a new candidate) and the counter resets. This is what keeps
  new problems entering the portfolio.
- **research_mode** — `proof-first` keeps computation in a supporting role. Change it to
  `open` when computation-shaped targets should be eligible for autonomous selection.
- **run_model** — full model id, not an alias; aliases do not resolve. A `RUN_MODEL` env
  var overrides it. The launch gate checks the tank this exact model will draw from.

## priority

`next_problem: slug` is a one-shot directive and is removed after selection. A persistent
priority list overrides problem rotation but not the scheduled ambition tier. Use
`slug@T2` only when you intentionally want to pin an exact target.

```
# priority:
#   - my-problem
#   - my-other-problem@T2
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
