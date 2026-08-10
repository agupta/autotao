#!/usr/bin/env bash
# Find (and optionally kill) compute orphaned by a finished solve run.
#
# A solve run is time-capped (RUN_TIMEOUT_MIN, default 90). Anything it started
# with `nohup ... &` outlives that cap: the run is killed, the compute keeps
# going, reparents to init, and can hold CPU for hours with nobody watching.
# That is sometimes what you want (a long exhaustive search you intend to
# collect later) and sometimes pure waste (a search in superexponential blowup
# returning the same null answer at every n). This script makes the choice
# visible instead of leaving it to chance.
#
# Identification: ONLY processes the pipeline itself spawned. run-once.sh
# exports AUTOTAO_RUN_ID before launching the run; the env is inherited through
# fork/setsid/nohup, so detached compute still carries it after the run is
# killed at RUN_TIMEOUT_MIN. We match on the process's own environment
# (/proc/<pid>/environ on Linux, `ps -E` on macOS — see scripts/portable.sh).
#
# This is deliberately NOT a cwd heuristic. Work started by hand — a fleet
# babysitter, a census you kicked off yourself, anything you are nursing toward
# publication — has no AUTOTAO_RUN_ID and is invisible to this script. Only
# what the autonomous loop started is ever a candidate.
#
# Claude Code setsid's every tool call, so each orphan has its own SID *and*
# PGID; there is no process group to kill, hence the per-subtree walk below.
#
# DRY RUN BY DEFAULT — prints what it would kill and exits 0. Pass --kill to
# actually terminate (SIGTERM, then SIGKILL after --grace seconds).
#
# Belt and braces on top of the AUTOTAO_RUN_ID scoping: anything matching
# REAP_EXCLUDE is skipped, and a `.noreap` file in a process's cwd exempts
# everything running there.
#
#   scripts/reap-orphans.sh                        # list orphans
#   scripts/reap-orphans.sh --older-than 3600      # only those running >1h
#   scripts/reap-orphans.sh --kill --older-than 3600
#   scripts/reap-orphans.sh --quiet                # count only (for the console)
set -uo pipefail
cd "$(dirname "$0")/.." || exit 1
REPO="$PWD"
source scripts/portable.sh
at_require_bash || exit 1

DO_KILL=0; OLDER_THAN=0; GRACE=10; QUIET=0
# Never reap these: detached-by-design supervisors/babysitters.
REAP_EXCLUDE="${REAP_EXCLUDE:-babysit|supervise-console|supervisor-tick|reap-orphans}"
while (( $# )); do
  case "$1" in
    --kill)       DO_KILL=1 ;;
    --older-than) OLDER_THAN="${2:-0}"; shift ;;
    --grace)      GRACE="${2:-10}"; shift ;;
    --quiet)      QUIET=1 ;;
    -h|--help)    sed -n '2,26p' "$0"; exit 0 ;;
    *) echo "unknown arg: $1" >&2; exit 2 ;;
  esac
  shift
done

# All descendants of a pid, deepest last.
descendants(){ local p="$1" kid
  for kid in $(pgrep -P "$p" 2>/dev/null); do printf '%s\n' "$kid"; descendants "$kid"; done; }

# Sum %CPU over a pid and its whole subtree — the wrapper shell always reads
# 0.0%; the work is in the children.
tree_cpu(){ local p="$1"; local -a t; mapfile -t t < <(printf '%s\n' "$p"; descendants "$p")
  at_ps_pids pcpu= "${t[@]}" | awk '{s+=$1} END{printf "%.1f", s}'; }

# Best label for a root: the busiest command in its subtree, not the shell.
tree_cmd(){ local p="$1"; local -a t; mapfile -t t < <(printf '%s\n' "$p"; descendants "$p")
  at_ps_pids pcpu=,args= "${t[@]}" | sort -rn | head -1 \
  | sed -E 's/^ *[0-9.]+ +//'; }

# Protected if ANY command in the subtree matches REAP_EXCLUDE. Testing only the
# busiest one is not enough: a babysitter spends its life in `sleep`, so its
# subtree's top-CPU command is the sleep, not the babysitter — matching on that
# alone would have made the GCP fleet's babysitter look reapable.
tree_protected(){ local p="$1"; local -a t; mapfile -t t < <(printf '%s\n' "$p"; descendants "$p")
  at_ps_pids args= "${t[@]}" | grep -qE "$REAP_EXCLUDE"; }

# Was this process spawned by a pipeline run?
run_id_of(){ at_proc_env "$1" AUTOTAO_RUN_ID; }

# pid<TAB>etimes<TAB>tree_cpu<TAB>cwd<TAB>run_id<TAB>cmd  for orphaned run-spawned roots
find_orphans(){
  local pid ppid et cpu cwd cmd rid
  while read -r pid ppid et cpu cmd; do
    [[ "$ppid" == "1" ]] || continue          # launching session is gone
    (( et >= OLDER_THAN )) || continue
    rid=$(run_id_of "$pid"); [[ -n "$rid" ]] || continue   # pipeline-spawned only
    cwd=$(at_proc_cwd "$pid"); [[ -n "$cwd" ]] || cwd="$REPO"
    [[ -e "$cwd/.noreap" ]] && continue
    tree_protected "$pid" && continue
    cmd=$(tree_cmd "$pid")
    printf '%s\t%s\t%s\t%s\t%s\t%s\n' "$pid" "$et" "$(tree_cpu "$pid")" "${cwd#$REPO/}" "$rid" "$cmd"
  done < <(at_ps_all)
}

mapfile -t ORPHANS < <(find_orphans)

if (( QUIET )); then
  printf '%s\n' "${#ORPHANS[@]}"
  exit 0
fi

if (( ${#ORPHANS[@]} == 0 )); then
  echo "no orphaned pipeline compute$( (( OLDER_THAN > 0 )) && echo " older than ${OLDER_THAN}s")"
  exit 0
fi

printf '%-8s %-8s %6s  %-20s %s\n' PID AGE CPU% RUN CMD
for row in "${ORPHANS[@]}"; do
  IFS=$'\t' read -r pid et cpu _ rid cmd <<< "$row"
  printf '%-8s %-8s %6s  %-20s %s\n' "$pid" \
    "$(awk -v s="$et" 'BEGIN{h=int(s/3600);m=int((s%3600)/60);printf "%dh%02dm",h,m}')" \
    "$cpu" "${rid:0:20}" "${cmd:0:64}"
done

TOTAL_CPU=$(printf '%s\n' "${ORPHANS[@]}" | awk -F'\t' '{s+=$3} END{printf "%.0f", s}')
echo
echo "${#ORPHANS[@]} orphaned process(es), ${TOTAL_CPU}% CPU total"

if (( ! DO_KILL )); then
  echo "(dry run — pass --kill to terminate)"
  exit 0
fi

echo "terminating…"
ALL=()
for row in "${ORPHANS[@]}"; do
  IFS=$'\t' read -r pid _ _ _ _ _ <<< "$row"
  # children first so nothing reparents to init and survives the sweep
  mapfile -t kids < <(descendants "$pid")
  for k in "${kids[@]}"; do ALL+=("$k"); done
  ALL+=("$pid")
done
for pid in "${ALL[@]}"; do kill -TERM "$pid" 2>/dev/null && echo "  TERM $pid"; done
sleep "$GRACE"
for pid in "${ALL[@]}"; do
  if kill -0 "$pid" 2>/dev/null; then kill -KILL "$pid" 2>/dev/null && echo "  KILL $pid (ignored TERM)"; fi
done
echo "done"
