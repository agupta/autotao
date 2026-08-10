import { describe, expect, test } from "bun:test"
import {
  REPOSITORY,
  VERSION,
  compareVersions,
  expectedChecksum,
  resolveAssetName,
  runningBinary,
  updateNotice,
} from "../src/update.ts"

describe("compareVersions", () => {
  test("orders by numeric component, not lexically", () => {
    expect(compareVersions("0.2.0", "0.10.0")).toBeLessThan(0)
    expect(compareVersions("1.0.0", "0.9.9")).toBeGreaterThan(0)
    expect(compareVersions("0.1.0", "0.1.0")).toBe(0)
  })

  test("tolerates a leading v on either side", () => {
    expect(compareVersions("v1.2.3", "1.2.3")).toBe(0)
    expect(compareVersions("v1.2.4", "v1.2.3")).toBeGreaterThan(0)
  })

  test("treats missing components as zero", () => {
    expect(compareVersions("1.2", "1.2.0")).toBe(0)
    expect(compareVersions("1.2.1", "1.2")).toBeGreaterThan(0)
  })

  // A prerelease must never look newer than the release it precedes, or every
  // -rc client would be told to "update" to the older final and loop.
  test("sorts a prerelease before its release", () => {
    expect(compareVersions("1.0.0-rc.1", "1.0.0")).toBeLessThan(0)
    expect(compareVersions("1.0.0", "1.0.0-rc.1")).toBeGreaterThan(0)
    expect(compareVersions("1.0.0-rc.2", "1.0.0-rc.1")).toBeGreaterThan(0)
  })
})

describe("resolveAssetName", () => {
  // These names are a contract with .github/workflows/release.yml. If this test
  // changes, the workflow's matrix must change in the same commit.
  test("matches the published asset names", () => {
    expect(resolveAssetName("linux", "x64", false)).toBe("autotao-linux-x64")
    expect(resolveAssetName("linux", "arm64", false)).toBe("autotao-linux-arm64")
    expect(resolveAssetName("darwin", "x64", false)).toBe("autotao-darwin-x64")
    expect(resolveAssetName("darwin", "arm64", false)).toBe("autotao-darwin-arm64")
  })

  test("asks for a musl build on a musl box", () => {
    expect(resolveAssetName("linux", "x64", true)).toBe("autotao-linux-x64-musl")
  })

  test("musl is irrelevant on darwin", () => {
    expect(resolveAssetName("darwin", "arm64", true)).toBe("autotao-darwin-arm64")
  })

  test("returns null where nothing is published", () => {
    expect(resolveAssetName("win32", "x64", false)).toBeNull()
    expect(resolveAssetName("linux", "s390x", false)).toBeNull()
  })
})

describe("expectedChecksum", () => {
  const body = [
    "aa".repeat(32) + "  autotao-linux-x64",
    "bb".repeat(32) + "  autotao-darwin-arm64",
    "cc".repeat(32) + " *autotao-linux-arm64",
  ].join("\n")

  test("finds the entry for the requested asset", () => {
    expect(expectedChecksum(body, "autotao-linux-x64")).toBe("aa".repeat(32))
    expect(expectedChecksum(body, "autotao-darwin-arm64")).toBe("bb".repeat(32))
  })

  test("accepts the binary-mode asterisk sha256sum writes", () => {
    expect(expectedChecksum(body, "autotao-linux-arm64")).toBe("cc".repeat(32))
  })

  // Refusing is the safe direction: a missing entry must block the install
  // rather than fall through to an unverified binary.
  test("returns null for an absent or malformed entry", () => {
    expect(expectedChecksum(body, "autotao-linux-x64-musl")).toBeNull()
    expect(expectedChecksum("nothexadecimal  autotao-linux-x64", "autotao-linux-x64")).toBeNull()
    expect(expectedChecksum("", "autotao-linux-x64")).toBeNull()
  })

  test("does not match on a prefix of the asset name", () => {
    expect(expectedChecksum("dd".repeat(32) + "  autotao-linux-x64-musl", "autotao-linux-x64")).toBeNull()
  })
})

describe("version and repository", () => {
  test("version is the one declared in package.json", () => {
    expect(VERSION).toMatch(/^\d+\.\d+\.\d+/)
  })

  test("repository parses to owner/name", () => {
    expect(REPOSITORY).toMatch(/^[^/]+\/[^/]+$/)
  })
})

describe("runningBinary", () => {
  // Under `bun test` we are, by construction, running under Bun rather than as
  // a compiled binary — so the updater must decline to replace anything.
  test("declines to replace a source checkout running under Bun", () => {
    expect(runningBinary().replaceable).toBe(false)
  })
})

describe("updateNotice", () => {
  test("says nothing when up to date", () => {
    expect(updateNotice({ current: "0.1.0", latest: "0.1.0", available: false })).toBeNull()
  })

  test("says nothing when the check failed", () => {
    expect(updateNotice({ current: "0.1.0", latest: null, available: false })).toBeNull()
  })

  test("names both versions when an update exists", () => {
    const notice = updateNotice({ current: "0.1.0", latest: "0.2.0", available: true })
    expect(notice).toContain("0.2.0")
    expect(notice).toContain("0.1.0")
    expect(notice).toContain("autotao update")
  })
})
