# <Problem name>

status-checked <YYYY-MM-DD> (web) · verification load: `mechanical` | `elementary-readable` | `needs-expert`
track: A (proof-shaped) | B (certificate-shaped) | A+B · rubric score: <n>/12

## IN PLAIN TERMS

*Optional, and read by the supervision console — it is the only thing on the dashboard
that says what the problem actually is.*

Two or three sentences, aimed at a mathematician who does not work in this subfield: an
algebraic geometer should come away understanding a problem in probability. No notation
that is not defined here, and no reliance on the formal statement below.

This section is for a human reader. It is not part of the problem specification, and a
run must work from the FORMAL STATEMENT — if the two ever disagree, the formal statement
is the problem and this paragraph is a bug.

## FORMAL STATEMENT

One paragraph. Every term defined, every edge case pinned down: empty and trivial
objects, simple vs multi- structures, connectivity or non-degeneracy assumptions,
degenerate parameter values, strict vs non-strict inequalities.

If two reasonable formalizations exist, state both and mark which one is the conjecture.

This section is worth more than it looks. Half the length of OpenAI's published CDC
prompt was spent here, and an under-specified statement is how a run ends up proving
something adjacent to the target and reporting success.

## STATUS

Web-verified on the date in the header, with citations (arXiv id / DOI) and the date each
was checked.

- Still open? Cite the two independent sources.
- Best known partial results, with **exact parameters**.
- What range has already been certified by prior computer search — so runs don't spend
  themselves rediscovering it. Name the paper and the bound.
- Believed direction, and why. Is the consensus based on evidence or on aesthetics?

## NAMED TARGETS

2–4 statements one notch below the full conjecture. Each should be something that would
have been a standalone publication two years ago. Mark each `proof-shaped` or
`certificate-shaped`, and designate exactly one as the `ACTIVE TARGET`.

- **T1 (ACTIVE TARGET)** — <statement>. `certificate-shaped`.
- **T2** — <statement>. `proof-shaped`.
- **T3** — <statement>. Gated on <dependency, e.g. an unobtained paper>.

The ACTIVE TARGET is what the absolutist harness prompt gets pointed at. Choosing it well
is most of the operator's job: too ambitious and every run fails, too easy and the result
isn't publishable.

## ADVERSARIAL CHECKLIST

**The highest-value section.** The historical failure modes of flawed attempts on *this
specific problem*:

- Classic circularities — the step that quietly assumes an equivalent of the target.
- Equivalent-statement traps — reformulations that look like progress and aren't.
- Edge cases that have killed published claims in this area.
- Definitional traps specific to the objects involved.

Mine the literature's retractions, errata, and MathOverflow postmortems for these. A run's
self-audit pass is run against this list, so an empty checklist means an empty audit.

## VERIFICATION RECIPE

**Certificate-shaped targets:** the exact script outline, the exact objects to be checked,
and a runtime estimate. Say which filters are expected to do the work — and treat that
expectation as a hypothesis to be measured, not a fact. A filter assumed to be exponential
that turns out to be a constant factor will silently invalidate the whole scaling plan.

**Proof-shaped targets:** the techniques the proof will likely use, and the verification
load rating from the header, with a sentence on what a referee would need.

## RUBRIC SCORE

Six scores from `criteria.md`, each with a one-line justification, and the total.

| # | Feature | Score | Why |
|---|---------|-------|-----|
| 1 | Elementary formalizability | 0–2 | |
| 2 | Verification asymmetry | 0–2 | |
| 3 | Near-miss / active-program literature | 0–2 | |
| 4 | Approach diversity | 0–2 | |
| 5 | Under-searched direction | 0–2 | |
| 6 | Referee-ready venue | 0–2 | |
| | **Total** | **/12** | |

Below 8/12, the problem does not get a file.

## NOTES

Running log of what attempts have established, what was retracted, and what the next run
should read first. Salvaged results from killed runs land here.
