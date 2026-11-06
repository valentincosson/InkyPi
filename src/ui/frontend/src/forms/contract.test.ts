/// <reference types="node" />
import { existsSync, readFileSync, readdirSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { definitions } from "./definitions"
import { allFields, initialValues, sentNames, toEntries } from "./engine"
import { hasForm, PLUGIN_META } from "./registry"

const ROOT = join(import.meta.dirname, "..", "..", "..", "..", "..")
const SNAPSHOTS = join(ROOT, "tests", "snapshots")
const params = JSON.parse(readFileSync(join(SNAPSHOTS, "plugin_params.json"), "utf8")) as Record<string, Record<string, unknown>>
const plugins = readdirSync(join(SNAPSHOTS, "plugin_forms")).map((name) => name.replace(".json", ""))

type Snapshot = { defaults: [string, string][]; stored_settings: Record<string, unknown> }
const snapshot = (id: string) => JSON.parse(readFileSync(join(SNAPSHOTS, "plugin_forms", `${id}.json`), "utf8")) as Snapshot

/** Ce qu'un champ de fichier vide produisait dans la capture ne correspond à aucune donnée. */
function withoutEmptyFiles(settings: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(settings)
      .map(([name, value]): [string, unknown] => [name, Array.isArray(value) ? value.filter((item) => item !== "file:") : value])
      .filter(([, value]) => value !== "file:" && !(Array.isArray(value) && value.length === 0)),
  )
}

/** Reproduit `parse_form` : la première valeur gagne, sauf pour les noms en `[]`. */
function parseForm(entries: [string, unknown][]) {
  const settings: Record<string, unknown> = {}
  for (const [name, value] of entries) {
    if (name === "plugin_id") continue
    if (name.endsWith("[]")) settings[name] = [...((settings[name] as unknown[]) ?? []), value]
    else if (!(name in settings)) settings[name] = value
  }
  return settings
}

// Différences voulues avec l'ancien formulaire, à la création.
const NEW_DEFAULTS: Record<string, Record<string, unknown>> = {
  // L'ancien préremplissait la date du jour, ce qui figeait l'image d'une entrée de playlist. Vide, le plugin prend la dernière.
  apod: { customDate: "" },
}

describe.each(plugins)("%s", (id) => {
  const definition = definitions[id]
  const plugin = params[id]

  it("has a description", () => {
    expect(definition).toBeDefined()
  })

  it("sends back stored settings unchanged", () => {
    const stored = withoutEmptyFiles(snapshot(id).stored_settings)
    const sent = parseForm(toEntries(definition, initialValues(definition, plugin, stored), plugin))
    expect(sent).toEqual(stored)
  })

  it("starts with the same defaults as the old form", () => {
    const old = withoutEmptyFiles(parseForm(snapshot(id).defaults))
    const sent = parseForm(toEntries(definition, initialValues(definition, plugin), plugin))
    expect(sent).toEqual({ ...old, ...NEW_DEFAULTS[id] })
  })

  it("describes every field of its settings.html", () => {
    const path = join(ROOT, "src", "plugins", id, "settings.html")
    if (!existsSync(path)) return
    const html = readFileSync(path, "utf8")
    const names = [...html.matchAll(/\bname\s*=\s*"([^"{]+)"/g), ...html.matchAll(/\.name\s*=\s*'([^']+)'/g)].map((match) => match[1])
    const described = new Set(allFields(definition, plugin).flatMap(sentNames))
    expect(names.filter((name) => !described.has(name))).toEqual([])
  })
})

describe("descriptions", () => {
  it("covers exactly the installed plugins", () => {
    expect(Object.keys(definitions).sort()).toEqual([...plugins].sort())
  })

  it("matches the light catalogue data", () => {
    expect(Object.keys(PLUGIN_META).sort()).toEqual(Object.keys(definitions).sort())
    expect(hasForm("constructor")).toBe(false)
  })

  it("flags the plugins that always need a key", () => {
    // Weather reste utilisable sans clé avec Open-Meteo : le catalogue ne le signale pas.
    const always = Object.entries(definitions).filter(([id, definition]) => definition.apiKey && id !== "weather").map(([id]) => id).sort()
    const flagged = Object.entries(PLUGIN_META).filter(([, meta]) => meta.needsKey).map(([id]) => id).sort()
    expect(flagged).toEqual(always)
  })

})
