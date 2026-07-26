# Calibration benchmarks

Before trusting the live loop, test the whole pipeline on problems that are **known to be
solvable but impossible to have memorized**: problems solved *after* the engine's
knowledge cutoff, presented to the run frozen in their real pre-solution state.

This directory ships the protocol, not a problem set. See "Why no benchmark set is
included" below — it is not squeamishness, it's that publishing one destroys it.

## Building a benchmark

1. **Find a problem solved after your engine's cutoff.** Recent arXiv listings in your
   area, filtered to papers that resolve a previously-open named question. The solving
   paper's own introduction usually states the pre-solution state of the art for you.
2. **Write `bench-<slug>.md` in the `problems/TEMPLATE.md` format, frozen to the
   pre-solution state.** This is the delicate part. The STATUS section must cite only
   what was known *before* the solving paper, and the ACTIVE TARGET must be exactly what
   that paper proved. Any leakage — a citation that postdates the solution, a hint about
   the method — invalidates the measurement.
3. **Record the ground truth in `ANSWERS.md`**, which runs must never read: solving paper,
   authors, date, and the method used. Head that file with a spoiler warning.
4. **Run it:** `bash scripts/run-once.sh <engine> bench-<slug>`, which composes
   `harness/benchmark.md` with your benchmark file.

## The rules, stricter than a live run

- **Zero network access.** The solution is on the public internet; one fetch invalidates
  the run. `harness/benchmark.md` forbids WebSearch, WebFetch, and `curl`, and the raw log
  is audited for network use afterwards. This is why `scripts/run-once.sh` blocks web
  tools for `bench-*` runs specifically and permits them on live runs.
- **Never read the answer key**, and no filesystem search for answer material.
- **Minimum 2 hours of sustained effort** before the failure protocol. These problems are
  deliberately on the easy end — a run that disengages early is a harness bug signal, not
  evidence the problem was hard.

## Scoring — by a human or a fresh session, never the run itself

The **wiring score is the actual point.** Is the artifact directory complete? Is the
`LOG.md` line well-formed? Does `check.py` pass standalone? Were subagents actually used?
Is the raw log clean of network use? Was `NEEDS_HUMAN.md` written iff the outcome was
`partial` or better?

The **math score** comes second: solved / partial / failed. Then unblind, fetch the
solving paper, and write `SCORE.md` in the artifact dir — same method or different? If it
failed, what did the human proof use that the run never tried? That gap analysis is what
tells you which ACTIVE targets are realistic on your live problems.

Fix what the score finds. A benchmark that fails for wiring reasons gets re-run after the
fix; one that fails for mathematical reasons is calibration data, not a bug.

## Know when to stop

Benchmarks cost the same budget as live runs and their answers are already known. Once
they have demonstrated the pipeline end-to-end, stop — a live problem with an
exhaustion-shaped ACTIVE target is a better wiring test from then on, because a real
result is a possible outcome. Record the decision in `LOOP_STATE.md`; `harness/supervisor.md`
is written to respect an explicit operator waiver.

## Why no benchmark set is included

A blinded benchmark works only as long as it stays blinded, and its value decays two ways
once published:

1. **The answer key becomes indexable.** `ANSWERS.md` names the solving papers. Published
   to a public repo, it is training data and search-engine fodder for exactly the engines
   the benchmark is meant to test.
2. **The frozen problem files stop being frozen.** Their value is that they reproduce a
   pre-solution state faithfully. Once they're public and associated with a solving paper,
   any future engine can pattern-match the framing rather than do the mathematics.

So build your own, against your own engine's cutoff, and keep them private. The cutoff
dependency means a shared set would have needed replacing anyway.
