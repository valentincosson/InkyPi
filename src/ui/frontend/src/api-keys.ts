import type { ApiKey, ApiKeyEntry } from "@/api"
import type { Key } from "@/i18n/translate"

const DOCS = "https://github.com/valentincosson/InkyPi/blob/main/docs/api_keys.md"

/** Les clés lues par les plugins livrés. Les noms de services et de plugins ne se traduisent pas. */
export const knownKeys = [
  { key: "OPEN_WEATHER_MAP_SECRET", service: "OpenWeatherMap", plugins: "Weather", help: `${DOCS}#open-weather-map-key` },
  { key: "OPEN_AI_SECRET", service: "OpenAI", plugins: "AI Image, AI Text", help: `${DOCS}#open-ai-key` },
  { key: "UNSPLASH_ACCESS_KEY", service: "Unsplash", plugins: "Unsplash", help: `${DOCS}#unsplash-key` },
  { key: "GITHUB_SECRET", service: "GitHub", plugins: "GitHub", help: `${DOCS}#github-key` },
  { key: "IMMICH_KEY", service: "Immich", plugins: "Image Album", help: `${DOCS}#immich-key` },
]

/** La route remplace tout le fichier : chaque envoi décrit la liste complète, sans connaître les valeurs. */
export function entriesWithValue(keys: ApiKey[], key: string, value: string): ApiKeyEntry[] {
  const kept = keys.map<ApiKeyEntry>((entry) => (entry.key === key ? { key, value } : { key: entry.key, keepExisting: true }))
  return keys.some((entry) => entry.key === key) ? kept : [...kept, { key, value }]
}

export function entriesWithout(keys: ApiKey[], key: string): ApiKeyEntry[] {
  return keys.filter((entry) => entry.key !== key).map((entry) => ({ key: entry.key, keepExisting: true }))
}

export function nameError(name: string, keys: ApiKey[]): Key | null {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) return "apiKeys.nameInvalid"
  if (keys.some((entry) => entry.key === name)) return "apiKeys.nameTaken"
  return null
}
