# TRACK A HARNESS — compose with one problems/*.md file and launch

You are running a serious attempt at the mathematical target defined in the attached
problem file. Read that file completely before anything else. Your goal is the target
marked `ACTIVE TARGET` there — not the general area, not a survey, not partial progress.

## Ground rules (adapted from OpenAI's published CDC prompt)

Assume for purposes of this task that a resolution of exactly the ACTIVE TARGET exists
and is findable with the tools you have. A complete solution must establish exactly the
ACTIVE TARGET as formalized in the problem file, with no additional hypotheses.

Partial progress does not count unless it implies exactly the ACTIVE TARGET. In
particular: proofs under extra assumptions, reductions to another unproved statement,
"evidence", computational verification below the certified range in the problem file,
and candidate counterexamples without a complete verification artifact are insufficient.

Do not return merely because current approaches fail. Do not return a best-effort
summary, an explanation of why the problem is hard, or a report that the problem is open.
You may not conclude the problem is open; that fact is known and is not an answer.

Web access: background mathematics and standard named theorems only. Do not search for
solutions to the exact target, and do not search to check whether it is open.

## No continuation — read this before you end any message

You are running as a single unattended `claude -p` invocation. There is no next turn:
when your message ends, the process exits immediately and everything not yet on disk
in finished form is gone — background searches and background subagents included,
within seconds (`CLAUDE_CODE_PRINT_BG_WAIT_CEILING_MS=0`). Do not write a status
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
it actually provides (OpenAI's CDC run used 64 concurrent agents on internal
infrastructure — neither consumer engine gives that; recover breadth through
**rounds**, not width):

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
- **Both**: run in rounds. Because subagents are stateless, keep a live
  `registry.md` in the artifact dir — approach families, agents assigned per round,
  status (active / blocked-at-lemma-X / killed), and the verified-facts brief. Each
  round: read registry → launch ~10 diverse agents → synthesize returns into the
  registry → next round. 6 rounds of 10 beats 1 round of 64 for diversity anyway.

Do not fix "N agents for strategy X". Heuristics, in priority order:

- Open with a genuinely diverse portfolio: different formulations, invariants,
  reductions, algebraic/probabilistic viewpoints, structural inductions, discharging,
  flow/matching formulations, extremal arguments, and computational reconnaissance.
- Keep early rounds independent: do not tell most agents the currently favored approach.
- Maintain a registry of approach families, grouped by mathematical idea. If many agents
  converge on one family, redirect some to underexplored ones.
- A route that ends at a lemma equivalent in strength to the ACTIVE TARGET is not close
  to completion. Mark theorem-strength gaps as blocked; reopen a blocked route only for a
  materially new mechanism.
- Keep several incompatible routes alive across rounds; cross-pollinate only after
  independent development.
- **Use the machine.** This harness, unlike a bare LLM, can execute code. Every
  combinatorial claim gets tested on small cases (sympy / networkx / OR-tools / pysat)
  before anyone tries to prove it. Case analyses are eliminated by solver, with logged
  seeds and reproducible scripts, in the style of the SSNC out-degree-7 and
  Barnette faces-≤8 papers. An afternoon of CP-SAT beats a week of cleverness.
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

Work for at least 4 hours of sustained effort (or until context is genuinely exhausted,
whichever is later) before even considering the failure protocol.

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
