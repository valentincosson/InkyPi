import { createContext, useContext, useEffect, useRef, type ReactNode } from "react"
import { ChevronDownIcon, PlusIcon, Trash2Icon, UploadIcon } from "lucide-react"
import { Choice } from "@/components/choice"
import { Segmented } from "@/components/segmented"
import { Button } from "@/components/ui/button"
import { Field as FieldBox, FieldContent, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { useI18n } from "@/i18n"
import type { Key } from "@/i18n/translate"
import { LocationField, NewspaperField } from "./custom-fields"
import { choices, contrastRatio, fieldId, isVisible, newRow, rowFieldId } from "./engine"
import type { Column, Errors, Field, FileValue, FormValues, LeafField, Option, Params, Row, Value } from "./types"

type FormContextValue = {
  values: FormValues
  errors: Errors
  params: Params
  set: (name: string, value: Value) => void
  setMany: (values: Record<string, Value>) => void
}

const FormContext = createContext<FormContextValue | null>(null)
export const FormProvider = FormContext.Provider

export function useForm() {
  const context = useContext(FormContext)
  if (!context) throw new Error("useForm must be used inside FormProvider")
  return context
}

const control = "min-h-10 bg-card"
const groupLabel = "text-sm leading-snug font-medium"

const INKS: [Key, string][] = [["pf.color.black", "#000000"], ["pf.color.white", "#ffffff"], ["pf.color.red", "#c8102e"], ["pf.color.yellow", "#f2c500"], ["pf.color.blue", "#1d4ea8"], ["pf.color.green", "#1f7a45"]]

export function invalidProps(error: Key | undefined, id: string) {
  return error ? { "aria-invalid": true as const, "aria-describedby": `${id}-error` } : {}
}

export function ErrorText({ id, error }: { id: string; error: Key | undefined }) {
  const { t } = useI18n()
  return error ? <FieldError id={`${id}-error`}>{t(error)}</FieldError> : null
}

function optionText(option: Option, t: (key: Key) => string) {
  return option.label ? t(option.label) : (option.text ?? option.value)
}

function Labelled({ id, label, help, error, children }: { id: string; label: string; help?: string; error?: Key; children: ReactNode }) {
  return (
    <FieldBox>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      {children}
      {help ? <FieldDescription>{help}</FieldDescription> : null}
      <ErrorText id={id} error={error} />
    </FieldBox>
  )
}

export function LabelledSegmented({ label, value, options, onChange }: { label: string; value: string; options: { value: string; label: string }[]; onChange: (value: string) => void }) {
  return (
    <div className="grid gap-2">
      <span className={groupLabel}>{label}</span>
      <Segmented label={label} value={value} options={options} onChange={onChange} />
    </div>
  )
}

function ColorInput({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <input type="color" aria-label={label} value={value} onChange={(event) => onChange(event.target.value)} className="h-10 w-12 cursor-pointer rounded-[var(--radius)] border border-input bg-card p-1" />
}

function Inks({ name, label, value, onChange }: { name: string; label: string; value: string; onChange: (value: string) => void }) {
  const { t } = useI18n()
  const custom = !INKS.some(([, hex]) => hex === value.toLowerCase())
  const selected = "shadow-[0_0_0_2px_var(--background),0_0_0_4px_var(--foreground)]"
  return (
    <fieldset>
      <legend className={`mb-1 ${groupLabel}`}>{label}</legend>
      <div className="flex flex-wrap items-center gap-0.5">
        {INKS.map(([inkName, hex]) => (
          <label key={hex} className="relative cursor-pointer" title={t(inkName)}>
            <input type="radio" name={name} checked={value.toLowerCase() === hex} onChange={() => onChange(hex)} className="peer absolute inset-0 m-0 size-full cursor-pointer opacity-0" aria-label={`${label}: ${t(inkName)}`} />
            <span className="flex size-11 items-center justify-center rounded-full peer-focus-visible:outline-2 peer-focus-visible:outline-[var(--ring)] [input:checked+&>span]:shadow-[0_0_0_2px_var(--background),0_0_0_4px_var(--foreground)]">
              <span className="block size-7 rounded-full shadow-[inset_0_0_0_1px_var(--input)]" style={{ background: hex }} />
            </span>
          </label>
        ))}
        <label className="relative flex size-11 cursor-pointer items-center justify-center rounded-full has-focus-visible:outline-2 has-focus-visible:outline-[var(--ring)]" title={t("pf.color.other")}>
          <input type="color" value={value} onChange={(event) => onChange(event.target.value)} className="absolute size-px opacity-0" aria-label={`${label}: ${t("pf.color.other")}`} />
          <span className={`flex size-7 items-center justify-center rounded-full border border-dashed border-input text-muted-foreground ${custom ? selected : ""}`} style={custom ? { background: value } : undefined}>
            {custom ? null : <PlusIcon className="size-3.5" aria-hidden="true" />}
          </span>
        </label>
      </div>
    </fieldset>
  )
}

function FrameArt({ kind }: { kind: string }) {
  const stroke = "var(--art-ink)"
  const frames: Record<string, ReactNode> = {
    None: null,
    Corner: <path d="M6 16V6h10M54 16V6H44M6 24v10h10M54 24v10H44" stroke={stroke} strokeWidth="2" fill="none" />,
    "Top and bottom": <path d="M6 6h48M6 34h48" stroke={stroke} strokeWidth="2" />,
    Rectangle: <rect x="6" y="6" width="48" height="28" fill="none" stroke={stroke} strokeWidth="2" />,
  }
  return (
    <svg viewBox="0 0 60 40" className="block w-full" aria-hidden="true">
      <rect width="60" height="40" fill="var(--art-bg)" />
      {frames[kind]}
      <path d="M18 17h24M23 23h14" stroke="var(--art-2)" strokeWidth="3" />
    </svg>
  )
}

function Pictures({ field }: { field: Extract<Field, { kind: "pictures" }> }) {
  const { t } = useI18n()
  const { values, params, setMany } = useForm()
  const options = field.choices(params)
  return (
    <fieldset>
      <legend className={`mb-2 ${groupLabel}`}>{t(field.label)}</legend>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {options.map((option) => (
          <label key={option.value} className="relative cursor-pointer text-center text-sm leading-tight text-muted-foreground">
            <input
              type="radio"
              name={field.name}
              checked={values[field.name] === option.value}
              onChange={() => setMany({ [field.name]: option.value, ...option.sets })}
              className="peer absolute inset-0 m-0 size-full cursor-pointer opacity-0"
            />
            <span className="mb-1.5 block overflow-hidden rounded-[var(--radius)] bg-card shadow-[0_0_0_1px_var(--control)] peer-checked:shadow-[0_0_0_2px_var(--foreground)] peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[var(--ring)]">
              {option.image ? <img src={option.image} alt="" className="block aspect-[3/2] w-full object-contain" /> : <FrameArt kind={option.frame ?? "None"} />}
            </span>
            {option.label ? t(option.label) : option.text}
          </label>
        ))}
      </div>
    </fieldset>
  )
}

function fileName(path: string) {
  return path.split("/").pop() ?? path
}

function Files({ field }: { field: Extract<Field, { kind: "files" }> }) {
  const { t } = useI18n()
  const { values, errors, set } = useForm()
  const id = fieldId(field.name)
  const value = values[field.name] as FileValue
  const error = errors[id]
  const input = useRef<HTMLInputElement>(null)
  const shownExisting = field.multiple || !value.added.length ? value.existing : []
  const names = [...shownExisting.map((path) => ({ key: `existing-${path}`, name: fileName(path), remove: () => set(field.name, { ...value, existing: value.existing.filter((item) => item !== path) }) })), ...value.added.map((file) => ({ key: `added-${file.name}`, name: file.name, remove: () => set(field.name, { ...value, added: value.added.filter((item) => item !== file) }) }))]

  const add = (chosen: File[]) => {
    if (!field.multiple) set(field.name, { ...value, added: chosen.slice(0, 1) })
    else {
      const taken = new Set(value.added.map((file) => file.name))
      set(field.name, { ...value, added: [...value.added, ...chosen.filter((file) => !taken.has(file.name))] })
    }
    if (input.current) input.current.value = ""
  }

  return (
    <div className="grid gap-2">
      <span className={groupLabel}>{t(field.label)}</span>
      {names.length ? (
        <ul className="divide-y divide-border rounded-[var(--radius)] border border-border bg-card">
          {names.map(({ key, name, remove }) => (
            <li key={key} className="flex items-center justify-between gap-3 py-1 pr-1 pl-3 text-sm">
              <span className="min-w-0 [overflow-wrap:anywhere]">{name}</span>
              <Button type="button" variant="ghost" size="icon" className="size-10 shrink-0" aria-label={t("form.removeNamed", { name })} onClick={() => { remove(); input.current?.focus() }}>
                <Trash2Icon aria-hidden="true" />
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
      <label className="relative flex min-h-10 w-fit cursor-pointer items-center gap-2 rounded-[var(--radius)] border border-[var(--control)] bg-card px-3 text-sm font-medium hover:bg-accent has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-[var(--ring)]">
        <UploadIcon className="size-4" aria-hidden="true" />
        {t(field.multiple ? "form.chooseImages" : "form.chooseImage")}
        <input ref={input} id={id} type="file" accept="image/*" multiple={field.multiple} className="absolute size-px opacity-0" onChange={(event) => add([...event.target.files ?? []])} {...invalidProps(error, id)} />
      </label>
      <ErrorText id={id} error={error} />
    </div>
  )
}

function RowCell({ column, id, value, error, onChange }: { column: Column; id: string; value: string; error?: Key; onChange: (value: string) => void }) {
  const { t } = useI18n()
  const label = t(column.label)
  if (column.kind === "color") {
    return (
      <div className="grid gap-2">
        <label htmlFor={id} className={groupLabel}>{label}</label>
        <input id={id} type="color" value={value} onChange={(event) => onChange(event.target.value)} className="h-10 w-12 cursor-pointer rounded-[var(--radius)] border border-input bg-card p-1" />
      </div>
    )
  }
  const Control = column.kind === "textarea" ? Textarea : Input
  return (
    <Labelled id={id} label={label} error={error}>
      <Control id={id} className={`${control} ${column.kind === "textarea" ? "min-h-28" : ""}`} placeholder={column.placeholder} autoComplete="off" spellCheck={!column.format} value={value} onChange={(event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => onChange(event.target.value)} {...invalidProps(error, id)} />
    </Labelled>
  )
}

function Rows({ field }: { field: Extract<Field, { kind: "rows" }> }) {
  const { t } = useI18n()
  const { values, errors, set } = useForm()
  const rows = values[field.name] as Row[]
  const focusNext = useRef<string | null>(null)
  const addButton = `${fieldId(field.name)}-add`

  useEffect(() => {
    if (!focusNext.current) return
    document.getElementById(focusNext.current)?.focus()
    focusNext.current = null
  })

  const change = (index: number, column: string, value: string) => set(field.name, rows.map((row, position) => (position === index ? { ...row, [column]: value } : row)))
  const canAdd = !field.max || rows.length < field.max

  return (
    <fieldset className="grid gap-3">
      <legend className={`mb-2 ${groupLabel}`}>{t(field.label)}</legend>
      {rows.map((row, index) => (
        <div key={index} className="grid gap-3 rounded-[var(--radius)] border border-border bg-card p-3">
          {field.columns.map((column) => {
            const id = rowFieldId(field.name, index, column.name)
            return <RowCell key={column.name} column={column} id={id} value={row[column.name] ?? ""} error={errors[id]} onChange={(value) => change(index, column.name, value)} />
          })}
          {rows.length > 1 ? (
            <Button
              type="button"
              variant="ghost"
              className="min-h-10 w-fit"
              aria-label={t("form.removeRow", { number: String(index + 1) })}
              onClick={() => {
                focusNext.current = addButton
                set(field.name, rows.filter((_, position) => position !== index))
              }}
            >
              <Trash2Icon data-icon="inline-start" aria-hidden="true" />{t("form.remove")}
            </Button>
          ) : null}
        </div>
      ))}
      {canAdd ? (
        <Button
          id={addButton}
          type="button"
          variant="outline"
          className="min-h-10 w-fit"
          onClick={() => {
            focusNext.current = rowFieldId(field.name, rows.length, field.columns[0].name)
            set(field.name, [...rows, newRow(field)])
          }}
        >
          <PlusIcon data-icon="inline-start" aria-hidden="true" />{t(field.add)}
        </Button>
      ) : null}
    </fieldset>
  )
}

function SwitchRow({ field }: { field: Extract<Field, { kind: "switch" }> }) {
  const { t } = useI18n()
  const { values, set } = useForm()
  const id = fieldId(field.name)
  const on = values[field.name] === true
  const children = field.fields?.filter((child) => isVisible(child as LeafField, values))
  return (
    <div>
      <FieldBox orientation="horizontal" className="min-h-12 justify-between gap-6 px-3 py-2 has-[>[data-slot=field-content]]:items-center">
        <FieldContent>
          <FieldLabel htmlFor={id}>{t(field.label)}</FieldLabel>
          {field.help ? <FieldDescription>{t(field.help)}</FieldDescription> : null}
        </FieldContent>
        <Switch id={id} checked={on} onCheckedChange={(checked) => set(field.name, checked)} />
      </FieldBox>
      {on && children?.length ? <div className="grid gap-3 px-3 pb-3 [&_[data-slot=select-trigger]]:w-28 [&>[data-slot=field]]:flex-row [&>[data-slot=field]]:items-center [&>[data-slot=field]]:justify-between">{children.map((child) => <FieldView key={child.name} field={child} />)}</div> : null}
    </div>
  )
}

function More({ field }: { field: Extract<Field, { kind: "more" }> }) {
  const { t } = useI18n()
  return (
    <details className="group">
      <summary className="-mx-1 flex min-h-10 w-fit cursor-pointer list-none items-center gap-2 rounded-[var(--radius)] px-1 text-sm font-medium [&::-webkit-details-marker]:hidden">
        <ChevronDownIcon className="size-4 transition-transform group-open:rotate-180" aria-hidden="true" />{t(field.label)}
      </summary>
      <div className="grid gap-4 pt-2 pb-1"><FieldList fields={field.fields} /></div>
    </details>
  )
}

function Contrast({ field }: { field: Extract<Field, { kind: "contrast" }> }) {
  const { t } = useI18n()
  const { values } = useForm()
  const ratio = contrastRatio(String(values[field.text]), String(values[field.background]))
  if (ratio >= 3) return null
  return (
    <p role="status" className="flex items-start gap-2 text-sm text-muted-foreground">
      <span className="mt-1.5 size-2 shrink-0 rounded-full bg-[var(--warn)]" aria-hidden="true" />{t("form.lowContrast")}
    </p>
  )
}

function FieldView({ field }: { field: Field }) {
  const { t } = useI18n()
  const { values, errors, params, set } = useForm()
  if (field.kind === "fixed") return null
  if (field.kind === "more") return <More field={field} />
  if (field.kind === "contrast") return <Contrast field={field} />
  if (field.kind === "pictures") return <Pictures field={field} />
  if (field.kind === "files") return <Files field={field} />
  if (field.kind === "rows") return <Rows field={field} />
  if (field.kind === "switch") return <SwitchRow field={field} />
  if (field.kind === "custom") return field.name === "location" ? <LocationField field={field} /> : <NewspaperField field={field} />

  const id = fieldId(field.name)
  const value = String(values[field.name] ?? "")
  const error = errors[id]
  const label = t(field.label)
  const help = field.help ? t(field.help) : undefined
  const onChange = (next: string) => set(field.name, next)

  switch (field.kind) {
    case "select":
      return <Labelled id={id} label={label} help={help}><Choice id={id} value={value} onChange={onChange} options={choices(field, params).map((option) => ({ value: option.value, label: optionText(option, t) }))} /></Labelled>
    case "segmented":
      return <LabelledSegmented label={label} value={value} onChange={onChange} options={choices(field, params).map((option) => ({ value: option.value, label: optionText(option, t) }))} />
    case "inks":
      return <Inks name={field.name} label={label} value={value} onChange={onChange} />
    case "color":
      return <FieldBox orientation="horizontal" className="items-center justify-between gap-3"><FieldLabel htmlFor={id}>{label}</FieldLabel><input id={id} type="color" value={value} onChange={(event) => onChange(event.target.value)} className="h-10 w-12 cursor-pointer rounded-[var(--radius)] border border-input bg-card p-1" /></FieldBox>
    case "colors": {
      const colors = values[field.name] as string[]
      return (
        <fieldset>
          <legend className={`mb-2 ${groupLabel}`}>{label}</legend>
          <div className="flex flex-wrap gap-2">
            {colors.map((color, index) => <ColorInput key={index} label={`${label} ${index + 1}`} value={color} onChange={(next) => set(field.name, colors.map((item, position) => (position === index ? next : item)))} />)}
          </div>
        </fieldset>
      )
    }
    case "textarea":
      return <Labelled id={id} label={label} help={help} error={error}><Textarea id={id} className={`${control} min-h-28`} placeholder={field.placeholder} value={value} onChange={(event) => onChange(event.target.value)} {...invalidProps(error, id)} /></Labelled>
    case "number":
      return <Labelled id={id} label={label} help={help} error={error}><Input id={id} className={`${control} tabular-nums`} inputMode="numeric" autoComplete="off" placeholder={field.placeholder} value={value} onChange={(event) => onChange(event.target.value)} {...invalidProps(error, id)} /></Labelled>
    case "date":
      return <Labelled id={id} label={label} help={help} error={error}><Input id={id} type="date" className={`${control} w-fit`} value={value} onChange={(event) => onChange(event.target.value)} {...invalidProps(error, id)} /></Labelled>
    default:
      return <Labelled id={id} label={label} help={help} error={error}><Input id={id} className={control} autoComplete="off" spellCheck={!field.format} placeholder={field.placeholder} value={value} onChange={(event) => onChange(event.target.value)} {...invalidProps(error, id)} /></Labelled>
  }
}

/** Les interrupteurs voisins forment une seule liste. */
export function FieldList({ fields }: { fields: Field[] }) {
  const { values } = useForm()
  const visible = fields.filter((field) => field.kind === "more" || isVisible(field, values))
  const groups: Field[][] = []
  for (const field of visible) {
    const last = groups[groups.length - 1]
    if (field.kind === "switch" && last?.[0].kind === "switch") last.push(field)
    else groups.push([field])
  }
  return groups.map((group) =>
    group[0].kind === "switch"
      ? <div key={group[0].name} className="divide-y divide-border rounded-[var(--radius)] border border-border bg-card">{group.map((field) => <FieldView key={field.name} field={field} />)}</div>
      : <FieldView key={group[0].name} field={group[0]} />,
  )
}
