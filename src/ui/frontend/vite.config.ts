import { existsSync, readFileSync } from "node:fs"
import { join, resolve } from "node:path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig, type Plugin } from "vite"

const root = import.meta.dirname

// Ces paquets arrivent dans le CSS, pas dans le graphe des modules JS.
const CSS_PACKAGES = ["@fontsource-variable/geist", "tailwindcss", "tw-animate-css", "shadcn"]

/** Regroupe les licences de ce qui est réellement livré, comme l'exigent MIT, ISC et OFL. */
function thirdPartyLicenses(): Plugin {
  return {
    name: "third-party-licenses",
    apply: "build",
    generateBundle(_options, bundle) {
      const packages = new Set(CSS_PACKAGES)
      for (const output of Object.values(bundle)) {
        if (output.type !== "chunk") continue
        for (const id of output.moduleIds) {
          const match = id.match(/node_modules\/((?:@[^/]+\/)?[^/]+)\//g)?.pop()
          if (match) packages.add(match.replace("node_modules/", "").replace(/\/$/, ""))
        }
      }
      const sections = [...packages].sort().map((name) => {
        const directory = join(root, "node_modules", name)
        const { version, license } = JSON.parse(readFileSync(join(directory, "package.json"), "utf8"))
        const file = ["LICENSE", "LICENSE.md", "LICENSE.txt", "LICENCE"].map((f) => join(directory, f)).find(existsSync)
        const text = file ? readFileSync(file, "utf8").trim() : `Licence déclarée : ${license}`
        return `${name} ${version} (${license})\n\n${text}`
      })
      this.emitFile({ type: "asset", fileName: "THIRD_PARTY_LICENSES.txt", source: sections.join(`\n\n${"-".repeat(72)}\n\n`) + "\n" })
    },
  }
}

export default defineConfig(({ command }) => ({
  base: command === "build" ? "/ui/static/" : "/ui/",
  plugins: [react(), tailwindcss(), thirdPartyLicenses()],
  resolve: { alias: { "@": resolve(root, "./src") } },
  build: { outDir: "../static/bundle", emptyOutDir: true, assetsInlineLimit: 0 },
  server: {
    proxy: { "/ui/api": "http://localhost:8080", "/api": "http://localhost:8080", "/images": "http://localhost:8080" },
  },
}))
