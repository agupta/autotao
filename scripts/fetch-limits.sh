#!/usr/bin/env bash
# Refresh the usage caches by querying Anthropic's OAuth usage endpoint directly.
# Token is read locally and sent ONLY to api.anthropic.com. Exit 0 on success.
#
# Writes TWO files:
#   ~/.claude/rate_limits.json     — legacy {five_hour,seven_day,ts} for back-compat
#   ~/.claude/rate_limits_v2.json  — tank-aware: session + weekly_all + per-model weekly
#
# The usage endpoint's `limits` array carries per-model weekly tanks: a
# kind="weekly_scoped" entry with scope.model.display_name ("Fable"/"Opus"/...).
# The 5-hour window (kind="session") is SHARED across models; the weekly limit has
# both an aggregate (weekly_all) and per-model scoped tanks. So run_model matters
# for the weekly dimension but not the 5-hour one.
set -euo pipefail

CRED="$HOME/.claude/.credentials.json"
LEGACY="$HOME/.claude/rate_limits.json"
V2="$HOME/.claude/rate_limits_v2.json"

TOKEN=$(jq -r '.claudeAiOauth.accessToken // empty' "$CRED" 2>/dev/null)
[[ -n "$TOKEN" ]] || { echo "no OAuth token in $CRED" >&2; exit 3; }

RESP=$(curl -sf --max-time 15 \
  -H "Authorization: Bearer $TOKEN" \
  -H "anthropic-beta: oauth-2025-04-20" \
  -H "Content-Type: application/json" \
  "https://api.anthropic.com/api/oauth/usage") || { echo "usage endpoint fetch failed" >&2; exit 4; }

RESP="$RESP" LEGACY="$LEGACY" V2="$V2" python3 <<'EOF'
import json, os, time
resp = json.loads(os.environ["RESP"])
now = int(time.time())

def to_ts(v):
    if v is None: return None
    if isinstance(v, (int, float)): return int(v)
    try:
        from datetime import datetime
        return int(datetime.fromisoformat(str(v).replace("Z", "+00:00")).timestamp())
    except Exception:
        return None

def pct(o):
    # Every field this endpoint returns (`percent`, and the legacy `utilization`
    # fallback) is already 0-100, never a 0-1 fraction — confirmed against the
    # live /api/oauth/usage payload on 2026-07-23 (five_hour.utilization: 1.0
    # matched limits[].percent: 1 for the same window; seven_day.utilization: 9.0
    # matched weekly_all's percent: 9). A prior "rescale if <=1" heuristic here
    # meant to handle a fractional 0-1 shape misfired on any genuinely low but
    # real percentage (e.g. 1% right after a fresh 5-hour window starts),
    # inflating it to 100% and spuriously blocking launches. Do not reintroduce
    # fraction-rescaling without fresh evidence the API actually returns one.
    for k in ("percent", "used_percentage", "utilization", "usage_percentage"):
        if isinstance(o, dict) and o.get(k) is not None:
            return round(float(o[k]))
    return None

session_pct = weekly_all_pct = None
session_reset = weekly_reset = None
by_model = {}
severities = []

for lim in (resp.get("limits") or []):
    if not isinstance(lim, dict): continue
    p = pct(lim)
    kind = lim.get("kind")
    if lim.get("severity"): severities.append(lim["severity"])
    if kind == "session":
        session_pct, session_reset = p, to_ts(lim.get("resets_at"))
    elif kind == "weekly_all":
        weekly_all_pct, weekly_reset = p, to_ts(lim.get("resets_at"))
    elif kind == "weekly_scoped":
        name = (((lim.get("scope") or {}).get("model") or {}).get("display_name") or "").strip().lower()
        if name and p is not None:
            by_model[name] = p

# Fallbacks if the top-level five_hour/seven_day objects are present instead
if session_pct is None:
    fh = resp.get("five_hour") or {}
    session_pct, session_reset = pct(fh), to_ts(fh.get("resets_at"))
if weekly_all_pct is None:
    sd = resp.get("seven_day") or {}
    weekly_all_pct, weekly_reset = pct(sd), to_ts(sd.get("resets_at"))

if session_pct is None or weekly_all_pct is None:
    with open(os.environ["V2"] + ".raw-debug", "w") as f: json.dump(resp, f, indent=2)
    raise SystemExit("unrecognized usage shape; raw saved to rate_limits_v2.json.raw-debug")

sev_rank = {"normal": 0, "notice": 1, "warning": 2, "critical": 3}
worst = max(severities, key=lambda s: sev_rank.get(s, 0)) if severities else "normal"

v2 = {
    "session": session_pct, "session_resets_at": session_reset,
    "weekly_all": weekly_all_pct, "weekly_resets_at": weekly_reset,
    "weekly_by_model": by_model,          # e.g. {"fable": 0, "opus": 3}
    "severity": worst,
    "ts": now,
}
with open(os.environ["V2"], "w") as f: json.dump(v2, f)

# Legacy file for the statusline / older callers.
legacy = {
    "five_hour": {"used_percentage": session_pct, "resets_at": session_reset},
    "seven_day": {"used_percentage": weekly_all_pct, "resets_at": weekly_reset},
    "ts": now,
}
with open(os.environ["LEGACY"], "w") as f: json.dump(legacy, f)
print(json.dumps(v2))
EOF
