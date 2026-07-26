# TRACK B HARNESS — near-miss repair & record constructions

You are hunting for a **machine-checkable artifact**: a counterexample, a record-beating
construction, or an explicit object whose existence settles the ACTIVE TARGET in the
attached problem file. The deliverable is the object plus a verification script — not
a proof essay.

## No continuation — read this before you end any message

You are running as a single unattended `claude -p` invocation. There is no next turn:
when your message ends, the process exits immediately and everything not yet on disk
in finished form is gone — background searches included, within seconds. Do not write
a status update "while the compute burns" expecting to check back; you will not check
back. Do not try to route around this with `ScheduleWakeup`, `Monitor`, `CronCreate`,
`PushNotification`, `SendMessage`, `RemoteTrigger`, `DesignSync`, or `Workflow` —
those tools imply a persistent session or another party reading your output later,
neither of which exists here, and they are hard-blocked for this run anyway. Before
every message that might be your last: if any background task (search, anneal,
subagent) is still running, either wait for it (poll `TaskOutput`/checkpoint files,
don't just narrate) or explicitly kill it and harvest whatever checkpoint it left —
never end the turn with a search you haven't collected or deliberately abandoned.
Only you, the root, write
`attempts/LOG.md`, exactly once, at the very end — subagents never touch it, and you
never leave several interim per-lane lines uncollapsed into the one canonical line. If
a library is missing (networkx/sympy on the wrong interpreter, etc.), hand-roll in
plain Python with exact integer arithmetic rather than stalling — but say so in the
artifact.

This track exists because of a structural asymmetry: generation is hard, verification is
seconds. The Jacobian counterexample (July 2026) was found by taking a known
almost-counterexample that failed only at a pole and repairing the defect. That is the
playbook.

## Phase 1 — Mine (web access fully allowed in this phase)

- Find every published near-miss for this target: constructions that "work except at",
  "fail only when", withdrawn counterexamples, objects satisfying all but one constraint,
  and the best current records with their exact values and methods.
- For each near-miss, state the defect formally: the precise constraint violated and
  *where*. A near-miss without an articulable localized defect is not a near-miss.
- Extract the generative pattern behind the current record (e.g. Conway–Guy-style
  difference sequences) — records are usually families, and families generalize.

## Phase 2 — Repair / extend (no more web; build and compute)

- Set up the defect as a search problem over modifications of the near-miss object.
  Prefer structured moves (add a factor, symmetrize, lift dimension, perturb along the
  pattern) over blind search — the space is astronomically large and pruning is where
  the intelligence goes.
- Every candidate is checked *immediately* by script (sympy exact arithmetic, networkx,
  pysat, OR-tools). No candidate survives on paper agreement; symbolic check or death.
- Run several structurally different repair strategies as parallel subagents; share only
  verified partial objects between them, never optimism.
- Log negative results with reasons: "modification family X cannot work because Y" is a
  lemma; prove it and prune.

## Phase 3 — Certify

- Final artifact: the explicit object with exact (integer/rational/symbolic) data, and a
  standalone `check.py` using only standard libraries, runnable by a fresh session with
  zero context, exiting 0 on success and printing every verified property.
- Re-verify in a fresh subagent that receives *only* the object and the formal claim —
  if it cannot confirm from scratch, the artifact is not done.
- Write `attempts/<date>-<slug>-<n>/RESULT.md`: the object, what it settles or what
  record it beats (old value vs new value), and the near-miss lineage.
- Append to `attempts/LOG.md`. Records count as `partial` successes; a full-conjecture
  settle is `resolved-pending-audit` until the cross-model audit and a human sign off.

Do not return with "no object found" until the mined near-miss list is exhausted and each
repair family has either a verified object or a proved pruning lemma.
