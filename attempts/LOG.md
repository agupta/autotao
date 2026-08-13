# Attempt log

**One line per run, success or failure. Lines are never deleted or edited — only
appended, and corrected by appending.** This file is the denominator: a harness that
records only its hits is measuring nothing. Failed runs are the dataset.

Format:

```
| date | model | problem | target | hours | outcome | artifact | audited-by |
```

- **date** — `YYYY-MM-DD`.
- **model** — the full model id actually used, not an alias.
- **problem** — the problem slug, or `bench-<slug>` for calibration runs, or
  `SOURCING (harness/formalize.md: <candidate>)`.
- **target** — `A<number> <P|B|F> <target id>: <exact selected statement>` for loop
  attempts, where `A<number>` is the durable attempt counter and the tier is
  publishable-rung, decisive-bottleneck, or full-conjecture. Legacy rows may contain only
  the ACTIVE TARGET or `full conjecture`.
- **hours** — wall-clock, approximate is fine. Mark killed runs `~N (killed)`.
- **outcome** — one of the vocabulary below, followed by a parenthesized account. Be
  specific enough that a future iteration can salvage from it without re-reading the raw
  log; state exactly what is on disk and what was verified by whom.
- **artifact** — the attempt directory, always, even for failures.
- **audited-by** — who checked it: an in-run agent, an independent checker author, a
  cross-model audit, `triage-tick`, or `unaudited`.

## Outcome vocabulary

| outcome | means |
|---|---|
| `resolved` | SELECTED TARGET met, verification artifact passes, audits clean |
| `resolved-pending-audit` | target met and verified in-run, cross-model or human audit outstanding |
| `partial` | real progress on the target, machine-checked, target not met |
| `fragment` | no target progress, but a rigorous reusable piece — a lemma, a bound, an eliminated approach |
| `failed` | no rigorous output, or a claim without a passing artifact, or the run died |
| `investigated` | not a research run — infrastructure diagnosis, reconciliation, literature pass |

**A claimed success without a passing verification artifact is logged `failed`, not
`pending`.** That rule is the whole point of the file.

## Log

| date | model | problem | target | hours | outcome | artifact | audited-by |
|---|---|---|---|---|---|---|---|
