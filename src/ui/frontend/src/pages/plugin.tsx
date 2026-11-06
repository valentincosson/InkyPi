import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { ArrowLeftIcon, CheckIcon, LoaderCircleIcon } from "lucide-react"
import { Link, useParams, useSearch } from "wouter"
import { addToPlaylist, ApiError, getPlugin, previewImage, saveInstance, showOnScreen, type PluginData } from "@/api"
import { knownKeys } from "@/api-keys"
import { ActionDialog } from "@/components/action-dialog"
import { Choice } from "@/components/choice"
import { LoadFailed, Loading } from "@/components/page-state"
import { PluginPreview, type PreviewImage } from "@/components/plugin-preview"
import { Shell } from "@/components/shell"
import { UnsavedGuard } from "@/components/unsaved-guard"
import { Button } from "@/components/ui/button"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { definitions } from "@/forms/definitions"
import { pluginLabel } from "@/forms/registry"
import { fromDraft, initialValues, isVisible, sectionsOf, signatureOf, toDraft, toEntries, validate } from "@/forms/engine"
import { FieldList, FormProvider } from "@/forms/fields"
import { instanceNameError, refreshError, refreshFromStored, suggestedName, toRefreshSettings, type RefreshValues } from "@/forms/refresh"
import { RefreshFields, ScheduleDialog } from "@/forms/schedule-dialog"
import type { Definition, FileValue, FormValues, Value } from "@/forms/types"
import { useI18n } from "@/i18n"
import type { Key } from "@/i18n/translate"
import { useResource } from "@/use-resource"

type Status = { kind: "busy"; text: string } | { kind: "done"; text: string } | { kind: "error"; text: string } | null

function failureText(error: unknown, t: (key: Key, params?: Record<string, string>) => string, refused: Key) {
  return error instanceof ApiError ? t(refused, { reason: error.message }) : t("form.unreachable")
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
  const [preview, setPreview] = useState<PreviewImage | null>(() => (
    plugin.saved_image ? { url: plugin.saved_image.url, date: plugin.saved_image.refreshed_at, source: "saved", signature: signatureOf(toEntries(definition, initial, params)) } : null
  ))
  const [updatingPreview, setUpdatingPreview] = useState(false)
  const [previewError, setPreviewError] = useState("")
  const previewRequest = useRef<AbortController | null>(null)
  const sending = status?.kind === "busy"
  // Un Pi ne fait qu'une chose à la fois : le reste attend la fin de l'aperçu.
  const busy = sending || updatingPreview
  const signature = useMemo(() => signatureOf(toEntries(definition, values, params)), [definition, values, params])

  const stale = preview !== null && preview.signature !== signature

  const previewUrl = preview?.url
  useEffect(() => () => {
    if (previewUrl?.startsWith("blob:")) URL.revokeObjectURL(previewUrl)
  }, [previewUrl])
  useEffect(() => () => previewRequest.current?.abort(), [])

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
  const clearStatus = useCallback(() => {
    setStatus((current) => (current?.kind === "busy" ? current : null))
    setPreviewError("")
  }, [])
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

  const updatePreview = async () => {
    if (busy || !ready()) return
    setStatus(null)
    setPreviewError("")
    setUpdatingPreview(true)
    const request = new AbortController()
    previewRequest.current = request
    try {
      const image = await previewImage(plugin.id, entries(), request.signal)
      if (request.signal.aborted) return
      setPreview({ url: URL.createObjectURL(image), source: "fresh", signature })
    } catch (error) {
      if (!request.signal.aborted) setPreviewError(failureText(error, t, "preview.refused"))
    } finally {
      setUpdatingPreview(false)
    }
  }

  const updateFromBar = () => {
    if (busy || !ready()) return
    // Ce bouton va disparaître : le focus et le regard rejoignent l'aperçu.
    document.getElementById("action-preview")?.focus({ preventScroll: true })
    document.getElementById("plugin-preview")?.scrollIntoView()
    void updatePreview()
  }

  const show = async () => {
    if (busy || !ready()) return
    setPreviewError("")
    setStatus({ kind: "busy", text: t("form.sending") })
    try {
      await showOnScreen(plugin.id, entries())
      // L'écran vient de recevoir ces réglages : inutile de les générer une seconde fois pour les montrer.
      setPreview({ url: `/api/current_image?v=${Date.now()}`, source: "fresh", signature })
      setStatus({ kind: "done", text: t("form.onScreen") })
    } catch (error) {
      setStatus({ kind: "error", text: failureText(error, t, "form.showRefused") })
    }
  }

  const save = async () => {
    if (busy || !instance || !ready()) return
    setPreviewError("")
    setStatus({ kind: "busy", text: t("settings.saving") })
    const sent = values
    const sentSignature = signature
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
      // Un fichier envoyé revient avec son adresse sur l'appareil : l'image reste celle de ces réglages.
      setPreview((current) => (current?.signature === sentSignature ? { ...current, signature: signatureOf(toEntries(definition, fresh, params)) } : current))
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
          document.getElementById("action-preview")?.focus()
        }}
        className="sr-only focus:not-sr-only focus:mt-2 focus:inline-block focus:rounded-[var(--radius)] focus:bg-card focus:p-2 focus:text-sm"
      >
        {t("form.skipToActions")}
      </a>
      <div className="mt-6 grid grid-cols-[minmax(0,1fr)] items-start gap-8 lg:grid-cols-[minmax(0,520px)_minmax(0,1fr)] lg:gap-12">
        <form id="plugin-form" noValidate onSubmit={(event) => event.preventDefault()} className="grid gap-7 max-lg:order-1">
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
          <PluginPreview
            pluginId={plugin.id}
            name={instance ?? pluginLabel(t, plugin.id, plugin.name)}
            image={preview}
            device={plugin.device}
            stale={stale}
            updating={updatingPreview}
            blocked={sending}
            error={previewError}
            note={definition.previewNote}
            onUpdate={() => void updatePreview()}
            onImageFailed={() => setPreview(null)}
          />
          <div id="plugin-actions" className="grid gap-2 border-border bg-card max-lg:fixed max-lg:inset-x-0 max-lg:bottom-0 max-lg:z-30 max-lg:border-t max-lg:px-4 max-lg:py-2 lg:bg-transparent">
            {stale && !updatingPreview ? (
              // Sur téléphone, l'aperçu est hors de vue pendant qu'on règle : son état reste à portée de main.
              <div className="flex items-center justify-between gap-2 lg:hidden">
                <span className="flex items-center gap-2 text-sm"><span className="size-2 shrink-0 rounded-full bg-[var(--warn)]" aria-hidden="true" />{t("preview.outOfDate")}</span>
                <Button variant="outline" className="min-h-10" aria-disabled={busy} onClick={updateFromBar}>{t("preview.update")}</Button>
              </div>
            ) : null}
            <p role={status?.kind === "error" ? "alert" : "status"} className={`flex items-start gap-2 text-sm [overflow-wrap:anywhere] empty:hidden ${status?.kind === "error" ? "text-destructive" : "text-muted-foreground"}`}>
              {status?.kind === "busy" ? <LoaderCircleIcon className="mt-0.5 size-4 shrink-0 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : null}
              {status?.kind === "done" ? <CheckIcon className="mt-0.5 size-4 shrink-0" aria-hidden="true" /> : null}
              {status?.text}
            </p>
            {instance ? (
              <div className="grid grid-cols-2 gap-2">
                <Button className="min-h-10" aria-busy={sending} aria-disabled={updatingPreview} onClick={() => void save()}>{t("action.save")}</Button>
                <Button id="action-saveAs" variant="outline" className="min-h-10" aria-disabled={updatingPreview} onClick={() => { if (canOpenDialog()) setDialog("saveAs") }}>{t("form.saveAs")}</Button>
                <Button id="action-schedule" variant="outline" className="col-span-2 min-h-10" aria-disabled={updatingPreview} onClick={() => { if (!busy) setDialog("schedule") }}>{t("form.schedule")}</Button>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <Button className="min-h-10" aria-busy={sending} aria-disabled={updatingPreview} onClick={() => void show()}>{t("form.show")}</Button>
                <Button id="action-add" variant="outline" className="min-h-10" aria-disabled={updatingPreview} onClick={() => { if (canOpenDialog()) setDialog("add") }}>{t("form.add")}</Button>
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
          pluginId={plugin.id}
          instance={instance}
          current={refresh}
          opener="action-schedule"
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
