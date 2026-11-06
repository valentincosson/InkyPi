import { useEffect, useRef, useState } from "react"
import { CheckIcon, LoaderCircleIcon, MoreHorizontalIcon, PlusIcon } from "lucide-react"
import { Link, useLocation } from "wouter"
import { ApiError, createPlaylist, deleteEntry, deletePlaylist, getPlaylists, refreshInstance, savePlaylistOrder, updatePlaylist, type PlaylistEntry, type PlaylistsData, type PlaylistSummary } from "@/api"
import { ActionDialog } from "@/components/action-dialog"
import { Choice } from "@/components/choice"
import { ConfirmDialog } from "@/components/confirm-dialog"
import { DayPlan } from "@/components/day-plan"
import { InstanceImage } from "@/components/instance-image"
import { LoadFailed, Loading } from "@/components/page-state"
import { EmptyScreenArt } from "@/components/plugin-art"
import { ReorderList } from "@/components/reorder-list"
import { Shell } from "@/components/shell"
import { Button, buttonVariants } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { refreshFromStored } from "@/forms/refresh"
import { hasForm, pluginLabel } from "@/forms/registry"
import { ScheduleDialog } from "@/forms/schedule-dialog"
import { formatRefresh } from "@/format"
import { useI18n } from "@/i18n"
import { activeAt, emptyTakeovers, formatClock, minutesInZone, playlistNameError, refreshRule, timeOptions, windowError } from "@/playlists"
import { saveErrorMessage } from "@/save-error"
import { useResource } from "@/use-resource"

const outlineLink = `${buttonVariants({ variant: "outline" })} min-h-10`
const entryKey = (entry: PlaylistEntry) => `${entry.plugin_id}:${entry.instance}`
const formPath = (entry: PlaylistEntry) => `/plugin/${encodeURIComponent(entry.plugin_id)}?instance=${encodeURIComponent(entry.instance)}`

type Sending = { key: string; kind: "busy" | "done" | "error"; text: string } | null
type Dialog =
  | { kind: "create" }
  | { kind: "edit"; playlist: PlaylistSummary; opener: string }
  | { kind: "deletePlaylist"; playlist: PlaylistSummary; opener: string }
  | { kind: "deleteEntry"; playlist: PlaylistSummary; entry: PlaylistEntry; heading: string }
  | { kind: "schedule"; entry: PlaylistEntry; opener: string }
  | null

function useDeviceMinutes(timezone: string | undefined) {
  const [minutes, setMinutes] = useState(() => (timezone ? minutesInZone(new Date(), timezone) : 0))
  useEffect(() => {
    if (!timezone) return
    const tick = () => setMinutes(minutesInZone(new Date(), timezone))
    tick()
    const timer = window.setInterval(tick, 30_000)
    return () => window.clearInterval(timer)
  }, [timezone])
  return minutes
}

function EntrySummary({ entry, line, onScreen }: { entry: PlaylistEntry; line?: string; onScreen?: boolean }) {
  const { t } = useI18n()
  return (
    <>
      <span className="block w-20 shrink-0 overflow-hidden rounded-[calc(var(--radius)-2px)] shadow-[0_0_0_1px_var(--border)] sm:w-24">
        <InstanceImage url={entry.image_url} pluginId={entry.plugin_id} />
      </span>
      <span className="min-w-0">
        <span className="flex flex-wrap items-center gap-x-2.5">
          <span className="text-sm font-medium [overflow-wrap:anywhere] group-hover:underline group-hover:underline-offset-4">{entry.instance}</span>
          {onScreen ? <span className="flex items-center gap-1.5 text-xs font-medium"><span className="size-2 rounded-full bg-[var(--ring)]" aria-hidden="true" />{t("form.onScreen")}</span> : null}
        </span>
        {line ? <span className="mt-0.5 block text-xs text-muted-foreground [overflow-wrap:anywhere]">{line}</span> : null}
      </span>
    </>
  )
}

function EntryRow({ entry, id, line, running, onScreen, stale, sending, onShow, onEdit, onSchedule, onDelete }: { entry: PlaylistEntry; id: string; line: string; running: boolean; onScreen: boolean; stale: boolean; sending: Sending; onShow: () => void; onEdit: () => void; onSchedule: () => void; onDelete: () => void }) {
  const { t } = useI18n()
  // « À l'écran » ne vaut que tant que c'est vrai : le moteur a pu passer à l'entrée suivante depuis. Si la liste n'a pas pu être relue, l'envoi reste le dernier fait connu.
  const mine = sending?.key === entryKey(entry) && (sending.kind !== "done" || onScreen || stale) ? sending : null
  const summary = <EntrySummary entry={entry} line={line} onScreen={onScreen} />
  const linkClass = "group flex min-w-0 flex-1 items-center gap-3"
  return (
    <li className="px-3 py-2.5">
      <div className="flex items-center gap-2">
        {!entry.installed
          ? <div className="flex min-w-0 flex-1 items-center gap-3">{summary}</div>
          : hasForm(entry.plugin_id)
            ? <Link href={formPath(entry)} className={linkClass}>{summary}</Link>
            : <a href={formPath(entry)} className={linkClass}>{summary}</a>}
        <DropdownMenu>
          <DropdownMenuTrigger id={id} render={<Button variant="ghost" size="icon" className="size-10 shrink-0" aria-label={t("playlists.more", { name: entry.instance })} />}>
            <MoreHorizontalIcon aria-hidden="true" />
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            {running && entry.installed ? <DropdownMenuItem disabled={sending?.kind === "busy"} onClick={onShow}>{t("playlists.showNow")}</DropdownMenuItem> : null}
            {entry.installed ? <DropdownMenuItem onClick={onEdit}>{t("playlists.editEntry")}</DropdownMenuItem> : null}
            {entry.installed ? <DropdownMenuItem onClick={onSchedule}>{t("playlists.scheduleEntry")}</DropdownMenuItem> : null}
            <DropdownMenuItem variant="destructive" onClick={onDelete}>{t("playlists.deleteEntry")}</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {mine ? (
        <p role={mine.kind === "error" ? "alert" : "status"} className={`mt-2 flex items-start gap-2 text-sm ${mine.kind === "error" ? "text-destructive" : "text-muted-foreground"}`}>
          {mine.kind === "busy" ? <LoaderCircleIcon className="mt-0.5 size-4 shrink-0 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : null}
          {mine.kind === "done" ? <CheckIcon className="mt-0.5 size-4 shrink-0" aria-hidden="true" /> : null}
          {mine.text}
        </p>
      ) : null}
    </li>
  )
}

function Reordering({ playlist, onDone, onCancel }: { playlist: PlaylistSummary; onDone: () => Promise<void>; onCancel: () => void }) {
  const { t } = useI18n()
  const [items, setItems] = useState(() => playlist.entries.map((entry) => ({ ...entry, id: encodeURIComponent(entryKey(entry)), label: entry.instance })))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const help = useRef<HTMLParagraphElement>(null)
  useEffect(() => help.current?.focus(), [])

  const save = async () => {
    if (saving) return
    setSaving(true)
    setError("")
    try {
      await savePlaylistOrder(playlist.name, items.map(({ plugin_id, instance }) => ({ plugin_id, instance })))
      await onDone()
    } catch (reason) {
      setError(saveErrorMessage(reason, t))
      setSaving(false)
    }
  }
  return (
    <div className="mt-3 grid gap-3">
      <p ref={help} tabIndex={-1} className="text-sm text-muted-foreground outline-none">{t("playlists.reorderHelp")}</p>
      <ReorderList items={items} onChange={setItems} render={(item) => <span className="flex items-center gap-3"><EntrySummary entry={item} /></span>} />
      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="outline" className="min-h-10" disabled={saving} onClick={onCancel}>{t("action.cancel")}</Button>
        <Button className="min-h-10" aria-busy={saving} onClick={() => void save()}>{t("plugins.saveOrder")}</Button>
      </div>
    </div>
  )
}

function PlaylistDialog({ playlist, others, data, opener, onClose, onSaved, onDelete }: { playlist: PlaylistSummary | null; others: string[]; data: PlaylistsData; opener: string; onClose: () => void; onSaved: (name: string) => Promise<void>; onDelete?: () => void }) {
  const { t, language } = useI18n()
  const [name, setName] = useState(playlist?.name ?? "")
  // Une nouvelle playlist sur toute la journée ne passerait jamais devant celles qui existent déjà.
  const [start, setStart] = useState(playlist?.start_time ?? (others.length ? "09:00" : "00:00"))
  const [end, setEnd] = useState(playlist?.end_time ?? (others.length ? "17:00" : "24:00"))
  // La liste part de l'heure enregistrée et ne change pas ensuite : retirer l'heure en cours d'une liste ouverte viderait le champ.
  const options = (side: "start" | "end", stored: string) => timeOptions(side, stored).map((value) => ({ value, label: formatClock(value, data.device.time_format, language) }))
  return (
    <ActionDialog
      title={t(playlist ? "playlists.editTitle" : "playlists.createTitle")}
      description={t(playlist ? "playlists.editHelp" : "playlists.createHelp")}
      confirm={t(playlist ? "action.save" : "playlists.create")}
      opener={opener}
      firstField="playlist-name"
      aside={onDelete ? <Button type="button" variant="destructive" className="min-h-10 w-full sm:w-auto" onClick={onDelete}>{t("action.delete")}</Button> : null}
      onClose={onClose}
      onSubmit={async () => {
        const invalid = playlistNameError(name, others) ?? windowError(start, end)
        if (invalid) return t(invalid)
        const clean = name.trim()
        try {
          if (playlist) await updatePlaylist(playlist.name, clean, start, end)
          else await createPlaylist(clean, start, end)
          await onSaved(clean)
          return null
        } catch (error) {
          return saveErrorMessage(error, t)
        }
      }}
    >
      <Field><FieldLabel htmlFor="playlist-name">{t("playlists.name")}</FieldLabel><Input id="playlist-name" className="min-h-10" autoComplete="off" value={name} onChange={(event) => setName(event.target.value)} /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field><FieldLabel htmlFor="playlist-start">{t("playlists.from")}</FieldLabel><Choice long id="playlist-start" value={start} onChange={setStart} options={options("start", playlist?.start_time ?? "00:00")} /></Field>
        <Field><FieldLabel htmlFor="playlist-end">{t("playlists.to")}</FieldLabel><Choice long id="playlist-end" value={end} onChange={setEnd} options={options("end", playlist?.end_time ?? "24:00")} /></Field>
      </div>
    </ActionDialog>
  )
}

function Playlists({ data, reload, stale }: { data: PlaylistsData; reload: () => Promise<void>; stale: boolean }) {
  const { t, language } = useI18n()
  const [, navigate] = useLocation()
  const minutes = useDeviceMinutes(data.device.timezone)
  const [dialog, setDialog] = useState<Dialog>(null)
  const [deleting, setDeleting] = useState({ busy: false, error: "" })
  const [sending, setSending] = useState<Sending>(null)
  const [message, setMessage] = useState("")
  const [reordering, setReordering] = useState<string | null>(null)
  // Sans moteur, la journée reste un plan : rien n'est actif.
  const active = data.running ? activeAt(data.day, minutes) : null
  const frozen = emptyTakeovers(data.day, data.playlists)
  const names = data.playlists.map(({ name }) => name)
  const formatting = { timezone: data.device.timezone, timeFormat: data.device.time_format, language }

  const clock = (time: string) => formatClock(time, data.device.time_format, language)
  const entryLine = (entry: PlaylistEntry) => {
    const rule = refreshRule(entry.refresh)
    return entry.installed
      ? [pluginLabel(t, entry.plugin_id, entry.plugin_name), rule ? t(rule[0], rule[1].time ? { time: clock(rule[1].time) } : rule[1]) : null, entry.refreshed_at ? t("playlists.lastImage", { time: formatRefresh(entry.refreshed_at, formatting) }) : null].filter(Boolean).join(", ")
      : t("playlists.pluginGone")
  }

  const show = async (playlist: PlaylistSummary, entry: PlaylistEntry) => {
    if (sending?.kind === "busy") return
    const key = entryKey(entry)
    setMessage("")
    setSending({ key, kind: "busy", text: t("form.sending") })
    try {
      await refreshInstance(playlist.name, entry.plugin_id, entry.instance)
      await reload()
      setSending({ key, kind: "done", text: t("form.onScreen") })
    } catch (error) {
      setSending({ key, kind: "error", text: error instanceof ApiError ? t("form.showRefused", { reason: error.message }) : t("form.unreachable") })
    }
  }

  const confirmDelete = async (send: () => Promise<unknown>, done: string, focus: string) => {
    if (deleting.busy) return
    setDeleting({ busy: true, error: "" })
    try {
      await send()
      await reload()
      setDialog(null)
      setDeleting({ busy: false, error: "" })
      setSending(null)
      setMessage(done)
      document.getElementById(focus)?.focus()
    } catch (error) {
      setDeleting({ busy: false, error: saveErrorMessage(error, t) })
    }
  }

  const closeConfirm = () => {
    // Renoncer à supprimer une playlist ramène à sa fenêtre, d'où la question est venue.
    setDialog(dialog?.kind === "deletePlaylist" ? { kind: "edit", playlist: dialog.playlist, opener: dialog.opener } : null)
    setDeleting({ busy: false, error: "" })
  }

  return (
    <>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 id="playlists-title" tabIndex={-1} className="text-[1.625rem] leading-tight font-semibold outline-none">{t("nav.playlists")}</h1>
        <div className="flex flex-wrap gap-2">
          {data.playlists.length ? <Link href="/plugins" className={outlineLink} data-slot="button" data-variant="outline">{t("playlists.addPlugin")}</Link> : null}
          <Button id="new-playlist" className="min-h-10" onClick={() => setDialog({ kind: "create" })}><PlusIcon data-icon="inline-start" aria-hidden="true" />{t("playlists.new")}</Button>
        </div>
      </div>

      <div role="status" className="text-sm text-muted-foreground empty:hidden">{message ? <p className="mb-4 flex items-start gap-2"><CheckIcon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />{message}</p> : null}</div>
      {stale ? <p role="alert" className="mb-4 text-sm text-destructive">{t("screen.outdated")}</p> : null}
      {!data.running ? (
        <p className="mb-4 flex items-start gap-2 text-sm text-muted-foreground">
          <span className="mt-1.5 size-2 shrink-0 rounded-full bg-[var(--warn)]" aria-hidden="true" />
          <span>{t("playlists.notRunning")} <Link href="/settings" className="underline underline-offset-4 hover:text-foreground">{t("nav.settings")}</Link></span>
        </p>
      ) : null}

      {data.playlists.length === 0 ? (
        <div className="rounded-[var(--radius)] border border-dashed border-input px-6 py-16 text-center">
          <EmptyScreenArt className="mx-auto mb-4 max-w-48" />
          <p className="text-lg font-semibold">{t("playlists.noneTitle")}</p>
          <p className="mt-1 text-muted-foreground">{t("playlists.noneBody")}</p>
        </div>
      ) : (
        <>
          <DayPlan data={data} minutes={minutes} />
          {data.playlists.map((playlist, index) => {
            const heading = `playlist-${index}`
            const isReordering = reordering === playlist.name
            return (
              <section key={playlist.name} className="mt-9" aria-labelledby={heading}>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                  <h2 id={heading} tabIndex={-1} className="min-w-0 text-lg font-semibold [overflow-wrap:anywhere] outline-none">{playlist.name}</h2>
                  {active === playlist.name ? <span className="flex items-center gap-1.5 text-xs font-medium"><span className="size-2 rounded-full bg-[var(--ring)]" aria-hidden="true" />{t("playlists.activeNow")}</span> : null}
                  {isReordering ? null : (
                    <div className="ml-auto flex gap-2">
                      {playlist.entries.length > 1 ? <Button id={`${heading}-reorder`} variant="outline" className="min-h-10" aria-label={t("playlists.reorderNamed", { name: playlist.name })} onClick={() => { setMessage(""); setReordering(playlist.name) }}>{t("playlists.reorder")}</Button> : null}
                      <Button id={`${heading}-edit`} variant="outline" className="min-h-10" aria-label={t("playlists.editNamed", { name: playlist.name })} onClick={() => setDialog({ kind: "edit", playlist, opener: `${heading}-edit` })}>{t("playlists.edit")}</Button>
                    </div>
                  )}
                </div>
                {isReordering ? (
                  <Reordering
                    key={playlist.entries.map(entryKey).join()}
                    playlist={playlist}
                    onCancel={() => {
                      setReordering(null)
                      window.setTimeout(() => document.getElementById(`${heading}-reorder`)?.focus())
                    }}
                    onDone={async () => {
                      await reload()
                      setReordering(null)
                      setMessage(t("playlists.orderSaved"))
                      window.setTimeout(() => document.getElementById(`${heading}-reorder`)?.focus())
                    }}
                  />
                ) : playlist.entries.length === 0 ? (
                  <div className="mt-3 rounded-[var(--radius)] border border-dashed border-input p-6 text-center">
                    <p className="text-muted-foreground">
                      {t("playlists.emptyList")}
                      {frozen.some((piece) => piece.playlist === playlist.name) ? ` ${t("playlists.emptyListFrozen")}` : ""}
                    </p>
                    <Link id={`${heading}-add`} href="/plugins" className={`${outlineLink} mt-3`} data-slot="button" data-variant="outline">{t("playlists.addPlugin")}</Link>
                  </div>
                ) : (
                  <ol className="mt-3 divide-y divide-border rounded-[var(--radius)] border border-border bg-card">
                    {playlist.entries.map((entry, position) => {
                      const menu = `${heading}-entry-${position}`
                      return (
                        <EntryRow
                          key={entryKey(entry)}
                          entry={entry}
                          id={menu}
                          line={entryLine(entry)}
                          running={data.running}
                          stale={stale}
                          onScreen={data.on_screen?.plugin_id === entry.plugin_id && data.on_screen.instance === entry.instance}
                          sending={sending}
                          onShow={() => void show(playlist, entry)}
                          onEdit={() => { if (hasForm(entry.plugin_id)) navigate(formPath(entry)); else window.location.assign(formPath(entry)) }}
                          onSchedule={() => setDialog({ kind: "schedule", entry, opener: menu })}
                          onDelete={() => setDialog({ kind: "deleteEntry", playlist, entry, heading })}
                        />
                      )
                    })}
                  </ol>
                )}
              </section>
            )
          })}
        </>
      )}

      {dialog?.kind === "create" || dialog?.kind === "edit" ? (
        <PlaylistDialog
          key={dialog.kind}
          playlist={dialog.kind === "edit" ? dialog.playlist : null}
          others={names.filter((name) => dialog.kind !== "edit" || name !== dialog.playlist.name)}
          data={data}
          opener={dialog.kind === "edit" ? dialog.opener : "new-playlist"}
          onClose={() => setDialog(null)}
          onDelete={dialog.kind === "edit" ? () => setDialog({ kind: "deletePlaylist", playlist: dialog.playlist, opener: dialog.opener }) : undefined}
          onSaved={async (name) => {
            await reload()
            setMessage(dialog.kind === "edit" ? t("playlists.saved") : t("playlists.created", { name }))
            setDialog(null)
            if (dialog.kind === "create") {
              // Une nouvelle playlist se range en dernier et démarre vide : le focus l'amène à l'écran, sur ce qui la remplit.
              const add = `playlist-${data.playlists.length}-add`
              window.setTimeout(() => document.getElementById(add)?.focus())
            }
          }}
        />
      ) : null}
      {dialog?.kind === "schedule" ? (
        <ScheduleDialog
          pluginId={dialog.entry.plugin_id}
          instance={dialog.entry.instance}
          current={refreshFromStored(dialog.entry.refresh)}
          opener={dialog.opener}
          onClose={() => setDialog(null)}
          onDone={() => {
            void reload()
            setMessage(t("form.scheduleSaved"))
            setDialog(null)
          }}
        />
      ) : null}
      <ConfirmDialog
        open={dialog?.kind === "deleteEntry"}
        title={dialog?.kind === "deleteEntry" ? t("playlists.deleteEntryTitle", { name: dialog.entry.instance }) : ""}
        body={dialog?.kind === "deleteEntry"
          ? [t("playlists.deleteEntryBody", { playlist: dialog.playlist.name }), data.on_screen?.plugin_id === dialog.entry.plugin_id && data.on_screen.instance === dialog.entry.instance ? t("playlists.deleteEntryOnScreen") : ""].join(" ").trim()
          : ""}
        confirm={t("action.delete")}
        cancel={t("action.cancel")}
        destructive
        busy={deleting.busy}
        error={deleting.error}
        onClose={closeConfirm}
        onConfirm={() => {
          if (dialog?.kind !== "deleteEntry") return
          const { playlist, entry, heading } = dialog
          void confirmDelete(() => deleteEntry(playlist.name, entry.plugin_id, entry.instance), t("playlists.entryDeleted", { name: entry.instance }), heading)
        }}
      />
      <ConfirmDialog
        open={dialog?.kind === "deletePlaylist"}
        title={dialog?.kind === "deletePlaylist" ? t("playlists.deleteTitle", { name: dialog.playlist.name }) : ""}
        body={dialog?.kind === "deletePlaylist"
          ? dialog.playlist.entries.length === 0 ? t("playlists.deleteBodyEmpty")
            : dialog.playlist.entries.length === 1 ? t("playlists.deleteBodyOne")
              : t("playlists.deleteBodyMany", { count: String(dialog.playlist.entries.length) })
          : ""}
        confirm={t("action.delete")}
        cancel={t("action.cancel")}
        destructive
        busy={deleting.busy}
        error={deleting.error}
        onClose={closeConfirm}
        onConfirm={() => {
          if (dialog?.kind !== "deletePlaylist") return
          const { playlist } = dialog
          void confirmDelete(() => deletePlaylist(playlist.name), t("playlists.deleted", { name: playlist.name }), "playlists-title")
        }}
      />
    </>
  )
}

export function PlaylistsPage() {
  const { t } = useI18n()
  const { data, failed, retry, reload } = useResource(getPlaylists)

  // Au retour sur l'onglet, l'écran a pu changer.
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === "visible") void reload()
    }
    document.addEventListener("visibilitychange", refresh)
    return () => document.removeEventListener("visibilitychange", refresh)
  }, [reload])

  return (
    <Shell title={t("nav.playlists")} current="nav.playlists">
      {data
        ? <Playlists data={data} reload={reload} stale={failed} />
        : failed ? <LoadFailed title={t("playlists.loadFailed")} onRetry={retry} /> : <Loading />}
    </Shell>
  )
}
