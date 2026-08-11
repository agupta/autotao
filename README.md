# autotao — Autonomous Theorem Attack Orchestrator

A research harness that works open mathematics problems **continuously** — around the
clock, unattended — verifies whatever it produces, and logs every attempt as a permanent
record, **especially the failures**.

It is built for consumer AI budgets: a subscription plan and one box, not a lab's compute.
That constraint shaped nearly every design decision below.

<p align="center">
  <img src="docs/demo.svg" alt="The AutoTao console through one iteration: holding under the usage runway, launching a checked run, working, and logging the failure." width="872">
</p>

```sh
curl -fsSL https://raw.githubusercontent.com/agupta/autotao/main/scripts/install.sh | sh
```

Then `git clone https://github.com/agupta/autotao`, `bash scripts/preflight.sh`, and read
[Quickstart](#quickstart). Already installed? `autotao update`.

**Linux and macOS**, x64 and arm64. Needs bash 4.4+ (macOS ships 3.2 — `brew install bash
coreutils`), an authenticated `claude` or `codex` CLI, and Python 3 for verification
scripts. `scripts/preflight.sh` checks all of it and names the fix for anything missing.

*The name is a pun and nothing more. Any resemblance to persons living, working, or holding
Fields Medals is coincidental. Nobody it might bring to mind has endorsed or reviewed this
project, or been asked to.*

## What it has actually produced

Short answer: **this repository ships an empty ledger, and that is deliberate.**

`problems/` contains a template and a rubric, not a curriculum. `attempts/LOG.md` contains
the format and the rules, not results. The harness supplies the loop, the verification
norms, the supervision layer, and the methods for *finding* problems worth attempting — the
problem set and the ledger are yours, and on a private operator workspace they stay yours
(see [Quickstart](#quickstart); `.autotao/workspace/` is gitignored for exactly this reason).

<!-- TODO(launch): the honest answer to "what has it found?" belongs here, in numbers, before
     this goes anywhere public. Fill in from your own workspace ledger, e.g.:
       - N runs over M months, of which: X partial, Y fragment, Z failed, 0 resolved
       - the ladder of lower bounds, with the actual bound and how many runs it took
       - what a referee would say about the strongest artifact
     If the honest answer is "no new theorems," say that plainly and lead with the
     denominator. It is a far stronger position than implying more. -->

What it has *not* produced is a resolved named conjecture, and nothing here should be read
as claiming otherwise. The escalation rules in `verify/README.md` require an expert human
read before any public claim on a named problem, and the harness prompts forbid an
unattended run from making one at all.

**You steer it.** Which problems it works on, which target on each problem, and in what
order are all yours: a priority list in `LOOP_STATE.md` overrides everything, and takes
effect on the next iteration. Point it somewhere and it stays pointed until you move it.

## What it actually does

One iteration of the loop, unattended:

1. **Orient** — read the attempt ledger, reconcile any orphaned runs from prior
   iterations, pick up the loop state.
2. **Choose a job** — either an ATTEMPT iteration against a problem's selected target
   (from an operator-controlled priority queue, or index rotation), or, every 5th
   iteration, a SOURCING iteration that formalizes a brand-new problem into the
   portfolio. Attempt tiers follow a ten-run `P, P, B, P, F, B, P, B, P, F` cycle:
   five publishable rungs, three decisive bottlenecks, and two full-conjecture runs.
3. **Re-verify status and credit availability** before spending a run on it.
4. **Attempt it** — compose the problem file with a track harness and execute with
   subagent rounds, adversarial self-audit, and an independently-written checker.
5. **Ship before the wall** — the run is time-capped and gets no closing turn, so the
   halfway mark is a hard deliverable.
6. **Close the books** — artifact directory, `RESULT.md`, `verify/`, one line in
   `attempts/LOG.md`, commit.

A supervision tier sits above this: a cheap triage pass after every run, budget and
memory gates before every launch, an orphan reaper, and a campaign-free OpenTUI console.

## The design decisions that matter

1. **Absolutist prompts on a three-tier difficulty ladder.** The prompt refuses
   partial credit — "partial progress does not count unless it implies exactly the
   selected target" — which prevents give-up behavior. Half of runs target a scoped
   publishable rung, 30% a natural decisive bottleneck, and 20% the full conjecture.
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
threshold, the target ladder, and mandatory status plus credit/preemption checks are for — a
run spent rediscovering a 2010 result is a meaningful fraction of the week's budget.

**Heavy computation is disposable, not the root process.** Searches and full verifiers
with uncertain memory or runtime go through `scripts/safe-compute.sh`, after a checkpoint.
A timeout or resource kill becomes a logged failed experiment instead of taking the
research iteration and its finished work down with it.

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
pyproject.toml        — verification dependencies (`uv.lock` pins them reproducibly)
LOOP_STATE.md        — iteration/attempt counters, target schedule, steering, run model
```

## Install

```sh
curl -fsSL https://raw.githubusercontent.com/agupta/autotao/main/scripts/install.sh | sh
```

This installs the `autotao` console binary to `~/.local/bin` (override with
`AUTOTAO_BIN_DIR`). It verifies a published SHA-256 checksum and runs the binary once
before installing it. Binaries are built by
[`.github/workflows/release.yml`](.github/workflows/release.yml) on GitHub-hosted runners
and published with `SHA256SUMS`.

The console is the supervisor; the harness itself — prompts, rubric, scripts — lives in the
repository, so clone it too:

```sh
git clone https://github.com/agupta/autotao && cd autotao
bash scripts/preflight.sh
```

**Updating.** `autotao update` replaces the binary in place, after checksum verification
and a startup probe of the download. `autotao update --check` reports without installing.
The console checks for a new release at most once a day and shows a notice in its idle
status row; set `AUTOTAO_NO_UPDATE_CHECK=1` to turn that off. Harness files are updated
with `git pull` — deliberately separate, so an update can never rewrite prompts you have
tuned or touch your workspace.

### Build from source

Needs Bun 1.2+. Release binaries do not.

```sh
cd apps/autotao
bun install --frozen-lockfile
bun run verify        # typecheck, tests, standalone build
```

### Platform support

| | x64 | arm64 |
|---|---|---|
| Linux (glibc) | ✅ | ✅ |
| macOS | ✅ | ✅ |
| Linux (musl/Alpine) | build from source | build from source |
| Windows | — | — |

macOS needs bash 4.4+ and GNU `timeout`, neither of which it ships: `brew install bash
coreutils`. It has no `setsid`, which the harness accounts for — runs still detach, they
just share a session with their launcher. `scripts/preflight.sh` reports all of this.

## Quickstart

Requires an authenticated agent CLI (Claude Code and/or Codex). The verification
environment is pinned with `uv`:

```bash
uv sync
```

Without `uv`, `python3 -m venv .venv` plus installation of the dependencies in
`pyproject.toml` is supported, but not reproducibly locked.

```bash
# 1. Create an ignored private workspace for actual research state.
bash scripts/init-workspace.sh
bash scripts/install-cli.sh

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
automatically. The optional installer exposes the same launcher as `autotao` on your PATH,
so it can be started from any directory. Direct harness commands should be run from inside
the workspace.

When the current directory also belongs to a local AutoTao project, an interactive startup
asks whether to use the shared **global** workspace or that project's **local** state. From
the global AutoTao checkout itself, global state is selected without a redundant prompt.
Use `autotao --global` or `autotao --local` to choose explicitly;
`AUTOTAO_SCOPE=global|local` provides the same control for scripts. Headless commands default
to global state when both exist.

The checked-in `autotao.json` enables continuous supervision. By default AutoTao protects
10% of each allowance and follows a steady path toward using the other 90% by reset. Your
normal usage counts first; AutoTao fills only the gap with checked math runs. This avoids
both leaving a large allowance unused and burning the whole week on day one.

```json
"usage": {
  "reservePercent": 10,
  "pace": "even"
}
```

Press `u` in the dashboard to change the protected percentage or toggle even/eager pacing;
the TUI writes this policy atomically to the selected workspace's `autotao.json`. Every run
still passes the existing usage, memory, and one-run-at-a-time gates. Press `Enter` to follow the current
run's readable work transcript, or `s` to browse current and past sessions. Transcript
views support arrows, Page Up/Down, Home/End, and live-follow mode. Press `Space` to
pause/resume autopilot, `n` to ask for one checked run now, `?` for an explanation, and
`q` to quit.

Last-known runtime state lives in the private workspace's ignored `.autotao/state.json`; it
is never part of the mathematical ledger or a release artifact. See
[`apps/autotao/README.md`](apps/autotao/README.md) for development, the versioned JSON
protocol, and standalone builds. Moving an existing research repository in is covered by
[`docs/MIGRATION.md`](docs/MIGRATION.md).

Usage policy has exactly two homes, and neither duplicates the other. The `u` screen
persists operator intent to **`autotao.json`** (`usage.reservePercent`, `usage.pace`);
run-cost estimates, the safety margin, and direct-shell fallback ceilings live only in
**`scripts/budgets.conf`**. The runtime derives its internal ceilings from those; do not
hardcode a third copy in a launcher or UI.

## Bringing your own problems

The harness reads three things, all yours to control:

- **`problems/<slug>.md`** — formal statement, web-verified open status and competing-claim
  ledger, a publishable-rung / decisive-bottleneck / full-conjecture target ladder, an adversarial checklist of this problem's
  historical failure modes, a verification recipe, and the rubric score. See
  `problems/TEMPLATE.md`. Write these by hand, or run `harness/formalize.md` on a
  candidate and skim the output before any run uses it.
- **`problems/INDEX.md`** — the rotation order and the unvetted backlog.
- **`LOOP_STATE.md`** — `next_problem:` steers one run; a `priority:` list overrides
  problem rotation persistently. Neither changes the scheduled ambition tier unless an
  entry explicitly pins `slug@Tn`.

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
