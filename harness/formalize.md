# FORMALIZER — turn a raw candidate into a problems/*.md file

Input: a problem name or informal statement. Output: a complete `problems/<slug>.md`
matching the house format. This is the "expert hour" OpenAI spent per problem, automated —
but its output must be human-skimmed before any run uses it.

Produce, in order:

1. **FORMAL STATEMENT** — one paragraph, every term defined, every edge case pinned
   (empty/trivial objects, multigraph vs simple, connectivity assumptions, degenerate
   parameters). Model: OpenAI's CDC prompt spent half its length here. If two reasonable
   formalizations exist, state both and mark which is the conjecture.
2. **STATUS** (web-verified TODAY, cite primary URLs/arXiv/DOI + date checked): still
   open? best known partials with exact parameters? size/range certified by prior computer
   search (so runs don't rediscover)? believed direction and why?
2a. **CREDIT / PREEMPTION CHECK** — inspect the live primary page and every linked proof,
   formalisation, AI-attempt, comment, discussion, and history item. Search the exact
   problem and every proposed target with `proof`, `preprint`, `Lean`, and `Coq`. Record a
   claim ledger with date, author, artifact URL, exact theorem scope, and review status.
   Distinguish a formal statement containing `sorry` from a sorry-free proof repository.

   - A credible full-resolution claim awaiting independent review makes the problem
     `PENDING REVIEW`; park it. This label manages credit risk and does not certify truth.
   - A credible claim covering a partial makes that target `PREEMPTED`. Continue only with
     a demonstrably non-overlapping theorem.
   - An unread likely source of prior art blocks admission.
3. **NAMED TARGETS** — define a difficulty ladder where the mathematics supports it: one
   scoped `ACTIVE TARGET` marked `publishable-rung`, at least one strictly stronger
   non-full target marked `decisive-bottleneck`, and the exact `full-conjecture` target.
   Mark each target proof-, construction-, or certificate-shaped. If no honest decisive
   bottleneck exists, say so rather than relabelling a numerical increment.
4. **ADVERSARIAL CHECKLIST** — the historical failure modes of flawed attempts on THIS
   problem: classic circularities, equivalent-statement traps, edge cases that killed
   published claims, definitional traps (this is the highest-value section; mine the
   literature's retractions and MathOverflow postmortems for it).
5. **VERIFICATION RECIPE** — for certificate-shaped targets: exact script outline and
   runtime estimate. For proof-shaped: which techniques the proof will likely use and the
   verification load rating (`mechanical` / `elementary-readable` / `needs-expert`).
6. **RUBRIC SCORE** — the six criteria.md scores with one-line justifications, total /12.

Reject or park the candidate (report why, do not give it an ACTIVE target) if: total < 8,
open status cannot be confirmed from two current sources, a credible full resolution is
pending review, worthwhile targets are preempted, likely prior art remains unread, or an
anti-pattern in criteria.md applies.
