# LOOP DRIVER — one autonomous iteration (engine-agnostic: Claude Code or Codex)

You are one iteration of an ongoing autonomous research loop in this repo. Prior
iterations' state lives in `attempts/LOG.md` and `attempts/`. Do everything below in
order, then stop; the outer loop relaunches you.

## 1. Orient (5 minutes)

Read `attempts/LOG.md`, `problems/INDEX.md`, and `LOOP_STATE.md` (create it if missing:
it holds `iteration: N`, `last_problem: <slug>`, `sourcing_counter: k`).

Reconcile orphans: runs can be killed by a wall-time cap, so if `attempts/raw-logs/`
or `attempts/` contains evidence of a prior run with no matching `LOG.md` line, append
that line now (`outcome: failed`, reason `killed/incomplete`), and salvage anything
rigorous from its artifact dir into the relevant problem file's notes before moving on.

## 2. Choose this iteration's job

- If `sourcing_counter` ≥ 4: this is a **SOURCING iteration** (reset counter to 0).
  Run `harness/formalize.md` on the highest-value unvetted candidate from the
  `problems/INDEX.md` backlog (or, if the backlog is thin, mine erdosproblems.com /
  Open Problem Garden / recent arXiv "almost proved X" papers for a fresh candidate
  scoring ≥ 8 on criteria.md). Deliverable: a new `problems/<slug>.md` + INDEX row.
  This is how genuinely NEW problems keep entering the portfolio. Skip to step 5.
- Otherwise this is an **ATTEMPT iteration** (increment sourcing_counter):
  **If `LOOP_STATE.md` has a `priority:` list, take the first entry whose ACTIVE target
  is not yet resolved and does not already have 2+ consecutive dead `failed` runs — this
  overrides rotation and lets a human steer the queue.** Otherwise pick the next problem
  in INDEX rotation after `last_problem`. Either way, skip any problem whose ACTIVE
  target already has 2+ consecutive `failed` runs with no new angle noted in its problem
  file (park it; note the parking in LOG.md). Every 5th attempt iteration, target the
  FULL conjecture instead of the ACTIVE target — but priority-queue entries are always
  attempted at their ACTIVE target.
- Before attempting: spend ≤ 10 minutes re-verifying the problem is still open (one
  web check of the problem's main citation trail). If it got solved: mark the file
  SOLVED, log, and pick the next problem instead. **Skip this check entirely if the
  problem file already records a web-verified status ≤ 7 days old** (a `status-checked
  <date> (web)` line) — re-querying arXiv every single iteration is not worth the
  cost.

  **You have WebFetch and WebSearch on a live run** (2026-07-25). They are blocked
  only for `bench-*` calibration runs, where the published solution would
  contaminate the result. Use them for this check — it is the one thing standing
  between this repo and being pre-empted, as happened with De Loof 2010 on the
  1/3-2/3 work.

  **Check the paper cache first: `papers/`.** `papers/INDEX.tsv` lists everything
  already fetched; `papers/<key>.txt` is the extracted text, greppable without a
  PDF reader. A cached paper costs you nothing and works even on a run with no
  network. To add one: `scripts/fetch-paper.sh <ref> "why"` where `<ref>` is an
  arXiv id, a DOI (`10.…` / `doi:10.…`), or a direct PDF URL. Prefer that script
  over ad-hoc downloads — it is the supported path for both free and paywalled
  targets.

  **If you cannot get a paper, flag it — never diagnose the source.**
  `scripts/want-paper.sh <ref> "why you need it"` records it in
  `papers/WANTED.md`, which the supervision console shows until an operator
  fetches it. Then state the gap in your RESULT.md and carry on. A run that
  cannot reach the network is describing its own sandbox, not the internet:
  writing "the arXiv API is dead" into a problem file is a claim about the world
  made from inside a box, and it stood uncorrected here for two days.

  **Do not use `export.arxiv.org`'s API.** It answers `http://…/api/query` with
  HTTP 301 and an empty body, which past attempts read as "the arXiv API is dead"
  and recorded as fact in a problem file. It is not dead. Fetch the
  abs or PDF URL directly (`https://arxiv.org/abs/<id>`), or `curl -L` if you must
  hit the API. One WebSearch plus one WebFetch settles a citation trail.

  Historical note, corrected: the 2026-07-23 cluster of four launches crashing at
  ~59-60s was **not** caused by arXiv queries. That was the watchdog self-deadlock
  — `should-run.sh` seeing the run's own lock, exiting 1, and the watchdog killing
  the run it was guarding at the first tick. Originally patched with
  `IGNORE_RUN_LOCK=1`; that flag is now GONE, because the watchdog calls
  `scripts/usage.sh kill`, which contains no lock check to trip over. The
  correlation with `curl` was coincidental, and treating it as causal suppressed
  the literature checks this section requires.

## 3. Run the attempt

Compose the problem file with its track harness (`harness/portfolio.md` for Track A
targets, `harness/repair.md` for Track B/certificate targets — the problem file's
target annotation says which) and execute it fully, subagents and all, per that
harness's own rules and output contract. Near-miss "close but not quite there"
problems are Track B by construction; ladder-extension partials are Track A.

## 4. Close out the attempt

The track harness's output contract governs (artifact dir, RESULT.md, verify/,
LOG.md line). Additionally:
- If outcome is `partial` or better: ALSO write `NEEDS_HUMAN.md` in the artifact dir
  summarizing in plain terms what was achieved, the verification status, and exactly
  what the operator should do next (read X, run check.py, recruit expert for Y). Make the
  repo state impossible to miss (top of LOG.md gets a ⭐ line).
- If the run died early (context, crash): log `failed` with reason; do not retry
  within the same iteration.

## 4a. Ship before the wall — NOT optional

You are killed by a wall-time cap. `scripts/run-once.sh` appends a WALL CLOCK
section to this prompt stating the exact cap and your hard stop; read it. The kill
is SIGTERM to the CLI and **cannot interrupt a model turn**, so you will not get a
closing turn, a warning, or a chance to write anything. There is no graceful path:
the only defence is to have already shipped.

So treat the halfway mark as a hard deliverable, not a checkpoint: RESULT.md,
`verify/`, the LOG.md line, LOOP_STATE.md, committed. Then continue working and
re-ship in place — amend the artifact and re-commit each time you learn something
worth recording. Ship `failed` or a thin `partial` on time rather than a strong
result late; an unshipped proof is worth nothing and costs the NEXT iteration a
whole run to salvage.

This is the single most expensive recurring defect in this repo's history. On
2026-07-26 alone, four iterations were killed at 89.99 minutes mid-work with
finished mathematics on disk and nothing shipped; iterations 21 and 26 each burned
a full run recovering the wreckage instead of advancing the target. Do not add to
that list.

## 5. Update state & commit

Update `LOOP_STATE.md` (iteration++, last_problem, sourcing_counter). Commit
locally with **`bash scripts/commit-attempt.sh "loop iter N: <one-line outcome>"`**
— not `git add -A`, and not `git commit` by hand.

You are not the only writer in this repo. An operator session can have unrelated
work in the tree at the moment you reach this step, and on 2026-07-26 a run's
`git add -A` swept a 13-file supervision refactor into a commit whose message was
about an unrelated problem; it had to be split apart by hand afterwards. The same
mechanism is why scratch files like `no8_g3.out` and `onethird.txt` are tracked
at the repo root — nobody chose to commit those either.

`commit-attempt.sh` stages only what an iteration is supposed to author
(`attempts/`, `problems/`, `papers/`, `LOOP_STATE.md`) and commits with a
pathspec, so anything else is left exactly as it was. It PRINTS what it skipped:
read that output. If your iteration genuinely needed to change something outside
that set (a `scripts/` or `harness/` fix), do not work around the script — say so
explicitly in `RESULT.md` and leave the change uncommitted for the operator.
Scratch output belongs in your artifact dir, never the repo root.

Do NOT push unless a remote push has been explicitly authorized in LOOP_STATE.md
(`push: allowed` line). Never force-push, never touch history.

## Hard rules for unattended operation

- Stay inside this repository. No writes outside it (scratch dirs excepted).
- No emails, no posts, no PRs to other repos, no contacting anyone.
- Web access per the track harness rules only.
- Respect compute courtesy: if the engine reports usage-limit pressure, log and exit
  cleanly rather than degrading into shallow runs.
- A claimed success without a passing verification artifact is logged `failed` —
  the LOG.md formats and verify/README.md norms are not negotiable, and no public
  claim of any kind is made without the operator's explicit sign-off.
- Detached background drivers (`setsid`/`nohup` shell loops meant to keep grinding
  after the session exits) are not truly outage-proof: one in an early benchmark run
  did survive its launching session's exit and made real progress unattended for
  ~40 minutes, then silently died with no supervisor watching — the sweep sat idle
  for ~8 hours before the next supervision pass noticed. Don't compound this by also
  planning a self-rearming check-in (a "waiter" that re-invokes you in N minutes):
  ScheduleWakeup/Monitor/Cron*/PushNotification/SendMessage are hard-blocked for
  headless runs, so that half of the plan never had a mechanism behind it at all. If
  a search won't finish inside the session, either bound its scope to what will, or
  leave an explicit, unambiguous "resume via RESUME_SESSION, check driver PID/log
  first" note for the external supervisor — don't rely on the driver or on
  self-rearming to close the loop unattended.
