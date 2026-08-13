#!/usr/bin/env bash
# Refresh usage caches from Anthropic's OAuth usage endpoint. Calls are serialized,
# throttled, and backed off after rate limits so a TUI refresh loop cannot hammer the
# endpoint. An interactive Claude status line may update the aggregate legacy cache too.
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
RETRY_AT_FILE="$HOME/.claude/rate_limits_retry_at"
LOCK_DIR="$HOME/.claude/rate_limits_fetch.lock"
MIN_INTERVAL="${FETCH_LIMITS_MIN_INTERVAL:-600}"
ERROR_BACKOFF="${FETCH_LIMITS_ERROR_BACKOFF:-120}"

[[ "$MIN_INTERVAL" =~ ^[0-9]+$ ]] || { echo "FETCH_LIMITS_MIN_INTERVAL must be a non-negative integer" >&2; exit 2; }
[[ "$ERROR_BACKOFF" =~ ^[0-9]+$ ]] || { echo "FETCH_LIMITS_ERROR_BACKOFF must be a non-negative integer" >&2; exit 2; }

# The console, launch gate, and watchdog can notice staleness together. Use an atomic
# directory lock rather than flock(1), which macOS does not ship.
if ! mkdir "$LOCK_DIR" 2>/dev/null; then
  HOLDER=$(cat "$LOCK_DIR/pid" 2>/dev/null || true)
  if [[ -n "$HOLDER" ]] && kill -0 "$HOLDER" 2>/dev/null; then
    echo "usage refresh already in progress" >&2
    exit 4
  fi
  rm -f "$LOCK_DIR/pid"
  rmdir "$LOCK_DIR" 2>/dev/null || { echo "usage refresh lock cannot be reclaimed" >&2; exit 4; }
  mkdir "$LOCK_DIR" || exit 4
fi
echo $$ > "$LOCK_DIR/pid"

HDR=$(mktemp)
BODY=$(mktemp)
cleanup(){
  rm -f "$HDR" "$BODY" "$LOCK_DIR/pid"
  rmdir "$LOCK_DIR" 2>/dev/null || true
}
trap cleanup EXIT

NOW=$(date +%s)
REFRESHED=0

refresh_oauth(){
  local refresh scopes
  refresh=$(jq -r '.claudeAiOauth.refreshToken // empty' "$CRED" 2>/dev/null)
  scopes=$(jq -r '.claudeAiOauth.scopes // [] | join(" ")' "$CRED" 2>/dev/null)
  [[ -n "$refresh" && -n "$scopes" ]] || {
    echo "saved Claude OAuth credential cannot be refreshed; run claude auth login" >&2
    return 1
  }
  CLAUDE_CODE_OAUTH_REFRESH_TOKEN="$refresh" CLAUDE_CODE_OAUTH_SCOPES="$scopes" \
    claude auth login >/dev/null 2>&1 || {
      echo "Claude OAuth refresh failed; run claude auth login" >&2
      return 1
    }
  REFRESHED=1
}

EXPIRES_AT=$(jq -r '.claudeAiOauth.expiresAt // 0' "$CRED" 2>/dev/null || echo 0)
if [[ "$EXPIRES_AT" =~ ^[0-9]+$ ]] && (( EXPIRES_AT > 0 && EXPIRES_AT <= NOW * 1000 + 120000 )); then
  refresh_oauth || exit 3
fi

RETRY_AT=$(cat "$RETRY_AT_FILE" 2>/dev/null || echo 0)
if [[ -z "${FETCH_LIMITS_FORCE:-}" && "$REFRESHED" -eq 0 && "$RETRY_AT" =~ ^[0-9]+$ ]] \
   && (( RETRY_AT > NOW )); then
  echo "usage refresh backed off for $(( RETRY_AT - NOW ))s" >&2
  exit 4
fi

# Re-check after locking: another caller may have refreshed while this one waited.
V2_TS=$(jq -r '.ts // 0' "$V2" 2>/dev/null || echo 0)
LEGACY_TS=$(jq -r '.ts // 0' "$LEGACY" 2>/dev/null || echo 0)
FRESHEST_TS=${V2_TS%.*}
(( ${LEGACY_TS%.*} > FRESHEST_TS )) && FRESHEST_TS=${LEGACY_TS%.*}
if [[ -z "${FETCH_LIMITS_FORCE:-}" ]] && (( NOW - FRESHEST_TS < MIN_INTERVAL )); then
  echo "usage cache is fresh; endpoint refresh skipped" >&2
  exit 0
fi

request_usage(){
  local token version
  token=$(jq -r '.claudeAiOauth.accessToken // empty' "$CRED" 2>/dev/null)
  [[ -n "$token" ]] || { echo "no OAuth token in $CRED" >&2; return 1; }
  version=$(claude --version 2>/dev/null | awk '{print $1}')
  : > "$HDR"; : > "$BODY"
  STATUS=$(curl -sS --max-time 15 -D "$HDR" -o "$BODY" -w '%{http_code}' \
    -H "Authorization: Bearer $token" \
    -H "anthropic-beta: oauth-2025-04-20" \
    -H "Content-Type: application/json" \
    -H "User-Agent: claude-code/${version:-unknown}" \
    "https://api.anthropic.com/api/oauth/usage")
}

request_usage || { echo "usage endpoint fetch failed" >&2; exit 4; }

if [[ "$STATUS" == 401 && "$REFRESHED" -eq 0 ]]; then
  refresh_oauth || exit 3
  request_usage || { echo "usage endpoint fetch failed after OAuth refresh" >&2; exit 4; }
fi
if [[ "$STATUS" == 429 ]]; then
  RETRY_AFTER=$(awk 'tolower($1) == "retry-after:" && $2 ~ /^[0-9]+\r?$/ {gsub("\r", "", $2); print $2; exit}' "$HDR")
  [[ "${RETRY_AFTER:-}" =~ ^[0-9]+$ ]] || RETRY_AFTER=$ERROR_BACKOFF
  printf '%s\n' "$(( $(date +%s) + RETRY_AFTER ))" > "$RETRY_AT_FILE"
  echo "usage endpoint rate-limited; retry after ${RETRY_AFTER}s" >&2
  exit 4
fi
[[ "$STATUS" == 200 ]] || { echo "usage endpoint returned HTTP $STATUS" >&2; exit 4; }

RESP="$(<"$BODY")" LEGACY="$LEGACY" V2="$V2" python3 <<'EOF'
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
rm -f "$RETRY_AT_FILE"
