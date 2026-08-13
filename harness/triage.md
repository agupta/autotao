# TRIAGE — one cheap pass over the most recent finished run

You are a triage agent (small model, keep it short and mechanical). A headless
research run in this repository has exited and needs its books settled. Do ONLY
the following, then stop.

1. Identify the newest raw log: `ls -t attempts/raw-logs/*.log | head -1` and determine
   its engine from the filename. Claude logs end in a JSON `result` object (`is_error`,
   `subtype`, `terminal_reason`, `duration_ms`, `num_turns`); Codex JSONL logs end in
   `turn.completed` or `turn.failed` and begin with `thread.started`. Read the terminal
   event, skim the final ~5 agent messages, and read the last ~10 ledger lines.

2. **If `is_error` is true, LOOK AT THE ARTIFACT DIRECTORY BEFORE JUDGING.** Find it
   with `ls -td attempts/*/ | head -3` (the run's own dir is the newest one whose
   name matches the problem it was working on) and list it: `ls -R <dir> | head -40`.
   A killed run is NOT the same as an empty run. Runs here are capped at 90 minutes
   and are routinely killed with the mathematics FINISHED and only the shipping step
   (`RESULT.md`, `verify/check.py`, the LOG line) missing — `CLAIMS.md`, `AUDIT.md`,
   `indep/`, `out_*.txt` on disk are completed work worth ~1.5h of run budget each.
   State in the LOG line what is actually on disk, e.g. `failed (<reason>; artifact
   dir has CLAIMS.md + AUDIT.md, no verify/ — mathematics may be complete, needs
   salvage not relaunch)`.

   **NEVER suggest deleting, clearing, or reusing an attempt directory, and never
   write "relaunchable if the dir is cleared".** Between 2026-07-24 and 2026-07-26
   that exact phrase was written into `attempts/LOG.md` four times about runs whose
   proofs were sitting complete in the named directory; acting on it would have
   destroyed them. If a dir holds substance but no `verify/`, the decision in step 3
   is `ESCALATE` (a salvage iteration), never `RELAUNCH`.

   Also check for compute the dead run left behind before anyone relaunches:
   `bash scripts/reap-orphans.sh` (report only — do not kill). Attempt 18's searches
   were still running 1.5h after its session died.

3. If the run already wrote its own LOG.md line (clean exits normally do), verify
   nothing is missing and do NOT duplicate it. If it crashed before logging,
   APPEND one line to `attempts/LOG.md` in the house format
   `| date | model | problem | target | hours | outcome | artifact | audited-by |`
   with outcome `failed (<one-clause reason from the result line>)`, the artifact
   dir (with its state from step 2) in the artifact column, and `audited-by` =
   `triage-tick`. Never delete or edit existing lines.

4. Decide ONE word and write it to `attempts/supervision/decision`:
   - `RELAUNCH` — the failure looks transient/external (usage-limit kill, watchdog
     ceiling, `overloaded`/5xx API errors, OOM, clean timeout), the run died without
     a fixable defect in the repo, AND step 2 found its artifact dir empty or
     near-empty. A relaunch starts from scratch, so it is only right when there is
     nothing on disk to lose.
   - `ESCALATE` — the same failure signature as the previous run, any crash within
     120s of start, a malformed/incomplete artifact contract, a suspected false
     claim, anything you cannot classify confidently, or — most commonly here —
     **step 2 found substantive work in the artifact dir that was never shipped**.
     That case wants a salvage iteration, and only tier 2 can run one.
   - `IDLE` — the run completed cleanly (`is_error` false or `turn.completed`) AND a
     LOG.md line already exists. BOTH must hold. If the terminal event reports an error
     you have work to do
     in steps 2 and 3 — a crashed run has almost never logged itself, and IDLE
     over one leaves an orphaned artifact with no entry in the denominator. On
     2026-07-25 that happened: a run that crashed with `error_during_execution`
     was triaged IDLE, and sat unlogged for 8.5 hours. `supervisor-tick.sh` now
     appends a bare fallback line when you skip it — that is a backstop, not a
     substitute. Your line is far better: you have read the log and can say what
     the run was doing.

5. Commit any LOG.md change: `git add attempts/LOG.md && git commit -m "triage: log <outcome> for <log-stamp>"`.

Rules: stay inside this repository; no network; do not launch runs yourself; do
not edit or delete any file except `attempts/LOG.md` and
`attempts/supervision/decision` — attempt directories are read-only to you,
always, no exceptions; total budget ≈ 3 minutes of work.
