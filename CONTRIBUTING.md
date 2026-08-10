# Contributing

AutoTao is two things in one repository, and they take contributions differently.

**The harness** (`harness/`, `scripts/`, `criteria.md`) is mostly scar tissue — directives
written after a specific run failed in a specific way, usually with the date in the
comment. Changes here are welcome, but a change that removes a directive needs to say
what makes the original failure no longer possible. "This looks redundant" is not that.

**The console** (`apps/autotao/`) is ordinary TypeScript and takes ordinary pull requests.

## Before you open a pull request

```sh
bash scripts/preflight.sh          # this box can run the harness
cd apps/autotao && bun run verify  # typecheck, tests, standalone build
```

CI runs both on Linux and macOS. It also plants a fake orphaned process and asserts the
reaper finds and kills it, which is the test most likely to catch a portability mistake.

## Shell code

Everything runs on both GNU/Linux and BSD/macOS userland. When you need something the two
platforms spell differently — process listings, file metadata, memory, dates — add a
function to `scripts/portable.sh` and call it, rather than branching on `uname` at the call
site. Bash 4.4+ is assumed; `at_require_bash` reports it.

Run `shellcheck scripts/*.sh` before pushing. CI runs it at `warning` severity.

## What does not belong in a commit

- Anything under `.autotao/`, `attempts/raw-logs/`, or `papers/*.pdf`. These are
  operator-owned state, they can contain whatever a run happened to print, and they are
  gitignored for that reason.
- Mathematical results. Those go in `attempts/LOG.md` and an attempt directory, per the
  rules in that file. `CHANGELOG.md` is for software.
- Lines deleted from `attempts/LOG.md`. It is append-only. Corrections are appended.

## Commit messages

Present tense, imperative, and about the behavior rather than the diff:

```
autotao: prevent dashboard text clipping
```

## Reporting a run that went wrong

The most valuable issue you can file is a run that failed operationally — killed at the
wall with unshipped work, a deadlocked lock file, a subagent nobody harvested. Include the
relevant part of `attempts/supervision/tick.log` and what the harness *should* have done.
Those reports are where most of `harness/` came from.
