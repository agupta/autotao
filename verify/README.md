# Verification norms

The project's credibility is exactly the credibility of this directory's standards.

## Certificates (Track B, and any counterexample from Track A)

- Exact arithmetic only (integers, rationals, symbolic). Floating point proves nothing.
- Standalone `check.py`, standard libraries + sympy/networkx/pysat only, zero context
  required, exit 0 on success, printing each verified property with the claimed value.
- SAT/CP case analyses ship solver version, encoding script, and (for UNSAT claims)
  DRAT certificates checked with drat-trim where feasible.
- Independence rule: the checker must be written by a different agent/session than the
  finder, from the formal claim alone.

## Proof-shaped results

1. **Self-audit** (same run): adversarial pass against the problem file's checklist.
2. **Cross-model audit**: the artifact goes to the *other* frontier model (Claude ↔ Codex)
   with the instruction "find the error; assume there is one; check every checklist item;
   verify no step silently assumes an equivalent of the target." Free, fast, and catches
   different failure modes than self-review.
3. **Human read** (the operator): feasible whenever the argument uses elementary techniques —
   any area of mathematics is fine if the proof is elementary; the rating in the problem
   file (`mechanical` / `elementary-readable` / `needs-expert`) says what to expect.
4. **Expert read**: required before any public claim on a *named* conjecture, full or
   partial. Recruit by sending the artifact plus check scripts, never a bare claim.

## Publication pipeline

record/partial verified → writeup in house style → cross-model audit → human read →
(if named conjecture: expert read) → arXiv + journal with recent computer-assisted
precedent in that exact area (see problem file's venue note).

Never skip a stage because a result "obviously" checks out. The v13-on-arXiv failure mode
begins with exactly that feeling.
