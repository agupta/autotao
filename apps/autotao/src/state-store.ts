import { mkdir, readFile, rename, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { SNAPSHOT_SCHEMA_VERSION, type AutoTaoState, type ProjectSnapshot } from "./protocol.ts"

export class LocalStateStore {
  readonly directory: string
  readonly path: string

  constructor(root: string) {
    this.directory = join(root, ".autotao")
    this.path = join(this.directory, "state.json")
  }

  async read(): Promise<AutoTaoState | null> {
    try {
      return JSON.parse(await readFile(this.path, "utf8")) as AutoTaoState
    } catch {
      return null
    }
  }

  private async write(state: AutoTaoState): Promise<void> {
    await mkdir(this.directory, { recursive: true, mode: 0o700 })
    const temporary = join(this.directory, `.state.${process.pid}.${Date.now()}.tmp`)
    await writeFile(temporary, `${JSON.stringify(state, null, 2)}\n`, { encoding: "utf8", mode: 0o600 })
    await rename(temporary, this.path)
  }

  async updateSnapshot(snapshot: ProjectSnapshot): Promise<AutoTaoState> {
    const state: AutoTaoState = {
      schemaVersion: SNAPSHOT_SCHEMA_VERSION,
      updatedAt: new Date().toISOString(),
      snapshot,
    }
    await this.write(state)
    return state
  }
}
