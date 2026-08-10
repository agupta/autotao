import { readdirSync, statSync, unlinkSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"

/**
 * Remove native libraries that earlier runs left behind in the temp directory.
 *
 * OpenTUI reaches its Zig core through `dlopen`, which needs a real filesystem
 * path. In a `bun build --compile` binary that library is embedded, so Bun
 * extracts it to $TMPDIR on startup — under a fresh name every time, and it
 * never removes it. One 19 MB file per invocation, forever.
 *
 * Running from source does not do this (it dlopens the copy in node_modules),
 * which is why it only shows up in released binaries and never in CI, where the
 * machine is discarded after the job. It matters here more than it would for a
 * typical CLI: the whole premise is an unattended iteration every few hours,
 * indefinitely, and on most Linux boxes /tmp is a tmpfs sharing RAM with the
 * runs themselves.
 *
 * Unlinking is safe even for a file another live process has mapped: POSIX
 * keeps the inode alive until the last reference closes, so a running console
 * keeps working and only the directory entry goes away.
 */

/** Bun's extracted-embedded-file name: `.<hex>-<hex>.so` / `.dylib`. */
const EXTRACTED = /^\.[0-9a-f]{8,24}-[0-9a-f]{8}\.(so|dylib)$/

/**
 * Deliberately strict, because this decides what gets deleted. It must not
 * match a real library someone put in /tmp on purpose — those have names, and
 * these do not.
 */
export function isExtractedLibrary(name: string): boolean {
  return EXTRACTED.test(name)
}

export interface PruneResult {
  removed: number
  bytes: number
}

/**
 * Best-effort, synchronous, and silent. Synchronous because the leaky callers
 * are the short ones — a cron `autotao snapshot --json` exits before any
 * promise scheduled at startup would resolve, and those are exactly the
 * invocations that accumulate.
 *
 * @param olderThanMs leave recent files alone; the current process's own
 *   extraction is seconds old and must survive, and so must a sibling autotao
 *   that started moments ago.
 */
export function pruneExtractedLibraries(options: {
  directory?: string
  olderThanMs?: number
  now?: number
} = {}): PruneResult {
  const directory = options.directory ?? tmpdir()
  const olderThanMs = options.olderThanMs ?? 60 * 60 * 1000
  const now = options.now ?? Date.now()
  const result: PruneResult = { removed: 0, bytes: 0 }

  let entries: string[]
  try {
    entries = readdirSync(directory)
  } catch {
    return result
  }

  // A shared /tmp on a busy box can hold a great many entries, and this runs on
  // every startup. Cleaning is never worth delaying the dashboard for.
  if (entries.length > 5_000) return result

  const uid = process.getuid?.()
  for (const name of entries) {
    if (!isExtractedLibrary(name)) continue
    const path = join(directory, name)
    try {
      const info = statSync(path)
      if (!info.isFile()) continue
      if (uid != null && info.uid !== uid) continue // someone else's; not ours to remove
      if (now - info.mtimeMs < olderThanMs) continue
      unlinkSync(path)
      result.removed++
      result.bytes += info.size
    } catch {
      // Raced with another instance, or not ours to delete. Either way the next
      // startup will try again; there is nothing here worth reporting.
    }
  }
  return result
}
