import en from "@/i18n/en.json"
import type { Key } from "@/i18n/translate"

export type PluginGroup = "pictures" | "information"

/** Données légères du catalogue : afficher la liste ne charge pas les descriptions des formulaires. */
export const PLUGIN_META: Record<string, { group: PluginGroup; needsKey?: boolean }> = {
  image_upload: { group: "pictures" },
  apod: { group: "pictures" },
  wpotd: { group: "pictures" },
  unsplash: { group: "pictures", needsKey: true },
  image_album: { group: "pictures", needsKey: true },
  image_folder: { group: "pictures" },
  image_url: { group: "pictures" },
  ai_image: { group: "pictures", needsKey: true },
  weather: { group: "information" },
  calendar: { group: "information" },
  clock: { group: "information" },
  todo_list: { group: "information" },
  countdown: { group: "information" },
  year_progress: { group: "information" },
  rss: { group: "information" },
  newspaper: { group: "information" },
  comic: { group: "information" },
  github: { group: "information", needsKey: true },
  ai_text: { group: "information", needsKey: true },
  screenshot: { group: "information" },
}

export function hasForm(id: string) {
  return Object.hasOwn(PLUGIN_META, id)
}

/** Un plugin inconnu de l'interface garde le nom qu'il déclare. */
export function pluginLabel(t: (key: Key) => string, id: string, name: string) {
  const key = `plugin.${id}`
  return key in en ? t(key as Key) : name
}

export function pluginHint(t: (key: Key) => string, id: string) {
  const key = `hint.${id}`
  return key in en ? t(key as Key) : ""
}
