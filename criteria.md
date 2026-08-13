# Problem-selection rubric

Score each candidate 0–2 on the six features. Only problems scoring ≥ 8/12 get a
`problems/*.md` file. Record the score and the date the open-status was last verified.

## Credit / preemption gate (before scoring)

`OPEN` is not enough. A problem can remain officially open while a credible proof,
disproof, construction, or strong partial result is awaiting review. Before admitting
or selecting a problem:

1. Inspect the live primary problem page and every linked proof, formalisation,
   AI-attempt, discussion, comment, and history item. Search the full problem and each
   proposed target with `proof`, `preprint`, `Lean`, and `Coq`.
2. Record each credible recent claim with its date, authorship, accessible artifact,
   exact scope, and review status. A search snippet or unsupported post is not enough.
3. Mark a credible full-resolution claim awaiting independent review `PENDING REVIEW`
   and park the problem. This is a conservative credit-risk decision, not an endorsement.
4. Mark a partial target covered by a credible result `PREEMPTED`. Proceed only with a
   demonstrably non-overlapping target.
5. Treat an unread or unreachable likely source of prior art as a blocker for novelty
   claims, not as permission to continue.

| # | Feature | 0 | 2 |
|---|---------|---|---|
| 1 | **Elementary formalizability** — statement pins down completely in a paragraph, edge cases enumerable | needs heavy theory to state | one paragraph, all edge cases listable |
| 2 | **Verification tractability** — a serious result can be independently checked without an expert-month | opaque or highly specialized proof | short conceptual proof, or a certificate a script checks in seconds |
| 3 | **Near-miss / active-program literature** — published almost-results with localized, articulable failure reasons, or a live publication ladder to extend | dead area, no footholds | known near-miss object or an active "extend the parameter" program |
| 4 | **Approach diversity** — many independent known formulations/reductions for a swarm to spread across | one known angle | ≥ 5 genuinely different formulations |
| 5 | **Under-searched direction** — sociological reasons a direction (usually counterexample) got little human effort | direction heavily mined (big computer searches done) | famous belief one way, ~no serious search the other way |
| 6 | **Referee-ready contribution** — a natural theorem with a plausible expert audience | artificial numerical increment with no reusable idea | conceptual advance, reusable method, or decisive result on a recognized target |

Also record, for the human in the loop:

- **Verification load:** `mechanical` (script) / `elementary-readable` (the operator can
  referee it) / `needs-expert` (recruit an expert). Mechanical verification is valuable,
  but is not by itself a reason to select a problem.
- **Research shape:** `proof-shaped` / `construction-shaped` / `computation-shaped`.
  In proof-first mode, computation-shaped problems remain in the backlog unless the
  operator explicitly prioritizes one.
- **Believed direction** and whether we push with or against consensus. Pushing against
  (counterexample hunting) is where feature 5 usually pays.
- **Ambition tier:** `publishable-rung`, `decisive-bottleneck`, or `full-conjecture`.
  The bottleneck must be a natural stronger theorem, not an arbitrary numerical bump.
  The autonomous loop allocates attempts 50% / 30% / 20% across these tiers.

## Anti-patterns (auto-reject)

- Problems with a credible full solution pending review, and targets already covered by
  credible pending or published work.
- Problems whose small cases are already exhausted by massive computer search *and* whose
  only remaining attack is more of the same search (we cannot out-brute-force McKay).
- Problems where the likely output is only a slightly larger numerical bound from a
  bespoke enumeration, unless it tests a genuinely new structural idea.
- Problems where even the *statement* of a partial result requires machinery nobody in the
  loop can referee.
- Mega-famous problems (RH, Collatz, twin primes): crank-adjacent, expert scrutiny is
  hostile, and the tractable partials are already strip-mined.
