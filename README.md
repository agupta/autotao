# autotao — Autonomous Theorem Attack Orchestrator

*Any resemblance to persons living, working, or holding Fields Medals is purely
coincidental. Nobody it might bring to mind has endorsed or reviewed this project, or been
asked to.*

A research harness that works open mathematics problems **continuously** — around the
clock, unattended — verifies whatever it produces, and logs every attempt as a permanent
record.

**You steer it.** Which problems it works on, which target on each problem, and in what
order are all yours: a priority list in `LOOP_STATE.md` overrides everything, and takes
effect on the next iteration. Point it somewhere and it stays pointed until you move it.

**It ships with no problems.** The problem set is yours too — `problems/` contains a
template and a rubric, not a curriculum. The harness supplies the loop, the verification
norms, the supervision layer, and the methods for *finding* problems worth attempting.

**It is built for consumer AI budgets** — a subscription plan and one box, not a lab's
compute. That constraint shaped nearly every design decision below.

## What it actually does

One iteration of the loop, unattended:

1. **Orient** — read the attempt ledger, reconcile any orphaned runs from prior
   iterations, pick up the loop state.
2. **Choose a job** — either an ATTEMPT iteration against a problem's ACTIVE TARGET
   (from an operator-controlled priority queue, or index rotation), or, every 5th
   iteration, a SOURCING iteration that formalizes a brand-new problem into the
   portfolio. Every 5th attempt goes at the full conjecture instead of the named
   partial.
3. **Re-verify the problem is still open** before spending a run on it.
4. **Attempt it** — compose the problem file with a track harness and execute with
   subagent rounds, adversarial self-audit, and an independently-written checker.
5. **Ship before the wall** — the run is time-capped and gets no closing turn, so the
   halfway mark is a hard deliverable.
6. **Close the books** — artifact directory, `RESULT.md`, `verify/`, one line in
   `attempts/LOG.md`, commit.

A supervision tier sits above this: a cheap triage pass after every run, budget and
memory gates before every launch, an orphan reaper, and a campaign-free OpenTUI console.

## The design decisions that matter

1. **Absolutist prompts pointed one notch below the conjecture.** The prompt refuses
   partial credit — "partial progress does not count unless it implies exactly the
   ACTIVE TARGET" — which is what prevents give-up behavior. But it's aimed at *named
   partials* that would have been a standalone paper two years ago, not at the famous
   conjecture. ~80% of runs target named partials; ~20% go straight at the conjecture.
   (The absolutism is adapted from OpenAI's published Cycle Double Cover prompt.)
2. **Verification is where the human effort goes, and it is non-negotiable.** A claim
   without a passing artifact is logged `failed`, not `pending`. Certificates use exact
   arithmetic only and ship a standalone `check.py` written by a *different* agent than
   the one that found the result, from the formal claim alone. Proof-shaped output gets
   a cross-model audit — one frontier model's output audited by another, instructed to
   assume an error exists.
3. **Log the denominator.** Every attempt gets a line in `attempts/LOG.md`, especially
   the failures, and lines are never deleted. A harness that only records its hits is
   measuring nothing.
4. **Computer-assisted partials are the beachhead.** In areas where referees already
   accept machine-checked case analysis, an agent extending a live publication ladder is
   doing normal mathematics faster — not attempting a new genre.
5. **The failure modes are operational, not mathematical.** Most of what's encoded in
   `harness/` is scar tissue: runs killed at the wall with finished mathematics unshipped,
   background subagents harvested by nobody, a watchdog that deadlocked against its own
   lock file, a sandboxed run that diagnosed "the arXiv API is dead" and wrote it into a
   problem file as external fact. Those incidents are written into the prompts as
   directives, with dates. That is most of the value here.

## Operating on a consumer budget

A frontier lab attacking one conjecture can run 64 agents in parallel on internal
infrastructure and simply pay for it. This harness assumes you cannot. The interesting
part is that the constraint is generative — it produces a different search strategy, not
a worse version of the same one.

**Breadth comes from time, not width.** OpenAI's published Cycle Double Cover run used 64
concurrent agents. A consumer engine gives you roughly ten, and this harness caps it at
three so a 3.7 GB box survives the run. So `harness/portfolio.md` recovers breadth through
sequential **rounds** instead of parallel width — and, more importantly, through
continuity. An iteration every few hours forever is a genuinely different way of buying
search than sixty-four agents for one afternoon. The ladder of lower bounds this thing
produced was built one 90-minute run at a time, each starting from the last one's
committed artifact.

**The usage meters are a first-class input.** `autotao.json` carries the operator's one
plain-language choice—how much allowance to protect. `scripts/budgets.conf` carries the
backend mechanics and direct-shell fallback: estimated run cost and overshoot margin.
AutoTao derives launch/watchdog ceilings from those two inputs, and `scripts/launch.sh`
refuses to start a run that would breach them. Measured on one
plan: a ~90-minute iteration moves the 5-hour meter 25–30 points but the weekly meter only
2–3. So the 5-hour window is the binding constraint, not the week — which means the right
cadence is a few spaced runs a day, indefinitely, rather than a burst. Re-measure these on
your own plan; the config comments tell you which numbers to re-derive.

**Every run is disposable, so every run must ship.** Runs are wall-capped (90 minutes by
default) and the kill is uncatchable, so `harness/loop.md` treats the halfway mark as a
hard deliverable: commit a complete honest artifact at minute 45, then keep working and
re-ship in place. Cheap compute lets you tolerate losing a run; this doesn't.

**Selectivity substitutes for volume.** When you get a few runs a day rather than
thousands, choosing the target is most of the work. That is what `criteria.md`'s 8/12
threshold, the named-target discipline, and the mandatory open-status check are for — a
run spent rediscovering a 2010 result is a meaningful fraction of the week's budget.

**And the failures are worth recording precisely because runs are scarce.** `attempts/LOG.md`
is append-only. At this budget a repeated dead end is expensive, so the ledger earns its
keep.

## Layout

```
criteria.md          — problem-selection rubric: score 0-2 on six features, >=8/12 to enter
harness/
  loop.md            — the loop driver: one autonomous iteration, engine-agnostic
  portfolio.md       — Track A: absolutist prompt for proof-shaped targets
  repair.md          — Track B: near-miss mining and record constructions
  formalize.md       — turns a raw candidate into a problems/*.md file
  benchmark.md       — calibration runs against known-solvable problems
  triage.md          — cheap post-run pass (small model): settle the books, decide next
  supervisor.md      — the supervision tier: babysit, score, fix wiring, certify
problems/
  INDEX.md           — YOUR problem table (ships empty) + the backlog
  TEMPLATE.md        — the problem-file format the harnesses expect
  SOURCING.md        — how to find candidates worth formalizing
benchmarks/
  README.md          — the blinded-calibration protocol (ships without a problem set)
verify/
  README.md          — verification norms. The credibility of the project is this file.
attempts/
  LOG.md             — one line per run, success or failure, never deleted
scripts/             — runner, launch gate, budget/memory guards, orphan reaper, console
LOOP_STATE.md        — iteration counter, priority queue, run model, push authorization
```

## Quickstart

Requires an agent CLI (Claude Code and/or Codex) already authenticated, Bun 1.2 or newer
for the source console (standalone release binaries do not require Bun), plus a Python
environment for the verification scripts:

```bash
python3 -m venv .venv && .venv/bin/pip install sympy networkx python-sat
```

```bash
# 1. Create an ignored private workspace for actual research state.
bash scripts/init-workspace.sh

# 2. Add at least one problem inside that workspace. Score it first.
cd .autotao/workspace
cp problems/TEMPLATE.md problems/my-problem.md   # then fill it in; see criteria.md
$EDITOR problems/INDEX.md                        # add its row

# 3. Single supervised run, watching it work
bash scripts/run-once.sh claude

# 4. Return to the public checkout and launch the console. It discovers the workspace.
cd ../..
bash scripts/autotao.sh

# 5. Gated launch from inside the workspace (detaches, returns a real exit code)
cd .autotao/workspace
bash scripts/launch.sh
#   0 launched · 1 usage ceiling · 2 memory floor · 3 meters unknown · 4 run in flight
```

The public checkout contains the distributable application and clean templates. Actual
problem files, ledgers, attempt artifacts, raw sessions, papers, runtime state, quota policy,
and the private workspace's own Git history live under ignored `.autotao/workspace/`.
Running `bash scripts/autotao.sh` anywhere in the public checkout prefers that workspace
automatically. Direct harness commands should be run from inside the workspace.

The checked-in `autotao.json` enables continuous supervision. By default AutoTao protects
5% of each allowance and follows a steady path toward using the other 95% by reset. Your
normal usage counts first; AutoTao fills only the gap with checked math runs. This avoids
both leaving a large allowance unused and burning the whole week on day one.

```json
"usage": {
  "reservePercent": 5,
  "pace": "even"
}
```

Set `pace` to `eager` to use available headroom immediately. Every run still passes the
existing usage, memory, and one-run-at-a-time gates. Press `Enter` to follow the current
run's readable work transcript, or `s` to browse current and past sessions. Transcript
views support arrows, Page Up/Down, Home/End, and live-follow mode. Press `Space` to
pause/resume autopilot, `n` to ask for one checked run now, `?` for an explanation, and
`q` to quit. `bash scripts/supervise-console.sh` remains a compatibility entry point to
the same app.

Existing installations can perform a one-time import of durable legacy-console state:

```bash
bash scripts/autotao.sh import
```

Imported and last-known runtime state lives in the private workspace's ignored
`.autotao/state.json`; it is never part of the mathematical ledger or a release artifact. See
[`apps/autotao/README.md`](apps/autotao/README.md) for development, the versioned JSON
protocol, and standalone builds.

Set user intent only in **`autotao.json`** (`usage.reservePercent` and `usage.pace`). Keep
run-cost estimates, the safety margin, and direct-shell fallback ceilings only in
**`scripts/budgets.conf`**. The runtime derives its internal ceilings; do not hardcode a
third copy in a launcher or UI.

## Bringing your own problems

The harness reads three things, all yours to control:

- **`problems/<slug>.md`** — formal statement, web-verified open status, 2–4 NAMED
  TARGETS (one marked `ACTIVE TARGET`), an adversarial checklist of this problem's
  historical failure modes, a verification recipe, and the rubric score. See
  `problems/TEMPLATE.md`. Write these by hand, or run `harness/formalize.md` on a
  candidate and skim the output before any run uses it.
- **`problems/INDEX.md`** — the rotation order and the unvetted backlog.
- **`LOOP_STATE.md`** — a `priority:` list here **overrides rotation entirely**. This is
  the steering wheel: put a slug at the top and the next iterations go there, regardless
  of index order. Removing the list returns the loop to rotation.

The loop parks any problem whose ACTIVE target has 2+ consecutive failed runs with no new
angle recorded, so a dead end can't absorb the whole budget.

`problems/SOURCING.md` documents the methods that actually produced candidates —
including the machine-readable route into the Erdős problem database and the citation-trail
API that doesn't rate-limit you into uselessness.

## Verification, briefly

Read `verify/README.md` in full before trusting anything this produces. The short form:

- Exact arithmetic only. Floating point proves nothing.
- Standalone `check.py`, stdlib + sympy/networkx/pysat, zero context required, exit 0,
  printing each verified property with its claimed value.
- UNSAT claims ship DRAT certificates checked with `drat-trim` where feasible.
- **Independence rule:** the checker's author is not the result's finder.
- Escalation for proof-shaped results: self-audit → cross-model audit → human read →
  expert read (required before any public claim on a named conjecture).

## Honesty rules

These are in the harness prompts, not just the docs:

- Never circulate a claimed resolution of a named conjecture without an expert human
  read. arXiv currently hosts a v13 "proof" of a famous conjecture. Do not become that.
- A run that cannot reach the network is describing its own sandbox, not the world.
  Failed fetches get flagged, never diagnosed.
- No public claims, posts, or outbound contact from an unattended run, ever, under any
  circumstances. Nothing is pushed without explicit authorization in `LOOP_STATE.md`.
- Unattended runs get an explicit tool **allowlist**, not a blanket permission bypass.
  An allowlist fails closed — a tool nobody named, including one a future release adds,
  is denied rather than silently granted. Session and orchestration tools are separately
  hard-blocked, because a prompt rule is something a model can route around and a flag
  is not.

## Status and scope

This is research infrastructure, not a product. It has been operated by one person
against one problem portfolio; the abstractions that survived that are here, and the ones
that didn't have been removed. Expect to adapt the supervision layer to your own
environment.

## License

MIT. See `LICENSE`.
