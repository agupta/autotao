# Sourcing candidate problems

How candidates actually get found, in rough order of yield. Every method below has
produced a problem that scored ≥ 8 on `criteria.md`; the dead ends are recorded too, so
they don't get re-derived.

A sourcing pass is one iteration of `harness/formalize.md` against one candidate. The
loop runs one automatically every 5th iteration — that is the mechanism by which
genuinely new problems keep entering the portfolio instead of the loop grinding forever
on whatever it started with.

## 1. The Erdős problem database (highest yield)

`erdosproblems.com` is a curated, actively maintained register of Erdős's open problems
with tracked status. It is the single best source found so far.

- **The site does not want to be scraped**, and answers default programmatic agents
  with a 403. Take the hint rather than routing around it at volume: `scripts/fetch-paper.sh`
  sends a browser user-agent so a run can read a public page a person could open by
  hand, but that is for occasional single fetches, not for crawling the database.
- **So skip scraping entirely** — this is the better route anyway. The machine-readable
  ground truth is **`data/problems.yaml` in the GitHub mirror `teorth/erdosproblems`**
  (~1200 entries), which you clone once and query offline, at no cost to anyone's
  server.

The high-value filter is the **`informal_status`** field. Three buckets matter:

| status | meaning | why it's the sweet spot |
|---|---|---|
| `falsifiable` | open, but a **finite counterexample** would disprove it | the counterexample is a certificate; a script checks it in seconds |
| `decidable` | open, finite decision procedure exists | same, plus a clear termination story |
| `verifiable` | open, but a finite **example** settles it affirmatively | the rarest and best: success is a single exhibited object |

These map directly onto feature 2 (verification asymmetry) and feature 5 (under-searched
direction) of the rubric. Filtering by prize value ≤ $500 is a decent proxy for "hard but
not hopeless" — the big-prize problems are strip-mined.

**Triage before formalizing.** The dominant auto-reject in these buckets is *"true for
all sufficiently large n, finite check remaining but astronomically large"* — that is
`criteria.md`'s anti-pattern in its worst form, because the residual finite check is not
actually reachable. Check OEIS for the relevant sequence before committing: if someone
has already computed the values to n = 200, the search direction is exhausted.

## 2. Citation trails from a near-miss paper

Track B lives here: find a published construction that "fails only at a pole", or a
publication ladder someone is actively extending one parameter at a time.

- Use the **OpenAlex API** — free, no key, effectively unrate-limited, and it enumerates
  every citing work: `api.openalex.org/works?filter=cites:<id>`.
- **Do not use Semantic Scholar** for this. It 429s immediately.
- **Do not use `export.arxiv.org`'s API.** It answers `http://…/api/query` with HTTP 301
  and an empty body, which reads exactly like an outage and has been recorded as "the
  arXiv API is dead" in a problem file more than once. Fetch `https://arxiv.org/abs/<id>`
  directly, or `curl -L` if you must hit the API.

The signal you're looking for in a ladder paper: the abstract says "we prove X for
parameter ≤ k", the conclusion says the method breaks at k+1 for a *specific, stated*
reason, and the venue has published the previous three rungs. That is a problem where the
next rung is a paper and the failure reason is a search target.

## 3. Recent arXiv "almost proved X" papers

Query for the shape, not the subject: abstracts containing *"we verify the conjecture
for"*, *"remains open for"*, *"our method does not extend"*. Then apply the ladder test
above.

## 4. Open Problem Garden and survey "open problems" sections

Lower yield — the entries are often stale and the open-status verification is on you —
but useful for feature 4 (approach diversity), since surveys enumerate the known
reformulations, which is exactly what a subagent swarm needs to spread across.

## Recording what you reject

Keep the rejects and the reason in `problems/INDEX.md`'s backlog section. Two thirds of
sourcing effort is re-triage of things already triaged; a one-line "AUTO-REJECTED
<date>, small cases exhausted to n=200 per OEIS A######" saves the next pass an hour and
prevents the loop from cycling on the same candidate forever.

## Getting the papers

`scripts/fetch-paper.sh <arXiv-id|doi|url> "why"` caches a paper into `papers/` and
extracts its text, so later runs can grep it without a PDF reader and a network-blocked
run can still read it. It resolves via the direct URL, then open-access locators
(Unpaywall, OpenAlex, Semantic Scholar).

**Paywalled papers are not handled, deliberately.** If you have journal access through a
university or employer, wiring it up is your job — there is a documented stub near the
end of that script showing exactly where a resolver plugs in. There is no generic
implementation to ship: EZproxy, OpenAthens, Shibboleth and IP-range access all differ
per institution, and each is governed by a licence agreement between you and the
publisher, which typically allows personal research use and forbids redistribution.
Honour it. That is also why `papers/*.pdf` is gitignored — the cache is yours, not
something to commit or share.

With nothing wired up, an unreachable paper lands in `papers/WANTED.md` for a human to
fetch by hand, and the run states the gap and carries on. That is the intended behaviour.

## Verifying open status — non-negotiable

Before a problem enters the portfolio, and again before any run attempts it:

- Confirm open status from **two independent current sources**, and record the date.
- The loop skips this check if the problem file already records a web-verified status
  ≤ 7 days old, so keep that line current.
- Problems get solved while you're working on them. A repo running this harness was
  pre-empted on one problem by a paper from 2010 that nobody in the loop had found —
  the check exists because skipping it cost real work.
