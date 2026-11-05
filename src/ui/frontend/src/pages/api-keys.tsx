import { useEffect, useRef, useState, type FormEvent } from "react"
import { getApiKeys, saveApiKeys, type ApiKey } from "@/api"
import { entriesWithout, entriesWithValue, knownKeys, nameError } from "@/api-keys"
import { ConfirmDialog } from "@/components/confirm-dialog"
import { LoadFailed, Loading, PageTitle } from "@/components/page-state"
import { Shell } from "@/components/shell"
import { UnsavedGuard } from "@/components/unsaved-guard"
import { Button } from "@/components/ui/button"
import { Field, FieldError, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { useI18n } from "@/i18n"
import type { Key } from "@/i18n/translate"
import { saveErrorMessage } from "@/save-error"
import { useResource } from "@/use-resource"
import { CheckIcon } from "lucide-react"

const ADD_OTHER = "key-add-other"
const actionId = (key: string) => `key-action-${key}`

function KeyForm({ label, keys, askName, onSubmit, onCancel }: { label: string; keys: ApiKey[]; askName?: boolean; onSubmit: (name: string, value: string) => Promise<void>; onCancel: () => void }) {
  const { t } = useI18n()
  const [name, setName] = useState("")
  const [value, setValue] = useState("")
  const [errors, setErrors] = useState<{ name?: Key; value?: Key; save?: string }>({})
  const [saving, setSaving] = useState(false)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (saving) return
    const next = {
      name: askName ? (nameError(name.trim(), keys) ?? undefined) : undefined,
      value: value.trim() ? undefined : ("apiKeys.valueRequired" as const),
    }
    setErrors(next)
    if (next.name || next.value) {
      document.getElementById(next.name ? "key-name" : "key-value")?.focus()
      return
    }
    setSaving(true)
    try {
      await onSubmit(name.trim(), value.trim())
    } catch (error) {
      setErrors({ save: saveErrorMessage(error, t) })
      setSaving(false)
    }
  }

  return (
    <form onSubmit={submit} noValidate className="mt-3 grid gap-3">
      <UnsavedGuard dirty={value.trim() !== "" || name.trim() !== ""} />
      <div className={askName ? "grid gap-3 sm:grid-cols-2" : "grid"}>
        {askName ? (
          <Field>
            <FieldLabel htmlFor="key-name">{t("apiKeys.name")}</FieldLabel>
            <Input id="key-name" autoFocus className="min-h-10 bg-background" autoComplete="off" spellCheck={false} placeholder="MY_API_KEY" value={name} onChange={(event) => setName(event.target.value)} aria-invalid={errors.name ? true : undefined} aria-describedby={errors.name ? "key-name-error" : undefined} />
            {errors.name ? <FieldError id="key-name-error">{t(errors.name)}</FieldError> : null}
          </Field>
        ) : null}
        <Field>
          <FieldLabel htmlFor="key-value">{label}</FieldLabel>
          <Input id="key-value" autoFocus={!askName} type="password" className="min-h-10 bg-background" autoComplete="new-password" spellCheck={false} value={value} onChange={(event) => setValue(event.target.value)} aria-invalid={errors.value ? true : undefined} aria-describedby={errors.value ? "key-value-error" : undefined} />
          {errors.value ? <FieldError id="key-value-error">{t(errors.value)}</FieldError> : null}
        </Field>
      </div>
      {errors.save ? <p role="alert" className="text-sm text-destructive">{errors.save}</p> : null}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" className="min-h-10" aria-busy={saving}>{t("apiKeys.save")}</Button>
        <Button type="button" variant="outline" className="min-h-10" disabled={saving} onClick={onCancel}>{t("action.cancel")}</Button>
      </div>
    </form>
  )
}

type RowProps = {
  id: string
  title: string
  detail?: string
  help?: string
  entry?: ApiKey
  editing: boolean
  keys: ApiKey[]
  onEdit: () => void
  onCancel: () => void
  onSave: (value: string) => Promise<void>
  onRemove: () => void
}

function KeyRow({ id, title, detail, help, entry, editing, keys, onEdit, onCancel, onSave, onRemove }: RowProps) {
  const { t } = useI18n()
  const helpLink = entry?.has_value ? undefined : help
  return (
    <li className="px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="min-w-48 flex-1">
          <p className="font-medium [overflow-wrap:anywhere]">{title}</p>
          {detail ? (
            <p className="text-sm text-muted-foreground">
              {detail}
              {helpLink ? <>. <a className="underline underline-offset-4 hover:text-foreground" href={helpLink} target="_blank" rel="noreferrer">{t("apiKeys.howTo")}</a></> : null}
            </p>
          ) : null}
        </div>
        {editing ? null : (
          <div className="flex flex-wrap items-center gap-2">
            {entry?.has_value
              ? <span className="mr-2 inline-flex items-center gap-1.5 text-sm text-muted-foreground"><CheckIcon className="size-4" aria-hidden="true" />{t("apiKeys.saved")}</span>
              : <span className="mr-2 text-sm text-muted-foreground">{t("apiKeys.notSet")}</span>}
            <Button id={actionId(id)} variant="outline" className="min-h-10" aria-label={t(entry?.has_value ? "apiKeys.replaceNamed" : "apiKeys.addNamed", { name: title })} onClick={onEdit}>{t(entry?.has_value ? "apiKeys.replace" : "apiKeys.add")}</Button>
            {entry ? <Button variant="ghost" className="min-h-10" aria-label={t("apiKeys.removeNamed", { name: title })} onClick={onRemove}>{t("apiKeys.remove")}</Button> : null}
          </div>
        )}
      </div>
      {editing ? <KeyForm label={t("apiKeys.valueLabel", { name: title })} keys={keys} onSubmit={(_, value) => onSave(value)} onCancel={onCancel} /> : null}
    </li>
  )
}

const list = "divide-y divide-border rounded-[var(--radius)] border border-border bg-card"

function KeyList({ initial }: { initial: ApiKey[] }) {
  const { t } = useI18n()
  const [keys, setKeys] = useState(initial)
  const [editing, setEditing] = useState<string | null>(null)
  const [addingOther, setAddingOther] = useState(false)
  // La fiche reste renseignée après la fermeture : la boîte de dialogue s'efface en douceur.
  const [removing, setRemoving] = useState({ key: "", title: "" })
  const [removeOpen, setRemoveOpen] = useState(false)
  const [removeBusy, setRemoveBusy] = useState(false)
  const [removeError, setRemoveError] = useState("")
  const [announcement, setAnnouncement] = useState("")
  const focusNext = useRef<string | null>(null)
  const removed = useRef(false)

  useEffect(() => {
    if (!focusNext.current) return
    document.getElementById(focusNext.current)?.focus()
    focusNext.current = null
  })

  const known = new Set(knownKeys.map(({ key }) => key))
  const others = keys.filter(({ key }) => !known.has(key))

  // La route remplace tout le fichier : une clé ajoutée ailleurs depuis l'ouverture de la page doit survivre.
  const latestKeys = async () => (await getApiKeys()).keys

  const saveValue = async (key: string, title: string, value: string) => {
    const current = await latestKeys()
    await saveApiKeys(entriesWithValue(current, key, value))
    const saved = { key, has_value: true }
    setKeys(current.some((entry) => entry.key === key) ? current.map((entry) => (entry.key === key ? saved : entry)) : [...current, saved])
    setEditing(null)
    setAddingOther(false)
    setAnnouncement(t("apiKeys.announceSaved", { name: title }))
    focusNext.current = actionId(key)
  }

  const remove = async () => {
    if (removeBusy) return
    setRemoveBusy(true)
    setRemoveError("")
    try {
      const current = await latestKeys()
      await saveApiKeys(entriesWithout(current, removing.key))
      removed.current = true
      setKeys(current.filter((entry) => entry.key !== removing.key))
      setEditing(null)
      setAnnouncement(t("apiKeys.announceRemoved", { name: removing.title }))
      setRemoveOpen(false)
    } catch (error) {
      setRemoveError(saveErrorMessage(error, t))
    } finally {
      setRemoveBusy(false)
    }
  }

  const row = (id: string, title: string, extra: { detail?: string; help?: string }) => (
    <KeyRow
      key={id}
      id={id}
      title={title}
      {...extra}
      entry={keys.find(({ key }) => key === id)}
      editing={editing === id}
      keys={keys}
      onEdit={() => { setAddingOther(false); setEditing(id) }}
      onCancel={() => { focusNext.current = actionId(id); setEditing(null) }}
      onSave={(value) => saveValue(id, title, value)}
      onRemove={() => { removed.current = false; setRemoveError(""); setRemoving({ key: id, title }); setRemoveOpen(true) }}
    />
  )

  return (
    <div className="grid max-w-[820px] gap-7">
      <p role="status" className="sr-only">{announcement}</p>
      <ul className={list}>
        {knownKeys.map(({ key, service, plugins, help }) => row(key, service, { detail: t("apiKeys.usedBy", { plugins }), help }))}
      </ul>

      <section aria-labelledby="other-keys" className="grid gap-3">
        <h2 id="other-keys" className="text-lg leading-snug font-semibold">{t("apiKeys.other")}</h2>
        {others.length ? <ul className={list}>{others.map(({ key }) => row(key, key, {}))}</ul> : null}
        {addingOther ? (
          <div className="rounded-[var(--radius)] border border-border bg-card px-4 pt-1 pb-4">
            <KeyForm
              askName
              label={t("apiKeys.value")}
              keys={keys}
              onSubmit={(name, value) => saveValue(name, name, value)}
              onCancel={() => { focusNext.current = ADD_OTHER; setAddingOther(false) }}
            />
          </div>
        ) : (
          <Button id={ADD_OTHER} variant="outline" className="min-h-10 w-fit" onClick={() => { setEditing(null); setAddingOther(true) }}>{t("apiKeys.addOther")}</Button>
        )}
      </section>

      <ConfirmDialog
        open={removeOpen}
        onClose={() => setRemoveOpen(false)}
        onConfirm={() => void remove()}
        title={t("apiKeys.removeTitle", { name: removing.title })}
        body={t("apiKeys.removeBody")}
        confirm={t("apiKeys.remove")}
        cancel={t("action.cancel")}
        destructive
        busy={removeBusy}
        error={removeError}
        finalFocus={() => (removed.current ? (document.getElementById(actionId(removing.key)) ?? document.getElementById(ADD_OTHER)) : true)}
      />
    </div>
  )
}

export function ApiKeysPage() {
  const { t } = useI18n()
  const { data, failed, retry } = useResource(getApiKeys)
  return (
    <Shell title={t("nav.apiKeys")} current="nav.apiKeys">
      <PageTitle>{t("nav.apiKeys")}</PageTitle>
      <p className="-mt-4 mb-6 max-w-[64ch] text-pretty text-muted-foreground">{t("apiKeys.intro")}</p>
      {data ? <KeyList initial={data.keys} /> : failed ? <LoadFailed title={t("apiKeys.loadFailed")} onRetry={retry} /> : <Loading />}
    </Shell>
  )
}
