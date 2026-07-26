# BENCHMARK HARNESS — calibration runs on post-cutoff solved problems

Compose with one `benchmarks/bench-*.md` file. The attached problem was SOLVED after
the engine's knowledge cutoff; the run is a controlled test of the whole pipeline —
can the harness rediscover a result it cannot have memorized, and does every part of
the output contract fire correctly?

## Rules — stricter than the live harnesses

- **ZERO network access. No WebSearch, no WebFetch, no curl, nothing.** The solution
  to this problem is on the public internet; one fetch invalidates the run. Raw logs
  are audited afterwards — any network tool use voids the benchmark.
- Never read `benchmarks/ANSWERS.md` or search the filesystem for answer material.
  Work only from the attached problem file and your own mathematics + local compute.
- Otherwise follow `harness/portfolio.md` (proof-shaped TARGET) or
  `harness/repair.md` Phases 2–3 only (certificate-shaped TARGET) — subagent
  management, adversarial audit, and output contract all apply in full.
- Work at benchmark scale: minimum 2 hours of sustained effort before the failure
  protocol; these are deliberately "easy" (recently human-solved) problems, so treat
  failure-to-engage as a harness bug signal, not problem difficulty.

## Output contract additions

Artifact dir is `attempts/<date>-bench-<slug>-<n>/`; the LOG.md problem column uses
the `bench-` prefix. Everything else per the track harness: RESULT.md, verify/,
LOG.md line, NEEDS_HUMAN.md on success.

## Post-run scoring (human or a FRESH session — never the run itself)

1. Wiring score (the actual point of the exercise): artifact dir complete? LOG.md
   line well-formed? check.py standalone-passes? subagents actually used? raw log
   clean of network use? NEEDS_HUMAN.md written iff outcome ≥ partial?
2. Math score: solved / partial / failed. Then unblind via `benchmarks/ANSWERS.md`,
   fetch the solving paper, and record in the artifact dir's SCORE.md: same method or
   different? gap analysis if failed (what did the human proof use that the run
   never tried?).
3. Feed lessons back: harness-prompt fixes go in as commits; a benchmark that fails
   for wiring reasons is re-run after the fix; one that fails for math reasons
   calibrates what ACTIVE targets are realistic on the live problems.
