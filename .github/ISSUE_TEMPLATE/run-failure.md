---
name: A run failed operationally
about: The harness lost work, deadlocked, stacked runs, or otherwise misbehaved
title: ""
labels: harness
---

<!--
This is the most useful kind of issue for this project. Most of what is in harness/ was
written after a report like this one. Please do not include raw agent logs verbatim —
they contain whatever your run happened to print. Quote the relevant lines.
-->

**What the harness did**

**What it should have done**

**Where in the loop it happened**
<!-- orient / choose job / open-status check / attempt / ship-by-halfway / close the books -->

**Evidence**
<!-- relevant lines from attempts/supervision/tick.log, the LOG.md line if one was written -->

```
```

**Was work lost?**
<!-- Was there finished mathematics on disk that never got committed? Roughly how much run time? -->

**Environment**
- OS and arch:
- `bash --version`:
- `autotao --version`:
- Engine (`claude` / `codex`) and model:
- `bash scripts/preflight.sh` output:

```
```
