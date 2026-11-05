import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react"
import { ArrowLeftIcon, CheckIcon, LoaderCircleIcon } from "lucide-react"
import { Link, useParams, useSearch } from "wouter"
import { addToPlaylist, ApiError, getPlugin, saveInstance, saveRefresh, showOnScreen, type PluginData } from "@/api"
import { knownKeys } from "@/api-keys"
import { Choice } from "@/components/choice"
import { LoadFailed, Loading } from "@/components/page-state"
import { Shell } from "@/components/shell"
import { UnsavedGuard } from "@/components/unsaved-guard"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field, FieldError, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { definitions } from "@/forms/definitions"
import { pluginLabel } from "@/forms/registry"
import { fromDraft, initialValues, isVisible, sectionsOf, toDraft, toEntries, validate } from "@/forms/engine"
import { FieldList, FormProvider, Segmented } from "@/forms/fields"
import { instanceNameError, refreshError, refreshFromStored, suggestedName, toRefreshSettings, type RefreshUnit, type RefreshValues } from "@/forms/refresh"
import type { Definition, FileValue, FormValues, Value } from "@/forms/types"
import { useI18n } from "@/i18n"
import type { Key } from "@/i18n/translate"
import { useResource } from "@/use-resource"

type Status = { kind: "busy"; text: string } | { kind: "done"; text: string } | { kind: "error"; text: string } | null

function failureText(error: unknown, t: (key: Key, params?: Record<string, string>) => string, refused: Key) {
  return error instanceof ApiError ? t(refused, { reason: error.message }) : t("form.unreachable")
}

function ScreenImage({ version }: { version: number }) {
  const { t } = useI18n()
  const [failed, setFailed] = useState<number | null>(null)
  return (
    <figure className="hidden lg:block">
      <div className="device">
        {failed === version
          ? <div className="flex aspect-[5/3] items-center justify-center rounded-[4px] bg-card p-4 text-center text-sm text-muted-foreground">{t("form.nothingOnScreen")}</div>
          : <img src={`/api/current_image?v=${version}`} alt={t("screen.onScreen")} onError={() => setFailed(version)} />}
      </div>
      <figcaption className="mt-2 text-sm text-muted-foreground">{t("screen.onScreen")}</figcaption>
    </figure>
  )
}

function RefreshFields({ prefix, values, onChange }: { prefix: string; values: RefreshValues; onChange: (values: RefreshValues) => void }) {
  const { t } = useI18n()
  const one = values.interval.trim() === "1"
  return (
    <div className="grid gap-3">
      <Segmented label={t("form.refreshLabel")} value={values.type} onChange={(type) => onChange({ ...values, type: type as RefreshValues["type"] })} options={[{ value: "interval", label: t("form.refreshEvery") }, { value: "scheduled", label: t("form.refreshDaily") }]} />
      {values.type === "interval" ? (
        <div className="grid grid-cols-[6rem_minmax(0,1fr)] gap-2">
          <Input id={`${prefix}-interval`} aria-label={t("form.refreshEvery")} className="min-h-10 tabular-nums" inputMode="numeric" autoComplete="off" value={values.interval} onChange={(event) => onChange({ ...values, interval: event.target.value })} />
          <Choice<RefreshUnit> id={`${prefix}-unit`} label={t("settings.unit")} value={values.unit} onChange={(unit) => onChange({ ...values, unit })} options={[
            { value: "minute", label: t(one ? "settings.minute" : "settings.minutes") },
            { value: "hour", label: t(one ? "settings.hour" : "settings.hours") },
            { value: "day", label: t(one ? "form.day" : "form.days") },
          ]} />
        </div>
      ) : (
        <Input id={`${prefix}-time`} type="time" step={900} aria-label={t("form.refreshDaily")} className="min-h-10 w-fit" value={values.time} onChange={(event) => onChange({ ...values, time: event.target.value })} />
      )}
    </div>
  )
}

/** Fenêtre d'envoi : l'erreur du serveur s'y affiche, et ce qui est saisi reste en place. */
function ActionDialog({ title, description, confirm, opener, firstField, onClose, onSubmit, children }: { title: string; description: string; confirm: string; opener: string; firstField?: string; onClose: () => void; onSubmit: () => Promise<Key | string | null>; children: ReactNode }) {
  const { t } = useI18n()
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (busy) return
    setBusy(true)
    setError("")
    const failure = await onSubmit()
    if (failure) {
      setError(failure)
      setBusy(false)
    }
  }
  return (
    <Dialog open onOpenChange={(open) => { if (!open && !busy) onClose() }}>
      <DialogContent className="w-[calc(100vw-2rem)]" initialFocus={firstField ? () => document.getElementById(firstField) : undefined} finalFocus={() => document.getElementById(opener)}>
        <form onSubmit={submit} noValidate className="grid gap-4">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </DialogHeader>
          {children}
          {error ? <FieldError>{error}</FieldError> : null}
          <DialogFooter>
            <Button type="button" variant="outline" className="min-h-10" disabled={busy} onClick={onClose}>{t("action.cancel")}</Button>
            <Button type="submit" className="min-h-10" aria-busy={busy}>{confirm}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function PlaylistDialog({ plugin, title, description, confirm, opener, entries, onClose, onDone }: { plugin: PluginData; title: string; description: string; confirm: string; opener: string; entries: () => [string, string | File][]; onClose: () => void; onDone: (name: string, playlist: string) => void }) {
  const { t } = useI18n()
  const [name, setName] = useState(() => suggestedName(pluginLabel(t, plugin.id, plugin.name)))
  const [playlist, setPlaylist] = useState(plugin.playlists[0] ?? "")
  const [refresh, setRefresh] = useState<RefreshValues>(() => refreshFromStored(plugin.refresh))
  return (
    <ActionDialog
      title={title}
      description={description}
      confirm={confirm}
      opener={opener}
      firstField="instance-name"
      onClose={onClose}
      onSubmit={async () => {
        const clean = name.trim()
        const invalid = instanceNameError(clean) ?? refreshError(refresh)
        if (invalid) return t(invalid)
        try {
          await addToPlaylist(plugin.id, entries(), { ...toRefreshSettings(refresh), playlist, instance_name: clean })
          onDone(clean, playlist)
          return null
        } catch (error) {
          return failureText(error, t, "error.refused")
        }
      }}
    >
      <Field><FieldLabel htmlFor="instance-name">{t("form.instanceName")}</FieldLabel><Input id="instance-name" className="min-h-10" autoComplete="off" value={name} onChange={(event) => setName(event.target.value)} /></Field>
      <Field><FieldLabel htmlFor="playlist">{t("form.playlist")}</FieldLabel><Choice id="playlist" value={playlist} onChange={setPlaylist} options={plugin.playlists.map((item) => ({ value: item, label: item }))} /></Field>
      <RefreshFields prefix="add" values={refresh} onChange={setRefresh} />
    </ActionDialog>
  )
}

function ScheduleDialog({ plugin, instance, current, onClose, onDone }: { plugin: PluginData; instance: string; current: RefreshValues; onClose: () => void; onDone: (values: RefreshValues) => void }) {
  const { t } = useI18n()
  const [refresh, setRefresh] = useState(current)
  return (
    <ActionDialog
      title={t("form.schedule")}
      description={t("form.scheduleHelp")}
      confirm={t("action.save")}
      opener="action-schedule"
      onClose={onClose}
      onSubmit={async () => {
        const invalid = refreshError(refresh)
        if (invalid) return t(invalid)
        try {
          await saveRefresh(plugin.id, instance, toRefreshSettings(refresh))
          onDone(refresh)
          return null
        } catch (error) {
          return failureText(error, t, "error.refused")
        }
      }}
    >
      <RefreshFields prefix="edit" values={refresh} onChange={setRefresh} />
    </ActionDialog>
  )
}

function readDraft(key: string) {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function writeDraft(key: string, draft: string | null) {
  try {
    if (draft === null) localStorage.removeItem(key)
    else localStorage.setItem(key, draft)
  } catch {
    // Simple confort : sans stockage, on perd seulement le brouillon.
  }
}

function hasNewFiles(values: FormValues) {
  return Object.values(values).some((value) => typeof value === "object" && !Array.isArray(value) && (value as FileValue).added.length > 0)
}

function PluginForm({ plugin, definition }: { plugin: PluginData; definition: Definition }) {
  const { t } = useI18n()
  const { params, instance } = plugin
  const draftKey = `inkypi-draft:${plugin.id}:${instance ?? ""}`
  const initial = useMemo(() => initialValues(definition, params, plugin.settings), [definition, params, plugin.settings])
  const [startingDraft] = useState(() => {
    const saved = readDraft(draftKey)
    const restored = saved ? fromDraft(saved, initial) : null
    return restored && toDraft(restored) !== toDraft(initial) ? restored : null
  })
  const [baseline, setBaseline] = useState(initial)
  const [values, setValues] = useState<FormValues>(startingDraft ?? initial)
  const [draftNotice, setDraftNotice] = useState(startingDraft !== null)
  const [attempted, setAttempted] = useState(false)
  const [focusRequest, setFocusRequest] = useState(0)
  const [status, setStatus] = useState<Status>(null)
  const [dialog, setDialog] = useState<"add" | "saveAs" | "schedule" | null>(null)
  const [refresh, setRefresh] = useState(() => refreshFromStored(plugin.refresh))
  const [screenVersion, setScreenVersion] = useState(() => Date.now())
  const busy = status?.kind === "busy"

  const changed = toDraft(values) !== toDraft(baseline)
  useEffect(() => {
    writeDraft(draftKey, changed ? toDraft(values) : null)
  }, [changed, draftKey, values])

  useEffect(() => {
    if (!focusRequest) return
    const invalid = document.querySelector<HTMLElement>("#plugin-form [aria-invalid='true']")
    const details = invalid?.closest("details")
    if (details) details.open = true
    invalid?.focus()
  }, [focusRequest])

  // Un message ne doit pas survivre à ce qu'il décrit, sauf pendant un envoi.
  const clearStatus = useCallback(() => setStatus((current) => (current?.kind === "busy" ? current : null)), [])
  const context = useMemo(() => ({
    values,
    errors: attempted ? validate(definition, values, params) : {},
    params,
    set: (name: string, value: Value) => {
      setValues((current) => ({ ...current, [name]: value }))
      clearStatus()
    },
    setMany: (next: Record<string, Value>) => {
      setValues((current) => ({ ...current, ...next }))
      clearStatus()
    },
  }), [attempted, clearStatus, definition, values, params])

  const entries = () => toEntries(definition, values, params)
  const ready = () => {
    if (Object.keys(validate(definition, values, params)).length === 0) return true
    setAttempted(true)
    setStatus({ kind: "error", text: t("form.checkFields") })
    setFocusRequest((n) => n + 1)
    return false
  }

  const keyNeeded = definition.apiKey && isVisible(definition.apiKey, values) && !plugin.keys_set.includes(definition.apiKey.key) ? definition.apiKey.key : null
  const service = knownKeys.find(({ key }) => key === keyNeeded)?.service ?? keyNeeded

  const show = async () => {
    if (busy || !ready()) return
    setStatus({ kind: "busy", text: t("form.sending") })
    try {
      await showOnScreen(plugin.id, entries())
      setScreenVersion(Date.now())
      setStatus({ kind: "done", text: t("form.onScreen") })
    } catch (error) {
      setStatus({ kind: "error", text: failureText(error, t, "form.showRefused") })
    }
  }

  const save = async () => {
    if (busy || !instance || !ready()) return
    setStatus({ kind: "busy", text: t("settings.saving") })
    const sent = values
    try {
      await saveInstance(plugin.id, instance, entries())
    } catch (error) {
      setStatus({ kind: "error", text: failureText(error, t, "error.refused") })
      return
    }
    try {
      // Les fichiers envoyés ont maintenant une adresse sur l'appareil : seul le serveur la connaît.
      const fresh = initialValues(definition, params, (await getPlugin(plugin.id, instance)).settings)
      setBaseline(fresh)
      setValues((current) => (toDraft(current) === toDraft(sent) ? fresh : current))
    } catch {
      setBaseline(sent)
    }
    setDraftNotice(false)
    setAttempted(false)
    setStatus({ kind: "done", text: t("form.saved") })
  }

  const canOpenDialog = () => !busy && ready()
  return (
    <FormProvider value={context}>
      <UnsavedGuard dirty={hasNewFiles(values)} />
      <a
        href="#plugin-actions"
        onClick={(event) => {
          event.preventDefault()
          document.querySelector<HTMLElement>("#plugin-actions button")?.focus()
        }}
        className="sr-only focus:not-sr-only focus:mt-2 focus:inline-block focus:rounded-[var(--radius)] focus:bg-card focus:p-2 focus:text-sm"
      >
        {t("form.skipToActions")}
      </a>
      <div className="mt-6 grid items-start gap-8 lg:grid-cols-[minmax(0,520px)_minmax(0,1fr)] lg:gap-12">
        <form id="plugin-form" noValidate onSubmit={(event) => event.preventDefault()} className="grid gap-7">
          {draftNotice ? (
            <div role="status" className="flex flex-wrap items-center justify-between gap-2 rounded-[var(--radius)] border border-border bg-card py-2 pr-2 pl-3 text-sm">
              <span>{t("form.draftRestored")}</span>
              <Button type="button" variant="ghost" className="min-h-10" onClick={() => { setValues(baseline); setDraftNotice(false); setAttempted(false); setStatus(null) }}>{t("form.discardDraft")}</Button>
            </div>
          ) : null}
          {keyNeeded ? (
            <p role="status" className="flex items-start gap-2 rounded-[var(--radius)] border border-border bg-card p-3 text-sm">
              <span className="mt-1.5 size-2 shrink-0 rounded-full bg-[var(--warn)]" aria-hidden="true" />
              <span>{t("form.keyNeeded", { service: service ?? "" })} <Link href="/api-keys" className="underline underline-offset-4">{t("form.addKey")}</Link></span>
            </p>
          ) : null}
          {sectionsOf(definition, params).map((section, index) => (
            <section key={section.title ?? index} className="grid gap-4">
              {section.title ? <h2 className="text-lg leading-snug font-semibold">{t(section.title)}</h2> : null}
              <FieldList fields={section.fields} />
            </section>
          ))}
          {sectionsOf(definition, params).every((section) => section.fields.length === 0) ? <p className="text-muted-foreground">{t("form.nothingToSet")}</p> : null}
          {definition.notice ? <p className="text-sm text-muted-foreground">{t(definition.notice)}</p> : null}
        </form>

        <aside className="grid gap-3 lg:sticky lg:top-[84px]" aria-label={t("form.actions")}>
          <ScreenImage version={screenVersion} />
          <div id="plugin-actions" className="grid gap-2 border-border bg-card max-lg:fixed max-lg:inset-x-0 max-lg:bottom-0 max-lg:z-30 max-lg:border-t max-lg:px-4 max-lg:py-2 lg:bg-transparent">
            <p role={status?.kind === "error" ? "alert" : "status"} className={`flex items-start gap-2 text-sm empty:hidden ${status?.kind === "error" ? "text-destructive" : "text-muted-foreground"}`}>
              {status?.kind === "busy" ? <LoaderCircleIcon className="mt-0.5 size-4 shrink-0 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : null}
              {status?.kind === "done" ? <CheckIcon className="mt-0.5 size-4 shrink-0" aria-hidden="true" /> : null}
              {status?.text}
            </p>
            {instance ? (
              <div className="grid grid-cols-2 gap-2">
                <Button className="min-h-10" aria-busy={busy} onClick={() => void save()}>{t("action.save")}</Button>
                <Button id="action-saveAs" variant="outline" className="min-h-10" onClick={() => { if (canOpenDialog()) setDialog("saveAs") }}>{t("form.saveAs")}</Button>
                <Button id="action-schedule" variant="outline" className="col-span-2 min-h-10" onClick={() => { if (!busy) setDialog("schedule") }}>{t("form.schedule")}</Button>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <Button className="min-h-10" aria-busy={busy} onClick={() => void show()}>{t("form.show")}</Button>
                <Button id="action-add" variant="outline" className="min-h-10" onClick={() => { if (canOpenDialog()) setDialog("add") }}>{t("form.add")}</Button>
              </div>
            )}
          </div>
        </aside>
      </div>

      {dialog === "add" || dialog === "saveAs" ? (
        <PlaylistDialog
          plugin={plugin}
          title={t(dialog === "add" ? "form.addTitle" : "form.saveAsTitle")}
          description={t("form.addHelp")}
          confirm={t(dialog === "add" ? "form.add" : "action.save")}
          opener={`action-${dialog}`}
          entries={entries}
          onClose={() => setDialog(null)}
          onDone={(name, playlist) => {
            setDialog(null)
            if (!instance) {
              setBaseline(values)
              setDraftNotice(false)
            }
            setAttempted(false)
            setStatus({ kind: "done", text: t("form.addedTo", { name, playlist }) })
          }}
        />
      ) : null}
      {dialog === "schedule" && instance ? (
        <ScheduleDialog
          plugin={plugin}
          instance={instance}
          current={refresh}
          onClose={() => setDialog(null)}
          onDone={(next) => {
            setRefresh(next)
            setDialog(null)
            setStatus({ kind: "done", text: t("form.scheduleSaved") })
          }}
        />
      ) : null}
    </FormProvider>
  )
}

/** Un plugin sans description garde son ancien formulaire. */
function OldForm({ id, search }: { id: string; search: string }) {
  useEffect(() => {
    window.location.replace(`/plugin/${encodeURIComponent(id)}${search ? `?${search}` : ""}`)
  }, [id, search])
  return <Loading />
}

function PluginContent({ id, instance, definition }: { id: string; instance: string | null; definition: Definition }) {
  const { t } = useI18n()
  const load = useCallback((signal: AbortSignal) => getPlugin(id, instance, signal), [id, instance])
  const { data, failed, retry } = useResource(load)
  const name = data ? pluginLabel(t, data.id, data.name) : null
  const title = data?.instance ?? name ?? t("nav.plugins")
  return (
    <Shell title={title} current="nav.plugins">
      <Link href="/plugins" className="-ml-0.5 inline-flex min-h-10 items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"><ArrowLeftIcon className="size-4" aria-hidden="true" />{t("nav.plugins")}</Link>
      {data ? (
        <>
          <h1 className="mt-1 text-[1.625rem] leading-tight font-semibold [overflow-wrap:anywhere]">{title}</h1>
          {data.instance ? <p className="mt-1 text-muted-foreground">{name}</p> : null}
          <PluginForm plugin={data} definition={definition} />
        </>
      ) : failed ? <div className="mt-4"><LoadFailed title={t("plugins.formFailed")} onRetry={retry} /></div> : <div className="mt-4"><Loading /></div>}
    </Shell>
  )
}

export function PluginPage() {
  const { id = "" } = useParams<{ id: string }>()
  const search = useSearch()
  const instance = new URLSearchParams(search).get("instance")
  const definition = Object.hasOwn(definitions, id) ? definitions[id] : undefined
  // Une autre entrée repart de zéro : garder l'état de la précédente l'écraserait à l'enregistrement.
  return definition ? <PluginContent key={`${id}:${instance ?? ""}`} id={id} instance={instance} definition={definition} /> : <OldForm id={id} search={search} />
}
