import { afterEach, describe, expect, test } from "bun:test"
import { mkdtempSync, mkdirSync, readdirSync, rmSync, utimesSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { isExtractedLibrary, pruneExtractedLibraries } from "../src/tmp-prune.ts"

const HOUR = 60 * 60 * 1000
let workspace: string | undefined

function directory(): string {
  workspace = mkdtempSync(join(tmpdir(), "autotao-prune-"))
  return workspace
}

function write(dir: string, name: string, ageMs: number, size = 16): string {
  const path = join(dir, name)
  writeFileSync(path, "x".repeat(size))
  const when = new Date(Date.now() - ageMs)
  utimesSync(path, when, when)
  return path
}

afterEach(() => {
  if (workspace) rmSync(workspace, { recursive: true, force: true })
  workspace = undefined
})

describe("isExtractedLibrary", () => {
  test("matches the names Bun actually produces", () => {
    expect(isExtractedLibrary(".1cca7ffffffbfaff-00000000.so")).toBe(true)
    expect(isExtractedLibrary(".1cca6bffffebfafc-00000000.dylib")).toBe(true)
  })

  // This predicate decides what gets deleted, so the negative cases matter far
  // more than the positive one.
  test("does not match a library someone put there deliberately", () => {
    expect(isExtractedLibrary("libopentui.so")).toBe(false)
    expect(isExtractedLibrary(".libopentui.so")).toBe(false)
    expect(isExtractedLibrary("libfoo-00000000.so")).toBe(false) // no leading dot
    expect(isExtractedLibrary(".1cca7ffffffbfaff-00000000.txt")).toBe(false)
    expect(isExtractedLibrary(".zzzzzzzzzzzzzzzz-00000000.so")).toBe(false) // not hex
    expect(isExtractedLibrary(".1cca-00000000.so")).toBe(false) // prefix too short
    expect(isExtractedLibrary(".1cca7ffffffbfaff.so")).toBe(false) // no suffix part
    expect(isExtractedLibrary("")).toBe(false)
  })

  test("does not match a path, only a bare filename", () => {
    expect(isExtractedLibrary("/tmp/.1cca7ffffffbfaff-00000000.so")).toBe(false)
  })
})

describe("pruneExtractedLibraries", () => {
  test("removes stale extractions and reports what it reclaimed", () => {
    const dir = directory()
    write(dir, ".1cca7ffffffbfaff-00000000.so", 3 * HOUR, 100)
    write(dir, ".1cca6bffffebfafc-00000000.dylib", 5 * HOUR, 50)

    const result = pruneExtractedLibraries({ directory: dir, olderThanMs: HOUR })

    expect(result.removed).toBe(2)
    expect(result.bytes).toBe(150)
    expect(readdirSync(dir)).toHaveLength(0)
  })

  // The extraction belonging to the process doing the pruning is seconds old.
  // Deleting it, or a sibling instance's, is the one genuinely damaging mistake
  // this function could make.
  test("leaves recent extractions alone", () => {
    const dir = directory()
    write(dir, ".1cca7ffffffbfaff-00000000.so", 5_000)

    const result = pruneExtractedLibraries({ directory: dir, olderThanMs: HOUR })

    expect(result.removed).toBe(0)
    expect(readdirSync(dir)).toHaveLength(1)
  })

  test("never touches files that are not extracted libraries", () => {
    const dir = directory()
    write(dir, "libopentui.so", 10 * HOUR)
    write(dir, "important.txt", 10 * HOUR)
    write(dir, ".hidden-notes", 10 * HOUR)

    const result = pruneExtractedLibraries({ directory: dir, olderThanMs: HOUR })

    expect(result.removed).toBe(0)
    expect(readdirSync(dir).sort()).toEqual([".hidden-notes", "important.txt", "libopentui.so"])
  })

  test("skips directories that merely look like extractions", () => {
    const dir = directory()
    mkdirSync(join(dir, ".1cca7ffffffbfaff-00000000.so"))

    const result = pruneExtractedLibraries({ directory: dir, olderThanMs: 0 })

    expect(result.removed).toBe(0)
    expect(readdirSync(dir)).toHaveLength(1)
  })

  test("is silent about a directory it cannot read", () => {
    const result = pruneExtractedLibraries({ directory: join(tmpdir(), "autotao-does-not-exist-9d3f") })
    expect(result).toEqual({ removed: 0, bytes: 0 })
  })

  test("declines to sweep an implausibly large directory", () => {
    const dir = directory()
    for (let i = 0; i < 5_001; i++) writeFileSync(join(dir, `f${i}`), "")
    write(dir, ".1cca7ffffffbfaff-00000000.so", 10 * HOUR)

    // Startup latency wins over tidiness on a busy shared /tmp.
    expect(pruneExtractedLibraries({ directory: dir, olderThanMs: HOUR }).removed).toBe(0)
  })
})
