import type { Language } from "@/i18n/translate"

type Options = { timezone: string; timeFormat: "12h" | "24h"; language: Language }

/** Affiche une heure dans le fuseau de l'appareil, et la date si ce n'est pas aujourd'hui. */
export function formatRefresh(iso: string, options: Options, now = new Date()) {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  const day = (value: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: options.timezone, dateStyle: "short" }).format(value)
  return new Intl.DateTimeFormat(options.language, {
    ...(day(date) === day(now) ? {} : { month: "short", day: "numeric" }),
    hour: "2-digit",
    minute: "2-digit",
    hour12: options.timeFormat === "12h",
    timeZone: options.timezone,
  }).format(date)
}
