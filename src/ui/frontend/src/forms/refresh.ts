import type { Key } from "@/i18n/translate"

const DAY = 86_400
const HOUR = 3_600
const MINUTE = 60

export type RefreshUnit = "minute" | "hour" | "day"
export type RefreshValues = { type: "interval" | "scheduled"; interval: string; unit: RefreshUnit; time: string }

/** Relit ce qui est enregistré sans arrondir : 90 minutes restent 90 minutes. */
export function refreshFromStored(stored: { interval?: number; scheduled?: string } | null): RefreshValues {
  const defaults: RefreshValues = { type: "interval", interval: "1", unit: "hour", time: "07:00" }
  if (stored?.scheduled) return { ...defaults, type: "scheduled", time: stored.scheduled }
  const seconds = stored?.interval
  if (!seconds) return defaults
  if (seconds % DAY === 0) return { ...defaults, interval: String(seconds / DAY), unit: "day" }
  if (seconds % HOUR === 0) return { ...defaults, interval: String(seconds / HOUR), unit: "hour" }
  return { ...defaults, interval: String(Math.max(1, Math.round(seconds / MINUTE))), unit: "minute" }
}

export function refreshError(values: RefreshValues): Key | null {
  if (values.type === "scheduled") return values.time ? null : "form.refreshTimeRequired"
  return /^[1-9]\d*$/.test(values.interval.trim()) ? null : "form.refreshIntervalInvalid"
}

/** Reprend les noms de champs attendus par les routes d'enregistrement. */
export function toRefreshSettings(values: RefreshValues): Record<string, string> {
  return values.type === "scheduled"
    ? { refreshType: "scheduled", refreshTime: values.time }
    : { refreshType: "interval", interval: values.interval.trim(), unit: values.unit }
}

export function instanceNameError(name: string): Key | null {
  if (!name.trim()) return "form.nameRequired"
  return /^[\p{L}\p{N}\s]+$/u.test(name) ? null : "form.nameInvalid"
}

/** Un nom de plugin peut contenir des caractères refusés par le serveur, comme dans « Today's Newspaper ». */
export function suggestedName(pluginName: string) {
  return pluginName.replace(/['’]/g, "").replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim()
}
