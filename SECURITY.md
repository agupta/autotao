# Security

## Reporting a vulnerability

Report privately through GitHub's [security advisory
form](https://github.com/agupta/autotao/security/advisories/new). Please do not open a
public issue for anything exploitable.

Expect an acknowledgement within a week.

## What this software does on your machine

AutoTao is a supervisor for an AI coding agent that it runs unattended, on a loop, with
your subscription credentials. That is an unusual amount of trust, so it is worth being
explicit about the shape of it:

- **It executes an agent CLI (`claude` or `codex`) with your logged-in credentials**, on a
  schedule, without a human present. The agent has whatever tool permissions your engine
  configuration grants it. AutoTao does not sandbox the agent; it paces and supervises it.
- **It commits to your repository** and can push if your checkout is configured to.
- **It runs whatever the agent writes**, including verification scripts the agent wrote
  itself. `verify/` is executed, not just read.
- **It spawns detached compute** that outlives the run that started it. `scripts/reap-orphans.sh`
  exists to find and kill that compute, and it is scoped by an environment stamp so it can
  never touch processes you started yourself.

Run it in a checkout you would be comfortable letting an unattended agent commit to, on a
box where that agent's blast radius is acceptable to you.

## Data that stays local

These are gitignored and are never packaged, uploaded, or included in a release artifact:

- `.autotao/` — imported and last-known runtime state, written owner-only (`0700`/`0600`).
- `attempts/raw-logs/` — raw agent transcripts. They contain whatever a run printed, which
  can include file contents and command output from your machine.
- `papers/*.pdf` and extracted text — size and copyright.

The session browser in the console reads raw logs lazily from disk and deliberately omits
internal reasoning payloads. It does not copy them into `.autotao/state.json`.

State import excludes raw-log contents and process environments.

## Network

The harness reaches the network in three places, all of which you can observe:

- the engine CLI talking to its own provider;
- `scripts/fetch-paper.sh`, when a run requests a paper — arXiv, DOI resolvers, and
  Unpaywall, with every attempt recorded in `papers/INDEX.tsv` whether it succeeded or not;
- the update check, which is one request to the GitHub releases API at most once a day.
  Disable it with `AUTOTAO_NO_UPDATE_CHECK=1`.

`autotao update` verifies a SHA-256 checksum from the release's `SHA256SUMS` before
installing anything, and refuses to install if the file is absent, unparseable, or does not
match. It runs the downloaded binary once before it replaces the running one.

## Supply chain

Release binaries are built by `.github/workflows/release.yml` on GitHub-hosted runners from
a tag, with checksums published alongside. There is no separate signing key today; verify
with `SHA256SUMS` and the workflow run linked from the release.
