import en from "@/i18n/en.json"
import type { Key } from "@/i18n/translate"

/** Liste légère : savoir qu'un plugin a un formulaire ne charge pas les descriptions. */
const PORTED = new Set(["ai_image", "ai_text", "apod", "calendar", "clock", "comic", "countdown", "github", "image_album", "image_folder", "image_upload", "image_url", "newspaper", "rss", "screenshot", "todo_list", "unsplash", "weather", "wpotd", "year_progress"])

export function hasForm(id: string) {
  return PORTED.has(id)
}

/** Un plugin inconnu de l'interface garde le nom qu'il déclare. */
export function pluginLabel(t: (key: Key) => string, id: string, name: string) {
  const key = `plugin.${id}`
  return key in en ? t(key as Key) : name
}
