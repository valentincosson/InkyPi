import { useCallback, useEffect, useState, type ReactNode } from "react"
import { CheckIcon, LoaderCircleIcon, PlusIcon, RefreshCwIcon, SkipForwardIcon } from "lucide-react"
import { Link } from "wouter"
import { Button, buttonVariants } from "@/components/ui/button"
import { focusContent } from "@/components/route-focus"
import { Shell } from "@/components/shell"
import { EmptyScreenArt, PluginArt } from "@/components/plugin-art"
import { ApiError, getState, refreshInstance, showNext, type UiState } from "@/api"
import { pluginLabel } from "@/forms/registry"
import { nextChange } from "@/rotation"
import { formatRefresh } from "@/format"
import { useI18n } from "@/i18n"

const REFRESH_EVERY_MS = 60_000
const heading = "text-[1.625rem] leading-tight font-semibold [overflow-wrap:anywhere] outline-none"
const notice = "rounded-[var(--radius)] border border-dashed border-input px-6 py-16 text-center"

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-border py-2.5 last:border-0">
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium [overflow-wrap:anywhere] tabular-nums">{children}</dd>
    </div>
  )
}

function CurrentImage({ url, alt }: { url: string; alt: string }) {
  const { t } = useI18n()
  const [failed, setFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const [size, setSize] = useState<{ width: number; height: number } | null>(null)
  const portrait = size !== null && size.height > size.width

  return (
    <div className={`device ${portrait ? "mx-auto max-w-[min(420px,100%)]" : ""}`}>
      {failed ? (
        <div className="flex aspect-[5/3] flex-col items-center justify-center gap-3 rounded-[4px] bg-card p-4 text-center" role="alert">
          <p className="font-medium">{t("screen.imageFailed")}</p>
          <Button variant="outline" className="min-h-10" onClick={() => { setFailed(false); setAttempt((n) => n + 1) }}>{t("error.retry")}</Button>
        </div>
      ) : (
        <img
          src={attempt ? `${url}&attempt=${attempt}` : url}
          alt={alt}
          style={portrait ? { aspectRatio: `${size.width} / ${size.height}` } : undefined}
          onLoad={(event) => setSize({ width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight })}
          onError={() => setFailed(true)}
        />
      )}
    </div>
  )
}

function UpNext({ state }: { state: UiState }) {
  const { t } = useI18n()
  const { rotation } = state
  return (
    <section className="mt-10" aria-labelledby="up-next">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="up-next" className="text-lg font-semibold">{t("screen.upNext")}</h2>
        <Link href="/plugins" className={`${buttonVariants({ variant: "outline" })} min-h-10`} data-slot="button" data-variant="outline"><PlusIcon data-icon="inline-start" aria-hidden="true" />{t("screen.addContent")}</Link>
      </div>
      {rotation.upcoming.length ? (
        <ol className="mt-3 grid grid-cols-2 gap-6 lg:grid-cols-4">
          {rotation.upcoming.map((item) => <UpcomingItem key={`${item.plugin_id}:${item.instance}`} item={item} />)}
        </ol>
      ) : (
        <p className="mt-3 text-muted-foreground">
          {rotation.playlist ? t("screen.playlistEmpty", { name: rotation.playlist }) : t("screen.noPlaylist")} <a href="/playlist" className="underline underline-offset-4 hover:text-foreground">{t("screen.openPlaylists")}</a>
        </p>
      )}
    </section>
  )
}

function UpcomingItem({ item }: { item: UiState["rotation"]["upcoming"][number] }) {
  const [failed, setFailed] = useState(false)
  return (
    <li>
      <Link href={`/plugin/${encodeURIComponent(item.plugin_id)}?instance=${encodeURIComponent(item.instance)}`} className="group block">
        <span className="block overflow-hidden rounded-[var(--radius)] shadow-[0_0_0_1px_var(--border)] transition-shadow group-hover:shadow-[0_0_0_1px_var(--input)]">
          {/* Une entrée qui n'a encore jamais tourné n'a pas d'image. */}
          {failed ? <PluginArt id={item.plugin_id} /> : <img src={item.image_url} alt="" loading="lazy" onError={() => setFailed(true)} className="block aspect-[5/3] w-full bg-white object-contain" />}
        </span>
        <span className="mt-2 block text-sm font-medium [overflow-wrap:anywhere]">{item.instance}</span>
      </Link>
    </li>
  )
}

type Action = { kind: "busy"; text: string } | { kind: "done"; text: string } | { kind: "error"; text: string } | null

function ScreenActions({ state, onChanged }: { state: UiState; onChanged: () => Promise<void> }) {
  const { t } = useI18n()
  const [action, setAction] = useState<Action>(null)
  const { screen, rotation } = state
  const busy = action?.kind === "busy"
  // Une image affichée à la main ou une entrée supprimée depuis n'ont plus de réglages à régénérer.
  const canRefresh = rotation.running && rotation.can_refresh && screen.playlist && screen.instance && screen.plugin_id
  const canShowNext = rotation.running && rotation.upcoming.length > 0

  const run = async (text: string, done: string, send: () => Promise<unknown>) => {
    if (busy) return
    setAction({ kind: "busy", text })
    try {
      await send()
      await onChanged()
      setAction({ kind: "done", text: done })
      // Le bouton utilisé peut avoir disparu, par exemple quand la rotation est terminée.
      if (document.activeElement === document.body) focusContent()
    } catch (error) {
      setAction({ kind: "error", text: error instanceof ApiError ? t("form.showRefused", { reason: error.message }) : t("form.unreachable") })
    }
  }

  if (!canRefresh && !canShowNext) return null
  return (
    <div className="mt-3 grid gap-2">
      {canRefresh ? <Button className="min-h-10" aria-busy={busy} onClick={() => void run(t("screen.refreshing"), t("form.onScreen"), () => refreshInstance(screen.playlist!, screen.plugin_id!, screen.instance!))}><RefreshCwIcon data-icon="inline-start" aria-hidden="true" />{t("screen.refresh")}</Button> : null}
      {canShowNext ? <Button variant="outline" className="min-h-10" aria-busy={busy} onClick={() => void run(t("form.sending"), t("form.onScreen"), showNext)}><SkipForwardIcon data-icon="inline-start" aria-hidden="true" />{t("screen.showNext")}</Button> : null}
      <p role={action?.kind === "error" ? "alert" : "status"} className={`flex items-start gap-2 text-sm empty:hidden ${action?.kind === "error" ? "text-destructive" : "text-muted-foreground"}`}>
        {action?.kind === "busy" ? <LoaderCircleIcon className="mt-0.5 size-4 shrink-0 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : null}
        {action?.kind === "done" ? <CheckIcon className="mt-0.5 size-4 shrink-0" aria-hidden="true" /> : null}
        {action?.text}
      </p>
    </div>
  )
}

function Warning({ children }: { children: ReactNode }) {
  return (
    <p role="status" className="mt-3 flex items-start gap-2 text-sm text-muted-foreground">
      <span className="mt-1.5 size-2 shrink-0 rounded-full bg-[var(--warn)]" aria-hidden="true" />{children}
    </p>
  )
}

export function ScreenPage() {
  const { t, language } = useI18n()
  const [state, setState] = useState<UiState | null>(null)
  const [failed, setFailed] = useState(false)

  const load = useCallback(
    (signal?: AbortSignal) =>
      getState(signal)
        .then((next) => {
          setState(next)
          setFailed(false)
        })
        .catch((error: Error) => {
          if (error.name !== "AbortError") setFailed(true)
        }),
    [],
  )

  useEffect(() => {
    const controller = new AbortController()
    const refresh = () => {
      if (document.visibilityState === "visible") void load(controller.signal)
    }
    void load(controller.signal)
    const timer = window.setInterval(refresh, REFRESH_EVERY_MS)
    document.addEventListener("visibilitychange", refresh)
    return () => {
      controller.abort()
      window.clearInterval(timer)
      document.removeEventListener("visibilitychange", refresh)
    }
  }, [load])

  const retry = () => {
    focusContent()
    void load()
  }

  let content: ReactNode
  if (!state && failed) {
    content = (
      <div className={notice} role="alert">
        <h1 tabIndex={-1} className={heading}>{t("error.title")}</h1>
        <p className="mt-1 text-muted-foreground">{t("error.body")}</p>
        <Button variant="outline" className="mt-4 min-h-10" onClick={retry}>{t("error.retry")}</Button>
      </div>
    )
  } else if (!state) {
    content = (
      <div className="grid items-start gap-6 lg:grid-cols-4" role="status">
        <h1 tabIndex={-1} className="sr-only">{t("screen.loading")}</h1>
        <div className="lg:col-span-3"><div className="device"><div className="aspect-[5/3] rounded-[4px] bg-card" /></div></div>
        <div className="grid gap-3" aria-hidden="true"><div className="h-8 rounded bg-accent" /><div className="h-24 rounded bg-accent" /></div>
      </div>
    )
  } else if (!state.screen.plugin_id && !state.screen.refreshed_at) {
    content = (
      <div className={notice}>
        <EmptyScreenArt className="mx-auto mb-4 max-w-48" />
        <h1 tabIndex={-1} className={heading}>{t("screen.emptyTitle")}</h1>
        <p className="mt-1 text-muted-foreground">{t("screen.emptyBody")}</p>
        <Link href="/plugins" className={`${buttonVariants()} mt-4 min-h-10`}>{t("screen.choosePlugin")}</Link>
      </div>
    )
  } else {
    const { screen, device, rotation } = state
    const pluginName = screen.plugin_id && screen.plugin_name ? pluginLabel(t, screen.plugin_id, screen.plugin_name) : screen.plugin_name
    const name = screen.instance ?? pluginName
    const formatting = { timezone: device.timezone, timeFormat: device.time_format, language }
    // Sans rotation, l'image reste en place : ce n'est pas un retard.
    const next = !failed && rotation.running && rotation.upcoming.length ? nextChange(screen.refreshed_at, rotation.interval_seconds, new Date(), rotation.watching_since) : null
    content = (
      <>
        <div className="grid items-start gap-6 lg:grid-cols-4">
          <div className="lg:col-span-3"><CurrentImage key={screen.image_url} url={screen.image_url} alt={name ? t("screen.alt", { name }) : t("screen.onScreen")} /></div>
          <div>
            <h1 tabIndex={-1} className={heading}>{name ?? t("screen.onScreen")}</h1>
            {name ? <p className="mt-1 text-muted-foreground">{t("screen.onScreen")}</p> : null}
            <dl className="mt-3">
              {screen.instance && pluginName ? <Row label={t("screen.plugin")}>{pluginName}</Row> : null}
              <Row label={t("screen.source")}>{screen.playlist ? t("screen.playlist", { name: screen.playlist }) : t("screen.manual")}</Row>
              {screen.refreshed_at ? <Row label={t("screen.lastRefresh")}>{formatRefresh(screen.refreshed_at, formatting)}</Row> : null}
              {next?.kind === "at" ? <Row label={t("screen.nextChange")}>{t("screen.around", { time: formatRefresh(next.date.toISOString(), formatting) })}</Row> : null}
              {next?.kind === "soon" ? <Row label={t("screen.nextChange")}>{t("screen.soon")}</Row> : null}
            </dl>
            {failed ? <Warning>{t("screen.outdated")}</Warning> : null}
            {next?.kind === "late" ? <Warning>{t("screen.late")} <Link href="/settings" className="underline underline-offset-4 hover:text-foreground">{t("nav.settings")}</Link></Warning> : null}
            {!failed && !rotation.running ? <Warning>{t("screen.notRunning")} <Link href="/settings" className="underline underline-offset-4 hover:text-foreground">{t("nav.settings")}</Link></Warning> : null}
            <ScreenActions state={state} onChanged={() => load()} />
          </div>
        </div>
        {rotation.running ? <UpNext state={state} /> : null}
      </>
    )
  }
  return <Shell title={t("nav.screen")} current="nav.screen">{content}</Shell>
}
