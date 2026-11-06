import type { DeviceSettings } from "@/api"
import type { Key } from "@/i18n/translate"

const SECONDS = { minute: 60, hour: 3600 }
const MAX_SECONDS = 86_400

export type Unit = keyof typeof SECONDS
export const IMAGE_DEFAULTS = { saturation: 1, contrast: 1, sharpness: 1, brightness: 1 }
export const INKY_SATURATION_DEFAULT = 0.5

export type SettingsValues = typeof IMAGE_DEFAULTS & {
  name: string
  timezone: string
  timeFormat: string
  orientation: string
  rotated: boolean
  logStats: boolean
  interval: string
  unit: Unit
  inkySaturation: number | null
}

export type FieldName = "name" | "timezone" | "interval"
export type FieldErrors = Partial<Record<FieldName, Key>>

/** Garde la valeur exacte : 90 minutes restent 90 minutes, et ne deviennent pas 1 heure. */
export function splitInterval(seconds: number): { interval: string; unit: Unit } {
  if (seconds >= SECONDS.hour && seconds % SECONDS.hour === 0) return { interval: String(seconds / SECONDS.hour), unit: "hour" }
  return { interval: String(Math.max(1, Math.round(seconds / SECONDS.minute))), unit: "minute" }
}

export function toValues(settings: DeviceSettings): SettingsValues {
  const { saturation, contrast, sharpness, brightness, inky_saturation } = settings.image
  return {
    name: settings.name,
    timezone: settings.timezone ?? "",
    timeFormat: settings.time_format === "24h" ? "24h" : "12h",
    orientation: settings.orientation === "vertical" ? "vertical" : "horizontal",
    rotated: settings.rotated,
    logStats: settings.log_system_stats,
    ...splitInterval(settings.interval_seconds),
    saturation,
    contrast,
    sharpness,
    brightness,
    inkySaturation: inky_saturation ?? (settings.inky_display ? INKY_SATURATION_DEFAULT : null),
  }
}

export function suggestedTimezone(timezones: string[], browser = Intl.DateTimeFormat().resolvedOptions().timeZone) {
  return timezones.includes(browser) ? browser : ""
}

export function validate(values: SettingsValues, timezones: string[]): FieldErrors {
  const errors: FieldErrors = {}
  if (!values.name.trim()) errors.name = "settings.nameRequired"
  if (!timezones.includes(values.timezone)) errors.timezone = "settings.timezoneRequired"
  const interval = values.interval.trim()
  const seconds = Number(interval) * SECONDS[values.unit]
  if (!/^\d+$/.test(interval) || seconds <= 0 || seconds > MAX_SECONDS) errors.interval = "settings.intervalInvalid"
  return errors
}

export function normalize(values: SettingsValues): SettingsValues {
  return { ...values, name: values.name.trim(), interval: String(Number(values.interval.trim())) }
}

/** Reprend les noms de champs attendus par /save_settings. */
export function toFormData(values: SettingsValues) {
  const form = new FormData()
  form.set("deviceName", values.name)
  form.set("timezoneName", values.timezone)
  form.set("timeFormat", values.timeFormat)
  form.set("orientation", values.orientation)
  if (values.rotated) form.set("invertImage", "on")
  if (values.logStats) form.set("logSystemStats", "on")
  form.set("interval", values.interval)
  form.set("unit", values.unit)
  form.set("saturation", String(values.saturation))
  form.set("contrast", String(values.contrast))
  form.set("sharpness", String(values.sharpness))
  form.set("brightness", String(values.brightness))
  // La route efface ce réglage s'il n'est pas envoyé.
  if (values.inkySaturation !== null) form.set("inky_saturation", String(values.inkySaturation))
  return form
}
