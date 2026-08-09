import solidPlugin from "@opentui/solid/bun-plugin"
import { mkdir } from "node:fs/promises"
import { join, resolve } from "node:path"

const appRoot = resolve(import.meta.dir, "..")
const bunPlatform = process.platform === "win32" ? "windows" : process.platform
const target = process.env.AUTOTAO_BUILD_TARGET ?? `bun-${bunPlatform}-${process.arch}`
const libc = process.env.AUTOTAO_LIBC ?? "glibc"
const output = process.env.AUTOTAO_BUILD_OUTPUT ?? join(appRoot, "dist", process.platform === "win32" ? "autotao.exe" : "autotao")

await mkdir(join(appRoot, "dist"), { recursive: true })
const result = await Bun.build({
  entrypoints: [join(appRoot, "src/index.tsx")],
  target: "bun",
  minify: true,
  sourcemap: "none",
  plugins: [solidPlugin],
  define: {
    "process.env.OPENTUI_LIBC": JSON.stringify(libc),
  },
  compile: {
    target: target as any,
    outfile: output,
  },
})

if (!result.success) {
  for (const log of result.logs) console.error(log)
  process.exit(1)
}
console.log(`Built ${output} for ${target} (${libc})`)
