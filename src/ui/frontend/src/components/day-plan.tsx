import type { PlaylistsData } from "@/api"
import { useI18n } from "@/i18n"
import { emptyTakeovers, formatClock, formatTick, gaps, isAllDay, neverShown, startsTooLate, trackFor, windowRanges, type Range } from "@/playlists"

const DAY_MINUTES = 1440
const TICKS = [0, 6, 12, 18, 24]

const position = ({ from, to }: Range) => ({ left: `${(from / DAY_MINUTES) * 100}%`, width: `${((to - from) / DAY_MINUTES) * 100}%` })

function Bar({ ranges, className }: { ranges: Range[]; className: string }) {
  return ranges.map((range) => <span key={range.from} className={`absolute inset-y-0 ${className}`} style={position(range)} />)
}

function NowLine({ minutes }: { minutes: number }) {
  return <span className="absolute -inset-y-1 w-0.5 -translate-x-1/2 bg-[var(--ring)] shadow-[0_0_0_1px_var(--card)]" style={{ left: `${(minutes / DAY_MINUTES) * 100}%` }} />
}

function Note({ children }: { children: string }) {
  return (
    <li className="flex items-start gap-2">
      <span className="mt-1.5 size-2 shrink-0 rounded-full bg-[var(--warn)]" aria-hidden="true" />{children}
    </li>
  )
}

/** Montre la journée telle que le moteur la jouera : ce que chaque playlist affiche, et ce qu'une autre lui prend. */
export function DayPlan({ data, minutes }: { data: PlaylistsData; minutes: number }) {
  const { t, language } = useI18n()
  const { day, playlists, device } = data
  const clock = (time: string) => formatClock(time, device.time_format, language)
  const times = (pieces: { start: string; end: string }[]) => pieces.map(({ start, end }) => t("playlists.times", { start: clock(start), end: clock(end) })).join(", ")
  const rangeText = (ranges: Range[]) => {
    const asTime = (value: number) => `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`
    return times(ranges.map(({ from, to }) => ({ start: asTime(from), end: asTime(to) })))
  }

  const tracks = playlists.map((playlist) => ({ playlist, ...trackFor(day, playlist) }))
  const hasOverlap = tracks.some(({ hidden }) => hidden.length > 0)
  const broken = startsTooLate(playlists)
  const never = neverShown(day, playlists).filter((playlist) => !broken.includes(playlist))
  const frozen = emptyTakeovers(day, playlists)
  const empty = gaps(day)

  return (
    <section aria-labelledby="day-plan">
      <h2 id="day-plan" className="text-lg font-semibold">{t("playlists.dayTitle")}</h2>
      <div className="mt-3 rounded-[var(--radius)] border border-border bg-card p-4">
        <ul className="grid gap-3">
          {tracks.map(({ playlist, shown, hidden }) => {
            // Une playlist vide prend ses heures sans rien montrer : elle n'a pas droit au même trait plein.
            const isEmpty = playlist.entries.length === 0
            const description = shown.length
              ? [t(isEmpty ? "playlists.trackEmpty" : "playlists.trackShown", { name: playlist.name, times: rangeText(shown) }), hidden.length ? t("playlists.trackHidden", { times: rangeText(hidden) }) : ""].join(" ").trim()
              : t("playlists.trackNever", { name: playlist.name })
            return (
              <li key={playlist.name} className="grid items-center gap-x-6 gap-y-1 lg:grid-cols-4">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium" title={playlist.name}>{playlist.name}</p>
                  <p className="text-xs text-muted-foreground tabular-nums">
                    {isAllDay(playlist.start_time, playlist.end_time) ? t("playlists.allDay") : t("playlists.window", { start: clock(playlist.start_time), end: clock(playlist.end_time) })}
                  </p>
                </div>
                <div className="lg:col-span-3">
                  <span className="sr-only">{description}</span>
                  <div className="relative h-5 rounded-sm bg-muted" aria-hidden="true">
                    <Bar ranges={hidden} className="track-hidden" />
                    <Bar ranges={shown} className={isEmpty ? "border border-primary" : "bg-primary"} />
                    <NowLine minutes={minutes} />
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
        <div className="mt-2 grid gap-x-6 lg:grid-cols-4" aria-hidden="true">
          <div className="relative h-4 text-xs text-muted-foreground tabular-nums lg:col-span-3 lg:col-start-2">
            {TICKS.map((hour) => (
              <span key={hour} className={`absolute top-0 ${hour === 0 ? "" : hour === 24 ? "-translate-x-full" : "-translate-x-1/2"}`} style={{ left: `${(hour / 24) * 100}%` }}>{formatTick(hour, device.time_format, language)}</span>
            ))}
          </div>
        </div>
        <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground" aria-hidden="true">
          <li className="flex items-center gap-1.5"><span className="h-2.5 w-4 rounded-[2px] bg-primary" />{t("playlists.legendShown")}</li>
          {hasOverlap ? <li className="flex items-center gap-1.5"><span className="track-hidden h-2.5 w-4 rounded-[2px]" />{t("playlists.legendHidden")}</li> : null}
          {frozen.length ? <li className="flex items-center gap-1.5"><span className="h-2.5 w-4 rounded-[2px] border border-primary" />{t("playlists.legendEmpty")}</li> : null}
          <li className="flex items-center gap-1.5 tabular-nums"><span className="h-3 w-0.5 bg-[var(--ring)]" />{t("playlists.legendNow", { time: clock(`${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`) })}</li>
        </ul>
      </div>
      {hasOverlap ? <p className="mt-3 text-sm text-muted-foreground">{t("playlists.overlap")}</p> : null}
      {never.length || frozen.length || broken.length ? (
        <ul className="mt-2 grid gap-1 text-sm text-muted-foreground">
          {broken.map(({ name }) => <Note key={name}>{t("playlists.lateStartNote", { name })}</Note>)}
          {never.map(({ name, start_time, end_time }) => <Note key={name}>{t(windowRanges(start_time, end_time).length ? "playlists.neverCovered" : "playlists.neverNoLength", { name })}</Note>)}
          {frozen.map((piece) => <Note key={piece.start}>{t("playlists.emptyTakeover", { name: piece.playlist ?? "", times: times([piece]) })}</Note>)}
        </ul>
      ) : null}
      {empty.length ? <p className="mt-2 text-sm text-muted-foreground">{t("playlists.gap", { times: times(empty) })}</p> : null}
    </section>
  )
}
