// Prépare le bundle versionné : fichiers compressés pour le Pi, et empreinte des sources
// qu'un test Python compare pour détecter un bundle oublié.
import { createHash } from "node:crypto"
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs"
import { join, relative, sep } from "node:path"
import { gzipSync } from "node:zlib"

const root = join(import.meta.dirname, "..")
const bundle = join(root, "..", "static", "bundle")

function files(directory) {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name)
    return statSync(path).isDirectory() ? files(path) : [path]
  })
}

for (const path of files(bundle)) {
  if (/\.(js|css)$/.test(path)) writeFileSync(`${path}.gz`, gzipSync(readFileSync(path), { level: 9 }))
}

const visible = (path) => !path.split(sep).pop().startsWith(".")
const sources = [
  ...["index.html", "package.json", "package-lock.json", "tsconfig.json", "tsconfig.app.json", "tsconfig.node.json", "vite.config.ts"].map((name) => join(root, name)),
  ...files(join(root, "scripts")).filter(visible),
  ...files(join(root, "src")).filter(visible),
]
const toPosix = (path) => relative(root, path).split(sep).join("/")
const hash = createHash("sha256")
for (const path of sources.sort((a, b) => (toPosix(a) < toPosix(b) ? -1 : 1))) {
  hash.update(toPosix(path)).update("\0").update(readFileSync(path)).update("\0")
}
writeFileSync(join(bundle, "source-hash.txt"), `${hash.digest("hex")}\n`)
