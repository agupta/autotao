#!/usr/bin/env bash
# Print "<is_error> <duration_ms>" for a completed Claude or Codex raw log.
# Print nothing when the log has no terminal event yet.
set -euo pipefail

LOG_PATH="${1:?usage: result-info.sh <raw-log>}"
export LOG_PATH
tail -c 65536 "$LOG_PATH" 2>/dev/null | python3 -c '
import datetime, json, os, re, sys

events = []
for line in sys.stdin:
    try:
        events.append(json.loads(line))
    except Exception:
        pass

for event in reversed(events):
    kind = event.get("type")
    if kind == "result":
        print(
            "1" if event.get("is_error") else "0",
            event.get("duration_ms", 0),
        )
        break
    if kind in ("turn.completed", "turn.failed", "error"):
        path = os.environ["LOG_PATH"]
        stat = os.stat(path)
        match = re.search(r"(\d{8}-\d{6})", os.path.basename(path))
        if match:
            started = datetime.datetime.strptime(
                match.group(1), "%Y%m%d-%H%M%S"
            ).astimezone().timestamp()
        else:
            started = getattr(stat, "st_birthtime", 0) or stat.st_ctime
        duration = max(0, int((stat.st_mtime - started) * 1000))
        print("0" if kind == "turn.completed" else "1", duration)
        break
'
