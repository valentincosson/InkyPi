import { refreshFromStored } from "@/forms/refresh"
import type { Key, Language } from "@/i18n/translate"

export type DayPiece = { start: string; end: string; playlist: string | null }
export type Range = { from: number; to: number }
type Window = { name: string; start_time: string; end_time: string }

const DAY_MINUTES = 1440

export function toMinutes(time: string) {
  const [hours, minutes] = time.split(":").map(Number)
  return hours * 60 + minutes
}

/** Même règle que `Playlist.is_active` : une fin avant le début passe par minuit. */
export function windowRanges(start: string, end: string): Range[] {
  if (start === end) return []
  if (start < end) return [{ from: toMinutes(start), to: toMinutes(end) }]
  const beforeMidnight = { from: toMinutes(start), to: DAY_MINUTES }
  return end === "00:00" ? [beforeMidnight] : [beforeMidnight, { from: 0, to: toMinutes(end) }]
}

function without(range: Range, holes: Range[]) {
  const pieces: Range[] = []
  let from = range.from
  for (const hole of [...holes].sort((a, b) => a.from - b.from)) {
    if (hole.to <= from || hole.from >= range.to) continue
    if (hole.from > from) pieces.push({ from, to: hole.from })
    from = Math.max(from, hole.to)
  }
  if (from < range.to) pieces.push({ from, to: range.to })
  return pieces
}

/** Ce que la playlist montre vraiment, et ce qu'une autre lui prend dans ses heures. */
export function trackFor(day: DayPiece[], playlist: Window) {
  const shown = day.filter((piece) => piece.playlist === playlist.name).map((piece) => ({ from: toMinutes(piece.start), to: toMinutes(piece.end) }))
  return { shown, hidden: windowRanges(playlist.start_time, playlist.end_time).flatMap((range) => without(range, shown)) }
}

export function activeAt(day: DayPiece[], minutes: number) {
  return day.find((piece) => toMinutes(piece.start) <= minutes && minutes < toMinutes(piece.end))?.playlist ?? null
}

export function neverShown<T extends Window>(day: DayPiece[], playlists: T[]) {
  return playlists.filter((playlist) => !day.some((piece) => piece.playlist === playlist.name))
}

/** Le moteur ne se rabat pas sur une autre playlist : une playlist vide fige l'écran pendant ses heures. */
export function emptyTakeovers(day: DayPiece[], playlists: (Window & { entries: unknown[] })[]) {
  const empty = new Set(playlists.filter((playlist) => playlist.entries.length === 0).map((playlist) => playlist.name))
  return day.filter((piece) => piece.playlist !== null && empty.has(piece.playlist))
}

export function gaps(day: DayPiece[]) {
  return day.filter((piece) => piece.playlist === null)
}

export function minutesInZone(moment: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: timezone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(moment)
  const read = (type: string) => Number(parts.find((part) => part.type === type)?.value)
  return read("hour") * 60 + read("minute")
}

const QUARTERS = Array.from({ length: 96 }, (_, index) => `${String(Math.floor(index / 4)).padStart(2, "0")}:${String((index % 4) * 15).padStart(2, "0")}`)

/** Minuit n'est proposé qu'une fois de chaque côté : 00:00 pour un début, 24:00 pour une fin. Une heure déjà enregistrée reste choisissable. */
export function timeOptions(side: "start" | "end", current: string) {
  const options = side === "start" ? QUARTERS : [...QUARTERS.slice(1), "24:00"]
  return options.includes(current) ? options : [...options, current].sort()
}

export function formatClock(time: string, timeFormat: "12h" | "24h", language: Language) {
  if (timeFormat === "24h") return time
  const moment = new Date(Date.UTC(2000, 0, 1, 0, toMinutes(time)))
  return new Intl.DateTimeFormat(language, { hour: "numeric", minute: "2-digit", hour12: true, timeZone: "UTC" }).format(moment)
}

export function formatTick(hour: number, timeFormat: "12h" | "24h", language: Language) {
  if (timeFormat === "24h") return String(hour)
  return new Intl.DateTimeFormat(language, { hour: "numeric", hour12: true, timeZone: "UTC" }).format(new Date(Date.UTC(2000, 0, 1, hour)))
}

export function isAllDay(start: string, end: string) {
  return start === "00:00" && end === "24:00"
}

export function windowError(start: string, end: string): Key | null {
  if (start === end) return "playlists.sameTimes"
  return start === "24:00" ? "playlists.lateStart" : null
}

/** L'ancienne page laisse commencer une playlist à 24:00 : le moteur échoue alors pendant ses heures, pour toutes les playlists. */
export function startsTooLate<T extends Window>(playlists: T[]) {
  return playlists.filter(({ start_time, end_time }) => start_time === "24:00" && end_time !== "24:00" && end_time !== "00:00")
}

export function playlistNameError(name: string, others: string[]): Key | null {
  const clean = name.trim()
  if (!clean) return "playlists.nameRequired"
  // Les routes d'origine portent le nom dans l'adresse : ces noms-là n'y survivent pas.
  if (clean.includes("/") || /^\.+$/.test(clean)) return "playlists.nameInvalid"
  return others.includes(clean) ? "playlists.nameTaken" : null
}

type Rule = [Key, Record<string, string>]

export function refreshRule(refresh: { interval?: number; scheduled?: string }): Rule | null {
  if (refresh.scheduled) return ["playlists.dailyAt", { time: refresh.scheduled }]
  if (!refresh.interval) return null
  const { interval, unit } = refreshFromStored(refresh)
  const one: Record<string, Key> = { minute: "playlists.everyMinute", hour: "playlists.everyHour", day: "playlists.everyDay" }
  const many: Record<string, Key> = { minute: "playlists.everyMinutes", hour: "playlists.everyHours", day: "playlists.everyDays" }
  return interval === "1" ? [one[unit], {}] : [many[unit], { count: interval }]
}
