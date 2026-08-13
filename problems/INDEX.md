# Problem index

This file ships empty on purpose — the problem set is yours. Add a row per vetted
problem; the loop rotates through this table when `LOOP_STATE.md` has no `priority:` list.

Score every candidate against `criteria.md` first (≥ 8/12 to enter), write the file from
`TEMPLATE.md` or via `harness/formalize.md`, then add it here. See `SOURCING.md` for
where candidates come from.

## Vetted (files in this directory)

| Problem | Track | Score | Status / credit checked | ACTIVE target | Verification load |
|---|---|---|---|---|---|
| _(none yet — add your first problem)_ | | | | | |

Columns:

- **Track** — A (proof-shaped, `harness/portfolio.md`), B (certificate-shaped,
  `harness/repair.md`), or A+B if the named targets are mixed.
- **Score** — total from `criteria.md`, out of 12.
- **Status / credit checked** — dates when official status and competing claims were last
  checked. Official status may be reused for 7 days; the credit/preemption check runs
  before every attempt.
- **ACTIVE target** — the named partial the absolutist prompt is pointed at, not the full
  conjecture.
- **Verification load** — `mechanical` / `elementary-readable` / `needs-expert`. Prefer
  the first two. A `needs-expert` problem must score 2 on feature 2 to be worth it.

## Backlog (unvetted — run `harness/formalize.md` before use)

Candidates that look promising but have no problem file yet. Keep the triage notes here,
including the rejections and why — re-triaging the same candidate every sourcing pass is
the most common way this section wastes budget.

Suggested format:

- **<candidate>** — one-line statement. Source. Why it might score well; what the
  caveat is. `TRIAGED <date>: <verdict>`.
- **<candidate>** — `AUTO-REJECTED <date>`: small cases exhausted to n = <N> per
  OEIS A###### — `criteria.md` anti-pattern, do not re-triage.
