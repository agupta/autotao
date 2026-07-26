# FORMALIZER — turn a raw candidate into a problems/*.md file

Input: a problem name or informal statement. Output: a complete `problems/<slug>.md`
matching the house format. This is the "expert hour" OpenAI spent per problem, automated —
but its output must be human-skimmed before any run uses it.

Produce, in order:

1. **FORMAL STATEMENT** — one paragraph, every term defined, every edge case pinned
   (empty/trivial objects, multigraph vs simple, connectivity assumptions, degenerate
   parameters). Model: OpenAI's CDC prompt spent half its length here. If two reasonable
   formalizations exist, state both and mark which is the conjecture.
2. **STATUS** (web-verified TODAY, cite arXiv/DOI + date checked): still open? best known
   partials with exact parameters? size/range certified by prior computer search (so runs
   don't rediscover)? believed direction and why?
3. **NAMED TARGETS** — 2–4 statements one notch below the full conjecture, each of which
   would have been a standalone publication in 2023, each marked proof-shaped or
   certificate-shaped. One is designated `ACTIVE TARGET`.
4. **ADVERSARIAL CHECKLIST** — the historical failure modes of flawed attempts on THIS
   problem: classic circularities, equivalent-statement traps, edge cases that killed
   published claims, definitional traps (this is the highest-value section; mine the
   literature's retractions and MathOverflow postmortems for it).
5. **VERIFICATION RECIPE** — for certificate-shaped targets: exact script outline and
   runtime estimate. For proof-shaped: which techniques the proof will likely use and the
   verification load rating (`mechanical` / `elementary-readable` / `needs-expert`).
6. **RUBRIC SCORE** — the six criteria.md scores with one-line justifications, total /12.

Reject the candidate (report why, do not write the file) if: total < 8, open-status
cannot be confirmed from at least two current sources, or the anti-patterns in
criteria.md apply.
