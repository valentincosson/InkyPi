import { useCallback, useEffect, useState, type ReactNode } from "react"
import { Link } from "wouter"
import { Button, buttonVariants } from "@/components/ui/button"
import { focusContent } from "@/components/route-focus"
import { Shell } from "@/components/shell"
import { getState, type UiState } from "@/api"
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
        <h1 tabIndex={-1} className={heading}>{t("screen.emptyTitle")}</h1>
        <p className="mt-1 text-muted-foreground">{t("screen.emptyBody")}</p>
        <Link href="/plugins" className={`${buttonVariants()} mt-4 min-h-10`}>{t("screen.choosePlugin")}</Link>
      </div>
    )
  } else {
    const { screen, device } = state
    const name = screen.instance ?? screen.plugin_name
    content = (
      <div className="grid items-start gap-6 lg:grid-cols-4">
        <div className="lg:col-span-3"><CurrentImage key={screen.image_url} url={screen.image_url} alt={name ? t("screen.alt", { name }) : t("screen.onScreen")} /></div>
        <div>
          <h1 tabIndex={-1} className={heading}>{name ?? t("screen.onScreen")}</h1>
          {name ? <p className="mt-1 text-muted-foreground">{t("screen.onScreen")}</p> : null}
          <dl className="mt-3">
            {screen.instance && screen.plugin_name ? <Row label={t("screen.plugin")}>{screen.plugin_name}</Row> : null}
            <Row label={t("screen.source")}>{screen.playlist ? t("screen.playlist", { name: screen.playlist }) : t("screen.manual")}</Row>
            {screen.refreshed_at ? <Row label={t("screen.lastRefresh")}>{formatRefresh(screen.refreshed_at, { timezone: device.timezone, timeFormat: device.time_format, language })}</Row> : null}
          </dl>
          {failed ? (
            <p role="status" className="mt-3 flex items-start gap-2 text-sm text-muted-foreground">
              <span className="mt-1.5 size-2 shrink-0 rounded-full bg-[var(--warn)]" aria-hidden="true" />{t("screen.outdated")}
            </p>
          ) : null}
        </div>
      </div>
    )
  }
  return <Shell title={t("nav.screen")} current="nav.screen">{content}</Shell>
}
