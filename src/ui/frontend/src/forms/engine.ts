import type { Condition, Definition, Errors, Field, FileValue, FormValues, LeafField, Params, Row, Section, Sent, Value } from "./types"
import { styleSection } from "./definitions"

/** Réglages que l'interface ne décrit pas : ils repartent tels quels pour ne rien perdre. */
export const EXTRA = "$extra"

export function fieldId(name: string) {
  return `field-${name.replace(/[^\w-]/g, "")}`
}

export function rowFieldId(group: string, index: number, column: string) {
  return fieldId(`${group}-${index}-${column}`)
}

export function sectionsOf(definition: Definition, params: Params): Section[] {
  return params.style_settings ? [...definition.sections, styleSection(params)] : definition.sections
}

function leaves(fields: Field[]): LeafField[] {
  return fields.flatMap((field) => {
    if (field.kind === "more") return leaves(field.fields)
    if (field.kind === "contrast") return []
    return field.kind === "switch" && field.fields ? [field, ...leaves(field.fields)] : [field]
  })
}

export function allFields(definition: Definition, params: Params) {
  return sectionsOf(definition, params).flatMap((section) => leaves(section.fields))
}

/** Les noms de champs que la description sait relire et renvoyer. */
export function sentNames(field: LeafField): string[] {
  if (field.kind === "rows") return field.columns.map((column) => column.name)
  if (field.kind === "custom") return Object.keys(field.names)
  return [field.name]
}

function text(value: unknown, fallback = "") {
  if (value === undefined || value === null) return fallback
  return Array.isArray(value) ? String(value[0] ?? fallback) : String(value)
}

function list(value: unknown): string[] {
  if (value === undefined || value === null || value === "") return []
  return Array.isArray(value) ? value.map(String) : [String(value)]
}

export function choices(field: Extract<LeafField, { kind: "select" | "segmented" }>, params: Params) {
  return typeof field.options === "function" ? field.options(params) : field.options
}

function emptyRow(field: Extract<LeafField, { kind: "rows" }>): Row {
  return Object.fromEntries(field.columns.map((column) => [column.name, column.default ?? ""]))
}

export function newRow(field: Extract<LeafField, { kind: "rows" }>) {
  return emptyRow(field)
}

function initialValue(field: LeafField, params: Params, stored: Record<string, unknown> | null): Value | Record<string, string> {
  const saved = stored?.[field.name]
  switch (field.kind) {
    case "switch": {
      const on = field.on ?? "true"
      if (!stored) return field.default
      // Sans valeur « éteint » propre, un interrupteur éteint n'est simplement pas enregistré.
      if (field.off !== undefined && !(field.name in stored)) return field.default
      return saved === on
    }
    case "select":
    case "segmented":
      return text(saved, (stored ? field.storedDefault : undefined) ?? field.default ?? choices(field, params)[0]?.value ?? "")
    case "pictures":
      return text(saved, field.choices(params)[0]?.value ?? "")
    case "colors": {
      const colors = list(saved)
      return field.default.map((color, index) => colors[index] ?? color)
    }
    case "rows": {
      const columns = field.columns.map((column) => list(stored?.[column.name]))
      const rows = Array.from({ length: Math.max(...columns.map((values) => values.length), 0) }, (_, index) =>
        Object.fromEntries(field.columns.map((column, position) => [column.name, columns[position][index] ?? column.default ?? ""])),
      )
      return rows.length ? rows : [emptyRow(field)]
    }
    case "files":
      return { existing: list(saved), added: [] } satisfies FileValue
    case "fixed":
      return text(saved, field.value)
    case "custom":
      return Object.fromEntries(Object.entries(field.names).map(([name, fallback]) => [name, text(stored?.[name], fallback)]))
    default:
      return text(saved, field.default ?? "")
  }
}

export function initialValues(definition: Definition, params: Params, stored: Record<string, unknown> | null = null): FormValues {
  const values: FormValues = {}
  const known = new Set<string>()
  for (const field of allFields(definition, params)) {
    sentNames(field).forEach((name) => known.add(name))
    const value = initialValue(field, params, stored)
    if (field.kind === "custom") Object.assign(values, value)
    else values[field.name] = value as Value
  }
  // Un nombre (comme l'index de rotation d'Image Upload) ne survivrait pas à l'envoi : le plugin le recalcule.
  const extra: Row = {}
  const extraLists: Record<string, string[]> = {}
  for (const [name, value] of Object.entries(stored ?? {})) {
    if (known.has(name)) continue
    if (typeof value === "string") extra[name] = value
    else if (Array.isArray(value) && value.every((item) => typeof item === "string")) extraLists[name] = value
  }
  values[EXTRA] = JSON.stringify({ ...extra, ...extraLists })
  return values
}

export function isVisible(field: { when?: Condition }, values: FormValues) {
  return !field.when || field.when.in.includes(String(values[field.when.field]))
}

export function toEntries(definition: Definition, values: FormValues, params: Params): [string, Sent][] {
  const settings = new Map<string, Sent[]>()
  const push = (name: string, ...sent: Sent[]) => settings.set(name, [...(settings.get(name) ?? []), ...sent])

  for (const field of allFields(definition, params)) {
    if (!isVisible(field, values) && !field.sendWhenHidden) continue
    const value = values[field.name]
    switch (field.kind) {
      case "switch":
        if (value === true) push(field.name, field.on ?? "true")
        else if (field.off !== undefined) push(field.name, field.off)
        break
      case "colors":
        push(field.name, ...(value as string[]))
        break
      case "rows":
        for (const row of value as Row[]) field.columns.forEach((column) => push(column.name, row[column.name] ?? ""))
        break
      case "files": {
        const { existing, added } = value as FileValue
        // Un fichier choisi remplace l'unique fichier précédent, mais s'ajoute à une liste.
        if (field.multiple || !added.length) push(field.name, ...existing)
        push(field.name, ...added)
        break
      }
      case "custom":
        Object.keys(field.names).forEach((name) => push(name, String(values[name] ?? "")))
        break
      default:
        push(field.name, String(value ?? ""))
    }
  }

  for (const [name, value] of Object.entries(JSON.parse(String(values[EXTRA] ?? "{}")) as Record<string, string | string[]>)) {
    if (!settings.has(name)) push(name, ...(Array.isArray(value) ? value : [value]))
  }
  definition.finalize?.(settings)
  return [...settings.entries()].flatMap(([name, sent]) => sent.map((item): [string, Sent] => [name, item]))
}

const ALLOWED_FILES = new Set(["pdf", "png", "avif", "jpg", "jpeg", "gif", "webp", "heif", "heic"])

const URL_FORMATS = {
  url: /^https?:\/\/\S+$/i,
  // iCloud partage ses agendas en webcal://, que le plugin Calendar convertit lui-même.
  calendar: /^(https?|webcal):\/\/\S+$/i,
}

export function validate(definition: Definition, values: FormValues, params: Params): Errors {
  const errors: Errors = {}
  for (const field of allFields(definition, params)) {
    if (!isVisible(field, values)) continue
    const value = values[field.name]
    const id = fieldId(field.name)
    if (field.kind === "text" || field.kind === "textarea" || field.kind === "date") {
      const content = String(value ?? "").trim()
      if (field.required && !content) errors[id] = "form.required"
      else if (field.kind !== "date" && field.format && content && !URL_FORMATS[field.format].test(content)) errors[id] = "form.invalidUrl"
    } else if (field.kind === "number") {
      const content = String(value ?? "").trim()
      if (content && (!/^-?\d+$/.test(content) || Number(content) < field.min || Number(content) > field.max)) errors[id] = "form.outOfRange"
    } else if (field.kind === "rows") {
      ;(value as Row[]).forEach((row, index) => {
        for (const column of field.columns) {
          const content = (row[column.name] ?? "").trim()
          const cell = rowFieldId(field.name, index, column.name)
          if (column.required && !content) errors[cell] = "form.required"
          else if (column.format && content && !URL_FORMATS[column.format].test(content)) errors[cell] = "form.invalidUrl"
        }
      })
    } else if (field.kind === "files") {
      const { existing, added } = value as FileValue
      if (field.required && !existing.length && !added.length) errors[id] = "form.fileRequired"
      else if (added.some((file) => !ALLOWED_FILES.has(file.name.split(".").pop()?.toLowerCase() ?? ""))) errors[id] = "form.fileType"
    }
  }
  return { ...errors, ...definition.validate?.(values) }
}

function luminance(hex: string) {
  const channels = [1, 3, 5].map((start) => parseInt(hex.slice(start, start + 2), 16) / 255)
  const [r, g, b] = channels.map((channel) => (channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

export function contrastRatio(first: string, second: string) {
  const [high, low] = [luminance(first), luminance(second)].sort((a, b) => b - a)
  return (high + 0.05) / (low + 0.05)
}

/** Ce que le plugin recevrait : l'aperçu est périmé seulement si cela change, un champ masqué ne compte donc pas. */
export function signatureOf(entries: [string, Sent][]) {
  return JSON.stringify(entries.map(([name, value]) => [name, value instanceof File ? [value.name, value.size, value.lastModified] : value]))
}

/** Le brouillon ne garde que du texte : un fichier choisi ne peut pas être conservé par le navigateur. */
export function toDraft(values: FormValues) {
  return JSON.stringify(values, (_, value: unknown) => (value instanceof File ? undefined : value))
}

export function fromDraft(draft: string, initial: FormValues): FormValues | null {
  try {
    const parsed = JSON.parse(draft) as FormValues
    const merged: FormValues = {}
    for (const [name, value] of Object.entries(initial)) {
      const saved = parsed[name]
      // Les réglages inconnus viennent toujours du serveur : un brouillon ne doit pas les écraser.
      if (name === EXTRA || saved === undefined || Array.isArray(saved) !== Array.isArray(value) || typeof saved !== typeof value) merged[name] = value
      else if (typeof value === "object" && !Array.isArray(value)) merged[name] = { existing: (saved as FileValue).existing ?? [], added: [] }
      else merged[name] = saved
    }
    return merged
  } catch {
    return null
  }
}
