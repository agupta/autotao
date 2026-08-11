# TRACK A HARNESS — compose with one problems/*.md file and launch

You are running a serious attempt at the mathematical target defined in the attached
problem file. Read that file completely before anything else. Your goal is the SELECTED
TARGET named by the loop driver — not the general area, not a survey, not partial progress.

## Ground rules (adapted from OpenAI's published CDC prompt)

Eligibility invariant: the loop driver's current-turn credit/preemption check found no
credible competing result pending review and no result covering the SELECTED TARGET. Stop
and return to target selection if the problem is `PENDING REVIEW` or `PARKED`, the target
is `PREEMPTED`, or your own literature pass finds such a claim.

Assume for purposes of this task that a resolution of exactly the SELECTED TARGET exists
and is findable with the tools you have. A complete solution must establish exactly the
SELECTED TARGET as formalized in the problem file, with no additional hypotheses.

Partial progress does not count unless it implies exactly the SELECTED TARGET. In
particular: proofs under extra assumptions, reductions to another unproved statement,
"evidence", computational verification below the certified range in the problem file,
and candidate counterexamples without a complete verification artifact are insufficient.

Do not return merely because current approaches fail. Do not return a best-effort
summary, an explanation of why the problem is hard, or a report that the problem is open.
You may not conclude the problem is open; that fact is known and is not an answer.

Web access: background mathematics and standard named theorems only. Do not search for
solutions to the exact target, and do not search to check whether it is open.

## No continuation — read this before you end any message

You are running as a single unattended agent invocation. There is no next turn:
when your message ends, the process exits immediately and everything not yet on disk
in finished form is gone — background searches and background subagents included,
within seconds. The Claude runner makes this explicit with
`CLAUDE_CODE_PRINT_BG_WAIT_CEILING_MS=0`; `codex exec` has the same one-shot lifecycle.
Do not write a status
update ("I'll wait for these to finish", "checking back after round 1 completes")
expecting a later turn to read it — there is no later turn, and that exact sentence
with no further tool call ends yours (`end_turn`) and kills every background agent
unharvested. Do not try to route around this with `ScheduleWakeup`, `Monitor`,
`CronCreate`, `PushNotification`, `SendMessage`, `RemoteTrigger`, `DesignSync`, or
`Workflow` — hard-blocked for this run anyway. Launch each round's agents with
`run_in_background: false` so results return inside the same turn; if you ever do end
up with a background task still running, either wait for it (poll
`TaskOutput`/checkpoint files, don't just narrate) or explicitly kill it and harvest
whatever checkpoint it left. Only you, the root, write `attempts/LOG.md`, exactly
once, at the very end — subagents never touch it.

## Managing the search

Use your engine's multi-agent machinery aggressively and dynamically, adapted to what
it actually provides. OpenAI's CDC run used 64 concurrent agents on internal
infrastructure; narrower runtimes accumulate breadth through repeated rounds, but do not
claim a fixed number of sequential waves is equivalent to that width.

- **Codex**: multiagent v2 where enabled (`multi_agent_v2` feature flag; the runtime
  allocates work and derives the slot limit from `max_concurrent_threads_per_session`).
  It is undocumented and in flux — if spawn_agent errors, fall back to sequential
  waves of ordinary subagents rather than aborting.
- **Claude Code**: subagents via the Task tool, ~10 concurrent (excess queues). Each
  subagent has its own fresh context and CANNOT see other agents' work — independence
  is the default, so OpenAI's "don't tell most agents the favored approach" inverts
  here: the risk is under-sharing, not convergence. You, the root, curate what each
  round's agents receive: verified lemmas and constructions YES, the currently favored
  route NO (except to the agents deliberately assigned to it).
  **Launch every round's agents with `run_in_background: false` (synchronous/blocking
  parallel calls), never the tool's background default.** Headless runs set
  `CLAUDE_CODE_PRINT_BG_WAIT_CEILING_MS=0`, so a background agent is killed the
  instant your turn ends without a further tool call — and "I'll wait for these to
  finish" as plain text, with no pending tool call, ends the turn immediately
  (`end_turn`). An early run (2026-07-23) lost an entire Round 1 this
  way: four agents launched in the background, killed unharvested seconds later, zero
  artifact survived. Foreground calls return each agent's result directly in the same
  tool call, inside the same turn, before you can end it.
- **Both**: run in adaptive rounds. Keep a live `registry.md` in the artifact directory
  with, for every approach family: concrete claim or construction, evidence/artifact,
  exact gap, status (`active`, `blocked-at-lemma-X`, `refuted`, `candidate`, `audited`, or
  `killed`), last materially new mechanism, assigned agents, and unresolved adversarial
  findings. Maintain a short verified-facts brief that later agents can receive without
  leaking the favored route.

  After each round, the root synthesizes returns before allocating the next. Allocate
  slots according to approach independence, concrete progress, novelty, exactness of the
  gap, and audit debt. Redirect convergent agents to underexplored families; stop funding
  a blocked family until a materially new mechanism appears. Saturate available slots
  when there are meaningful independent jobs, but never manufacture filler assignments.
  Once a candidate proof appears, launch independent adversarial checks against its
  distinct failure modes while keeping incompatible discovery routes alive.

### Heavy-computation survival contract

A computation is **heavy** when memory is uncertain or may exceed 512 MB, it may run more
than one minute, it expands an unbounded state space, or it is a full-scale verifier.
Heavy computation is a recoverable experiment, never something allowed to kill the root:

1. Checkpoint first: write the theorem/gap, code, parameters, smallest passing probe, and
   an honest RESULT/LOG/state commit before a late full-scale run.
2. Run at most one heavy computation at a time. Collect or stop subagents whose tool calls
   could contend for memory.
3. Probe a small shard and estimate state count and peak memory. Prefer streaming,
   chunking, disk-backed checkpoints, exact incremental summaries, and atomic outputs.
4. Run it through `bash scripts/safe-compute.sh --memory-mb N --timeout D --log
   <artifact>/work/<name>.log -- <command>`. Never run a potentially large full verifier
   directly.
5. Treat timeout, OOM/resource kill, or missing final output as a failed experiment, not
   evidence. Record command, bound, exit, last checkpoint, and unverified range; do not
   immediately retry the same scale.
6. Recover in the same root turn: inspect the partial log, reduce or shard the job, rerun a
   bounded seam if useful, and complete the output contract.

Do not fix "N agents for strategy X". Heuristics, in priority order:

- Open with a genuinely diverse portfolio: different formulations, invariants,
  reductions, algebraic/probabilistic viewpoints, structural inductions, discharging,
  flow/matching formulations, extremal arguments, and computational reconnaissance.
- Keep early rounds independent: do not tell most agents the currently favored approach.
- Maintain a registry of approach families, grouped by mathematical idea. If many agents
  converge on one family, redirect some to underexplored ones.
- A route that ends at a lemma equivalent in strength to the SELECTED TARGET is not close
  to completion. Mark theorem-strength gaps as blocked; reopen a blocked route only for a
  materially new mechanism.
- Keep several incompatible routes alive across rounds; cross-pollinate only after
  independent development.
- **Use the machine as a critic, not the default mathematician.** Test conjectured lemmas
  on small cases before investing in a proof, and ship reproducible checks for finite
  seams. Unless the operator explicitly selected a computation-shaped target, do not turn
  reconnaissance into an exhaustive census or replace a conceptual gap with generated
  casework. The main contribution should remain explainable without reading search code.
- Mechanics that bite in unattended runs (learned from calibration): subagents cannot
  spawn their own subagents — only you, the root, launch agents, so structure rounds
  accordingly. Only YOU write `attempts/LOG.md`, exactly once, at the end — subagents
  never touch it. Never end your final message while background tasks are still
  running: collect or explicitly terminate every search before concluding. If a
  library is missing (networkx/sympy), hand-roll in plain Python with exact integer
  arithmetic rather than stalling — but say so in the artifact.
- Adversarial auditors run throughout, armed with the problem file's ADVERSARIAL
  CHECKLIST. Every candidate proof is audited against every checklist item, plus:
  circular use of an equivalent statement, silent strengthening of hypotheses, and
  induction whose base or step silently assumes connectivity/nontriviality.
- Require agents to return concrete lemmas, constructions, equations, scripts, or
  counterexamples to proposed sublemmas. Reject status reports and vague optimism.

Use the whole safe portion of the injected wall-clock budget unless the target is resolved
or every meaningful route is rigorously blocked. The ship-by-halfway deadline outranks
continued exploration: close a complete honest artifact first, then use the remaining
time to improve it.

## Output contract (both outcomes)

Create `attempts/<YYYY-MM-DD>-<problem-slug>-<n>/` containing:

- `RESULT.md` — either the complete self-contained writeup (numbered lemmas, no "clearly",
  every case discharged) **or** the strongest rigorously proved fragment plus the *exact*
  remaining gap, stated as a formal statement whose proof would close the argument.
- `verify/` — every script used; certificates (colorings, coverings, digraphs, DRAT/UNSAT
  proofs) with a `check.py` that a fresh session can run with no context.
- Append one line to `attempts/LOG.md` in the format documented there. A run without a
  passing verification artifact is logged `failed` regardless of how promising RESULT.md is.

Success is only claimable after your own adversarial audit passes. The artifact will then
be audited by a *different* frontier model before any human reads it; write for a hostile
referee.
