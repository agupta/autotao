#!/usr/bin/env bash
# Userland portability shims: GNU/Linux and BSD/macOS.
#
# Sourced, never executed. Every function here exists because a call site used a
# tool that only one of the two userlands ships. The rule is that the *call site*
# stays readable — no inline `if Darwin` branches scattered through the harness —
# and the divergence lives here, named for what it computes rather than for the
# command it happens to use.
#
#   source "$(dirname "$0")/portable.sh"
#
# Bash 4+ is a hard requirement (the harness uses `mapfile`). macOS ships bash
# 3.2 as /bin/bash for licensing reasons, so `at_require_bash` prints the exact
# remedy rather than letting a script die on a syntax error 200 lines in.

AT_OS="$(uname -s)"

# --- interpreter ------------------------------------------------------------

# 4.4, not 4.0: the harness runs under `set -u` and expands possibly-empty
# arrays (AT_SETSID, AT_TIMEOUT) at command position. Before 4.4 that is an
# unbound-variable error rather than an empty expansion, which would surface as
# a baffling failure inside a launch rather than a clear message here.
at_require_bash(){
  if (( BASH_VERSINFO[0] < 4 || (BASH_VERSINFO[0] == 4 && BASH_VERSINFO[1] < 4) )); then
    printf 'autotao requires bash 4.4 or newer (running %s).\n' "${BASH_VERSION}" >&2
    if [[ "$AT_OS" == "Darwin" ]]; then
      printf '  macOS ships bash 3.2 as /bin/bash. Install a current one:\n' >&2
      printf '    brew install bash\n' >&2
      printf '  then make sure it precedes /bin in PATH.\n' >&2
    fi
    return 1
  fi
}

# --- memory -----------------------------------------------------------------

# Available memory in MB — memory a new process can take without forcing the
# kernel to swap. On Linux this is MemAvailable (free's 7th column), which
# already accounts for reclaimable cache. macOS has no single equivalent, so we
# sum the page classes the VM will hand over without pressure: free, inactive,
# speculative, and purgeable.
at_avail_mem_mb(){
  if [[ "$AT_OS" == "Darwin" ]]; then
    vm_stat | awk '
      /page size of/            { for (i=1;i<=NF;i++) if ($i+0>1000) { ps=$i+0; break } }
      /Pages free/              { free=$3+0 }
      /Pages inactive/          { inact=$3+0 }
      /Pages speculative/       { spec=$3+0 }
      /Pages purgeable/         { purge=$3+0 }
      END { if (!ps) ps=4096; printf "%d", (free+inact+spec+purge)*ps/1048576 }'
  else
    free -m | awk '/^Mem:/{print $7}'
  fi
}

# --- file metadata ----------------------------------------------------------

at_file_mtime(){  # epoch seconds, 0 if absent
  if [[ "$AT_OS" == "Darwin" ]]; then stat -f %m "$1" 2>/dev/null || echo 0
  else                                stat -c %Y "$1" 2>/dev/null || echo 0; fi
}

at_file_size(){   # bytes, 0 if absent
  if [[ "$AT_OS" == "Darwin" ]]; then stat -f %z "$1" 2>/dev/null || echo 0
  else                                stat -c %s "$1" 2>/dev/null || echo 0; fi
}

# Lowercase hex sha256 of a file, bare (no filename column).
at_sha256(){
  if command -v sha256sum >/dev/null 2>&1; then sha256sum "$1" | awk '{print $1}'
  elif command -v shasum   >/dev/null 2>&1; then shasum -a 256 "$1" | awk '{print $1}'
  else echo "no sha256 tool (need sha256sum or shasum)" >&2; return 1; fi
}

# --- dates ------------------------------------------------------------------

# UTC clock time N minutes from now, e.g. "16:45 UTC". Used to tell a run its
# own wall-clock deadline; falls back to a relative phrase if neither date
# dialect is understood, because a wrong absolute time is worse than none.
at_deadline_utc(){
  local min="$1"
  date -u -d "+${min} minutes" '+%H:%M UTC' 2>/dev/null \
    || date -u -v "+${min}M" '+%H:%M UTC' 2>/dev/null \
    || echo "start + ${min}m"
}

# --- processes --------------------------------------------------------------

# setsid detaches a run into its own session so parent-side job control and tool
# timeouts cannot reach it. macOS has no setsid; the run still detaches via the
# background `&` and nohup semantics at the call site, it just shares a session.
AT_SETSID=()
command -v setsid >/dev/null 2>&1 && AT_SETSID=(setsid)

# GNU coreutils `timeout`, or Homebrew's g-prefixed one. Empty array when
# neither exists, so `"${AT_TIMEOUT[@]}" cmd` degrades to an uncapped run — the
# caller must decide whether that is acceptable (at_require_timeout asserts it).
AT_TIMEOUT=()
if   command -v timeout  >/dev/null 2>&1; then AT_TIMEOUT=(timeout)
elif command -v gtimeout >/dev/null 2>&1; then AT_TIMEOUT=(gtimeout); fi

at_require_timeout(){
  if (( ${#AT_TIMEOUT[@]} == 0 )); then
    printf 'autotao needs `timeout` to wall-cap runs; none found.\n' >&2
    [[ "$AT_OS" == "Darwin" ]] && printf '    brew install coreutils\n' >&2
    return 1
  fi
}

# The working directory of a pid, empty if unknowable (another user's process,
# or a macOS box where lsof declines).
at_proc_cwd(){
  if [[ "$AT_OS" == "Darwin" ]]; then
    lsof -a -p "$1" -d cwd -Fn 2>/dev/null | sed -n 's/^n//p' | head -1
  else
    readlink -f "/proc/$1/cwd" 2>/dev/null
  fi
}

# Value of one environment variable as seen by a *running* pid. This is how the
# reaper tells pipeline-spawned compute from work you started by hand, so it
# must read the process's own environment and never a heuristic.
#
# Linux reads /proc/<pid>/environ (NUL-separated). macOS has no procfs but `ps
# -E` appends the environment to the command column, which works for processes
# owned by the caller — exactly the scope the reaper wants.
at_proc_env(){
  local pid="$1" var="$2"
  if [[ "$AT_OS" == "Darwin" ]]; then
    ps -Eww -o command= -p "$pid" 2>/dev/null \
      | tr ' ' '\n' | sed -n "s/^${var}=//p" | head -1
  else
    # Another user's process gives EACCES on open, which is a "not ours, skip"
    # answer rather than an error. The braces put the redirection itself inside
    # the suppressed scope — `< file 2>/dev/null` does not, because bash reports
    # a failed redirect on the shell's own stderr before the command ever runs.
    { tr '\0' '\n' < "/proc/$pid/environ"; } 2>/dev/null | sed -n "s/^${var}=//p" | head -1
  fi
}

# One line per process: pid ppid elapsed-seconds pcpu args
# BSD ps has no `etimes`, only the formatted `etime` ([[dd-]hh:]mm:ss), so we
# normalize it to seconds here and every caller gets an integer either way.
at_ps_all(){
  if [[ "$AT_OS" == "Darwin" ]]; then
    ps -eo pid=,ppid=,etime=,pcpu=,args= 2>/dev/null | awk '{
      split($3, a, "-"); if (length(a) == 2) { d = a[1]; hms = a[2] } else { d = 0; hms = a[1] }
      n = split(hms, t, ":")
      s = (n == 3) ? t[1]*3600 + t[2]*60 + t[3] : t[1]*60 + t[2]
      $3 = d*86400 + s
      print
    }'
  else
    ps -eo pid=,ppid=,etimes=,pcpu=,args= 2>/dev/null
  fi
}

# --- single-instance lock ---------------------------------------------------

# Take a non-blocking single-instance lock, or return 1 if another live holder
# has it. Releases on exit via a trap.
#
# macOS ships no flock(1), so this is mkdir-based: mkdir is atomic on every
# filesystem the harness cares about. The PID file inside is what makes a lock
# left behind by a killed process recoverable — a bare mkdir lock deadlocks
# forever against its own corpse, which is exactly the failure this harness
# already hit once (2026-07-26) and must not reintroduce.
at_lock(){
  local dir="$1" holder
  if mkdir "$dir" 2>/dev/null; then
    echo $$ > "$dir/pid"
    trap 'rm -rf "'"$dir"'"' EXIT
    return 0
  fi
  holder=$(cat "$dir/pid" 2>/dev/null || echo "")
  if [[ -n "$holder" ]] && kill -0 "$holder" 2>/dev/null; then
    return 1                                   # genuinely held
  fi
  # Stale: the holder is gone. Reclaim, then re-race — a concurrent reclaimer
  # may beat us to it, and losing that race means the lock is held, not stale.
  rm -rf "$dir"
  if mkdir "$dir" 2>/dev/null; then
    echo $$ > "$dir/pid"
    trap 'rm -rf "'"$dir"'"' EXIT
    return 0
  fi
  return 1
}

# `ps` restricted to a set of pids, given as separate arguments. Replaces
# `... | xargs -r ps -p`: BSD xargs has no -r, so an empty pid list would run
# `ps` unrestricted and report every process on the box.
at_ps_pids(){
  local fmt="$1"; shift
  (( $# )) || return 0
  local IFS=,
  ps -o "$fmt" -p "$*" 2>/dev/null
}
