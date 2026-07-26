# Problem-selection rubric

Score each candidate 0–2 on the six features. Only problems scoring ≥ 8/12 get a
`problems/*.md` file. Record the score and the date the open-status was last verified.

| # | Feature | 0 | 2 |
|---|---------|---|---|
| 1 | **Elementary formalizability** — statement pins down completely in a paragraph, edge cases enumerable | needs heavy theory to state | one paragraph, all edge cases listable |
| 2 | **Verification asymmetry** — success artifact is cheap to check relative to finding it | success = long proof needing expert-months | success = certificate a script checks in seconds |
| 3 | **Near-miss / active-program literature** — published almost-results with localized, articulable failure reasons, or a live publication ladder to extend | dead area, no footholds | known near-miss object or an active "extend the parameter" program |
| 4 | **Approach diversity** — many independent known formulations/reductions for a swarm to spread across | one known angle | ≥ 5 genuinely different formulations |
| 5 | **Under-searched direction** — sociological reasons a direction (usually counterexample) got little human effort | direction heavily mined (big computer searches done) | famous belief one way, ~no serious search the other way |
| 6 | **Referee-ready venue** — a journal that already publishes computer-assisted results in this exact area | no precedent | direct precedent in the last 2 years |

Also record, for the human in the loop:

- **Verification load:** `mechanical` (script) / `part-iii-readable` (the operator can referee it) /
  `needs-expert` (recruit a friend). Prefer the first two; a `needs-expert` problem must
  score 2 on feature 2 to be worth it.
- **Believed direction** and whether we push with or against consensus. Pushing against
  (counterexample hunting) is where feature 5 usually pays.
- **Ambition tier:** `named-partial` (default, 80% of runs) vs `full-conjecture`
  (20% of runs).

## Anti-patterns (auto-reject)

- Problems whose small cases are already exhausted by massive computer search *and* whose
  only remaining attack is more of the same search (we cannot out-brute-force McKay).
- Problems where even the *statement* of a partial result requires machinery nobody in the
  loop can referee.
- Mega-famous problems (RH, Collatz, twin primes): crank-adjacent, expert scrutiny is
  hostile, and the tractable partials are already strip-mined.
