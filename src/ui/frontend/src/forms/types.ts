import type { Key } from "@/i18n/translate"

export type Params = Record<string, unknown>
export type Condition = { field: string; in: string[] }
export type Option = { value: string; label?: Key; text?: string }
export type Picture = { value: string; text?: string; label?: Key; image?: string; frame?: string; sets?: Record<string, string> }
export type UrlFormat = "url" | "calendar"
export type Column = { name: string; label: Key; kind: "text" | "textarea" | "color"; default?: string; required?: boolean; format?: UrlFormat; placeholder?: string }

type Base = {
  name: string
  label: Key
  help?: Key
  /** Le champ n'apparaît que si la condition est vraie. Masqué, il n'est plus envoyé, sauf avec `sendWhenHidden`. */
  when?: Condition
  sendWhenHidden?: boolean
}

export type TextField = Base & { kind: "text" | "textarea"; default?: string; placeholder?: string; required?: boolean; format?: UrlFormat }
export type DateField = Base & { kind: "date"; default?: string; required?: boolean }
export type NumberField = Base & { kind: "number"; min: number; max: number; step?: number; default?: string; placeholder?: string }
export type ColorField = Base & { kind: "color" | "inks"; default: string }
export type ChoiceField = Base & {
  kind: "select" | "segmented"
  options: Option[] | ((params: Params) => Option[])
  default?: string
  /** Ce que le plugin fait quand une entrée déjà enregistrée n'a pas ce réglage, si cela diffère du choix proposé à la création. */
  storedDefault?: string
}
export type SwitchField = Base & { kind: "switch"; default: boolean; on?: string; off?: string; fields?: Field[] }
export type ColorsField = Base & { kind: "colors"; default: string[] }
export type PicturesField = Base & { kind: "pictures"; choices: (params: Params) => Picture[] }
export type RowsField = Base & { kind: "rows"; columns: Column[]; max?: number; add: Key }
export type FilesField = Base & { kind: "files"; multiple: boolean; required?: boolean }
/** Envoyé tel quel, sans rien afficher. */
export type FixedField = { kind: "fixed"; name: string; value: string; when?: Condition; sendWhenHidden?: boolean }
/** Plusieurs champs réunis dans un seul contrôle sur mesure. */
export type CustomField = { kind: "custom"; name: "location" | "newspaper"; label: Key; names: Record<string, string>; when?: Condition; sendWhenHidden?: boolean }
export type MoreField = { kind: "more"; name: string; label: Key; fields: Field[] }
/** N'envoie rien : prévient si le texte devient illisible sur son fond. */
export type ContrastField = { kind: "contrast"; name: string; text: string; background: string; when?: Condition }

export type LeafField = TextField | DateField | NumberField | ColorField | ChoiceField | SwitchField | ColorsField | PicturesField | RowsField | FilesField | FixedField | CustomField
export type Field = LeafField | MoreField | ContrastField

export type Section = { title?: Key; fields: Field[] }
export type Definition = {
  apiKey?: { key: string; when?: Condition }
  sections: Section[]
  notice?: Key
  /** À savoir avant de demander un aperçu, quand il a un coût. */
  previewNote?: Key
  /** Dernier ajustement avant l'envoi, pour les règles qui ne se décrivent pas autrement. */
  finalize?: (settings: Map<string, Sent[]>) => void
  validate?: (values: FormValues) => Errors
}

export type Row = Record<string, string>
export type FileValue = { existing: string[]; added: File[] }
export type Value = string | boolean | string[] | Row[] | FileValue
export type FormValues = Record<string, Value>
export type Sent = string | File
export type Errors = Record<string, Key>
