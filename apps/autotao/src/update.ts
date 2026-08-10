import { chmod, mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises"
import { existsSync } from "node:fs"
import { basename, dirname, join } from "node:path"
import { homedir, tmpdir } from "node:os"
import pkg from "../package.json" with { type: "json" }

export const VERSION: string = pkg.version

/** owner/repo, derived from package.json so the release URL is declared once. */
export const REPOSITORY: string = (() => {
  const match = /github\.com[:/]([^/]+\/[^/.]+)/.exec(pkg.repository?.url ?? "")
  return match?.[1] ?? "agupta/autotao"
})()

const RELEASES_API = `https://api.github.com/repos/${REPOSITORY}/releases/latest`
const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000

/**
 * Compare two dotted versions. Returns >0 when `a` is newer, <0 when older, 0
 * when equal. A prerelease suffix (`1.2.0-rc.1`) sorts *before* its release, so
 * an -rc build never reports itself as newer than the final it precedes.
 */
export function compareVersions(a: string, b: string): number {
  const split = (v: string) => {
    const [core = "0", pre] = v.replace(/^v/, "").split("-", 2)
    return { nums: core.split(".").map((n) => Number.parseInt(n, 10) || 0), pre }
  }
  const left = split(a)
  const right = split(b)
  for (let i = 0; i < Math.max(left.nums.length, right.nums.length); i++) {
    const diff = (left.nums[i] ?? 0) - (right.nums[i] ?? 0)
    if (diff !== 0) return diff
  }
  if (left.pre && !right.pre) return -1
  if (!left.pre && right.pre) return 1
  if (left.pre && right.pre) return left.pre < right.pre ? -1 : left.pre > right.pre ? 1 : 0
  return 0
}

/** True when this libc is musl, which needs a different binary than glibc. */
export function isMusl(): boolean {
  if (process.platform !== "linux") return false
  const report = (process.report?.getReport?.() ?? {}) as { header?: { glibcVersionRuntime?: string } }
  if (report.header?.glibcVersionRuntime) return false
  return existsSync("/lib/ld-musl-x86_64.so.1") || existsSync("/lib/ld-musl-aarch64.so.1")
}

/**
 * Release asset name for this platform. This is a contract with
 * .github/workflows/release.yml — the names there and the names built here must
 * stay in step, or self-update 404s for everyone.
 */
export function resolveAssetName(
  platform: string = process.platform,
  arch: string = process.arch,
  musl: boolean = isMusl(),
): string | null {
  const os = platform === "darwin" ? "darwin" : platform === "linux" ? "linux" : null
  const cpu = arch === "x64" ? "x64" : arch === "arm64" ? "arm64" : null
  if (!os || !cpu) return null
  if (os === "linux" && musl) return `autotao-linux-${cpu}-musl`
  return `autotao-${os}-${cpu}`
}

/**
 * Where the running program lives, and whether it is a self-contained binary we
 * are allowed to replace. Running from source under Bun is a checkout, and a
 * checkout is updated with git — silently swapping a binary in would leave the
 * user with two divergent copies of the harness.
 */
export function runningBinary(): { path: string; replaceable: boolean } {
  const path = process.execPath
  const replaceable = !/^bun(\.exe)?$/.test(basename(path))
  return { path, replaceable }
}

interface UpdateCache {
  checkedAt: number
  latest: string | null
}

function cachePath(): string {
  const base = process.env.XDG_CACHE_HOME || join(homedir(), ".cache")
  return join(base, "autotao", "update-check.json")
}

async function readCache(): Promise<UpdateCache | null> {
  try {
    return JSON.parse(await readFile(cachePath(), "utf8")) as UpdateCache
  } catch {
    return null
  }
}

async function writeCache(cache: UpdateCache): Promise<void> {
  try {
    const path = cachePath()
    await mkdir(dirname(path), { recursive: true, mode: 0o700 })
    await writeFile(path, `${JSON.stringify(cache)}\n`, { encoding: "utf8", mode: 0o600 })
  } catch {
    // A cache we cannot write costs one extra network call per run. It is never
    // a reason to fail the command the user actually asked for.
  }
}

interface ReleaseAsset {
  name: string
  browser_download_url: string
}

interface Release {
  tag_name: string
  assets: ReleaseAsset[]
}

async function fetchLatestRelease(signal?: AbortSignal): Promise<Release> {
  const headers: Record<string, string> = {
    accept: "application/vnd.github+json",
    "user-agent": `autotao/${VERSION}`,
  }
  if (process.env.GITHUB_TOKEN) headers.authorization = `Bearer ${process.env.GITHUB_TOKEN}`
  const response = await fetch(RELEASES_API, { headers, signal })
  if (!response.ok) throw new Error(`GitHub returned ${response.status} for ${RELEASES_API}`)
  return (await response.json()) as Release
}

export interface UpdateStatus {
  current: string
  latest: string | null
  available: boolean
}

/**
 * Is there a newer release? Cached for a day, because this runs on dashboard
 * start and the answer changes far more slowly than the dashboard opens.
 * Network failure is reported as "no update known", never as an error: an
 * offline box must still be able to supervise its runs.
 */
export async function checkForUpdate(options: { force?: boolean } = {}): Promise<UpdateStatus> {
  const disabled = process.env.AUTOTAO_NO_UPDATE_CHECK === "1"
  if (disabled && !options.force) return { current: VERSION, latest: null, available: false }

  if (!options.force) {
    const cached = await readCache()
    if (cached && Date.now() - cached.checkedAt < CHECK_INTERVAL_MS) {
      return {
        current: VERSION,
        latest: cached.latest,
        available: cached.latest != null && compareVersions(cached.latest, VERSION) > 0,
      }
    }
  }

  let latest: string | null = null
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 5000)
    try {
      latest = (await fetchLatestRelease(controller.signal)).tag_name.replace(/^v/, "")
    } finally {
      clearTimeout(timer)
    }
  } catch {
    latest = null
  }

  await writeCache({ checkedAt: Date.now(), latest })
  return {
    current: VERSION,
    latest,
    available: latest != null && compareVersions(latest, VERSION) > 0,
  }
}

async function sha256(path: string): Promise<string> {
  const hasher = new Bun.CryptoHasher("sha256")
  hasher.update(await readFile(path))
  return hasher.digest("hex")
}

/** The expected checksum for `asset`, parsed out of a SHA256SUMS body. */
export function expectedChecksum(sumsBody: string, asset: string): string | null {
  for (const line of sumsBody.split("\n")) {
    const [hash, name] = line.trim().split(/\s+/)
    if (hash && name?.replace(/^\*/, "") === asset && /^[0-9a-f]{64}$/.test(hash)) return hash
  }
  return null
}

/**
 * Download the latest release and replace the running binary with it.
 *
 * The swap is a rename within the install directory, which is atomic and works
 * on a running executable: Linux refuses to write to a busy binary (ETXTBSY)
 * but is happy to have it unlinked out from under the running process. The
 * download lands beside the target rather than in /tmp so the rename never
 * crosses a filesystem boundary and degrades into a copy.
 */
export async function performUpdate(
  log: (message: string) => void = console.log,
): Promise<number> {
  const { path: binary, replaceable } = runningBinary()
  if (!replaceable) {
    log("This is a source checkout running under Bun, not a released binary.")
    log("Update it with git:")
    log("  git pull && (cd apps/autotao && bun install && bun run build)")
    return 1
  }

  const asset = resolveAssetName()
  if (!asset) {
    log(`No published binary for ${process.platform}/${process.arch}.`)
    log("Build from source: https://github.com/" + REPOSITORY + "#build-from-source")
    return 1
  }

  log(`Current version ${VERSION}; checking ${REPOSITORY}…`)
  const release = await fetchLatestRelease()
  const latest = release.tag_name.replace(/^v/, "")

  if (compareVersions(latest, VERSION) <= 0) {
    log(`Already up to date (${VERSION} is the latest release).`)
    return 0
  }

  const download = release.assets.find((candidate) => candidate.name === asset)
  const sums = release.assets.find((candidate) => candidate.name === "SHA256SUMS")
  if (!download) {
    log(`Release ${latest} publishes no asset named ${asset}.`)
    return 1
  }
  if (!sums) {
    log(`Release ${latest} publishes no SHA256SUMS; refusing to install an unverified binary.`)
    return 1
  }

  log(`Downloading ${asset} ${latest}…`)
  const directory = dirname(binary)
  const staged = join(directory, `.${basename(binary)}.${process.pid}.new`)

  try {
    const [payload, sumsBody] = await Promise.all([
      fetch(download.browser_download_url).then((r) => {
        if (!r.ok) throw new Error(`download failed: HTTP ${r.status}`)
        return r.arrayBuffer()
      }),
      fetch(sums.browser_download_url).then((r) => {
        if (!r.ok) throw new Error(`checksums failed: HTTP ${r.status}`)
        return r.text()
      }),
    ])

    await writeFile(staged, new Uint8Array(payload), { mode: 0o755 })

    const want = expectedChecksum(sumsBody, asset)
    if (!want) {
      await rm(staged, { force: true })
      log(`SHA256SUMS has no entry for ${asset}; refusing to install.`)
      return 1
    }
    const got = await sha256(staged)
    if (got !== want) {
      await rm(staged, { force: true })
      log("Checksum mismatch — the download does not match the published release.")
      log(`  expected ${want}`)
      log(`  got      ${got}`)
      return 1
    }

    // Verify the new binary actually runs before it becomes the only copy.
    const probe = Bun.spawnSync([staged, "--version"])
    const reported = new TextDecoder().decode(probe.stdout).trim()
    if (probe.exitCode !== 0 || reported !== latest) {
      await rm(staged, { force: true })
      log(`The downloaded binary did not start cleanly (exit ${probe.exitCode}, reported "${reported}").`)
      log("Your existing installation is untouched.")
      return 1
    }

    await chmod(staged, 0o755)
    await rename(staged, binary)
    log(`Updated ${VERSION} → ${latest}.`)
    log(`  ${binary}`)
    return 0
  } catch (error) {
    await rm(staged, { force: true }).catch(() => {})
    const message = error instanceof Error ? error.message : String(error)
    log(`Update failed: ${message}`)
    if (message.includes("EACCES") || message.includes("EPERM")) {
      try {
        const owner = (await stat(directory)).uid
        if (owner !== process.getuid?.()) {
          log(`  ${directory} is not writable by you — reinstall with the install script instead.`)
        }
      } catch {
        // Diagnosis is best-effort; the failure above is what matters.
      }
    }
    log("Your existing installation is untouched.")
    return 1
  }
}

/** One short line for the dashboard, or null when nothing is worth saying. */
export function updateNotice(status: UpdateStatus): string | null {
  if (!status.available || !status.latest) return null
  return `autotao ${status.latest} is available (running ${status.current}) — run \`autotao update\``
}

export { tmpdir }
