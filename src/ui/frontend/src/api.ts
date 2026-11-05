export class ApiError extends Error {
  status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = "ApiError"
    this.status = status
  }
}

/** Les routes existantes renvoient `error` ou `message` selon les cas : l'interface n'en voit qu'un. */
async function errorFrom(response: Response) {
  let message = `HTTP ${response.status}`
  try {
    const body = await response.json()
    message = body.error ?? body.message ?? message
  } catch {
    // Réponse sans JSON : on garde le code HTTP.
  }
  return new ApiError(message, response.status)
}

export async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, init)
  if (!response.ok) throw await errorFrom(response)
  return response.json() as Promise<T>
}

export type UiState = {
  device: { name: string; timezone: string; time_format: "12h" | "24h" }
  screen: { refreshed_at: string | null; plugin_id: string | null; plugin_name: string | null; instance: string | null; playlist: string | null; image_url: string }
  rotation: {
    playlist: string | null
    interval_seconds: number
    running: boolean
    can_refresh: boolean
    watching_since: string | null
    upcoming: { plugin_id: string; instance: string; image_url: string }[]
  }
}

export const getState = (signal?: AbortSignal) => request<UiState>("/ui/api/state", { signal })

export type DeviceSettings = {
  name: string
  orientation: string
  rotated: boolean
  log_system_stats: boolean
  timezone: string | null
  time_format: string
  interval_seconds: number
  image: { saturation: number; contrast: number; sharpness: number; brightness: number; inky_saturation: number | null }
  inky_display: boolean
  timezones: string[]
}

export const getSettings = (signal?: AbortSignal) => request<DeviceSettings>("/ui/api/settings", { signal })

export const saveSettings = (body: FormData) => request<unknown>("/save_settings", { method: "POST", body })

/** L'appareil s'arrête : la réponse peut ne jamais arriver, et son absence ne prouve rien. */
export function requestPower(action: "restart" | "shutdown") {
  void fetch("/shutdown", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ reboot: action === "restart" }),
  }).catch(() => undefined)
}

export type ApiKey = { key: string; has_value: boolean }
export type ApiKeyEntry = { key: string; keepExisting: true } | { key: string; value: string }

export const getApiKeys = (signal?: AbortSignal) => request<{ keys: ApiKey[] }>("/ui/api/api-keys", { signal })

export const saveApiKeys = (entries: ApiKeyEntry[]) =>
  request<unknown>("/api-keys/save", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ entries }) })

export const showNext = () => request<unknown>("/ui/api/show-next", { method: "POST" })

export const refreshInstance = (playlist: string, pluginId: string, instance: string) =>
  request<unknown>("/display_plugin_instance", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ playlist_name: playlist, plugin_id: pluginId, plugin_instance: instance }),
  })

export const savePluginOrder = (order: string[]) =>
  request<unknown>("/api/plugin_order", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ order }) })

export type PluginSummary = { id: string; name: string }
export const getPlugins = (signal?: AbortSignal) => request<{ plugins: PluginSummary[] }>("/ui/api/plugins", { signal })

export type PluginData = {
  id: string
  name: string
  params: Record<string, unknown>
  instance: string | null
  settings: Record<string, unknown> | null
  refresh: { interval?: number; scheduled?: string } | null
  playlists: string[]
  keys_set: string[]
}

export function getPlugin(id: string, instance: string | null, signal?: AbortSignal) {
  const query = instance ? `?instance=${encodeURIComponent(instance)}` : ""
  return request<PluginData>(`/ui/api/plugins/${encodeURIComponent(id)}${query}`, { signal })
}

function formBody(pluginId: string, entries: [string, string | File][]) {
  const body = new FormData()
  entries.forEach(([name, value]) => body.append(name, value))
  body.append("plugin_id", pluginId)
  return body
}

/** Répond une fois l'image envoyée à l'écran : cela peut prendre longtemps sur le Pi. */
export const showOnScreen = (pluginId: string, entries: [string, string | File][]) =>
  request<unknown>("/update_now", { method: "POST", body: formBody(pluginId, entries) })

export function addToPlaylist(pluginId: string, entries: [string, string | File][], refresh: Record<string, string>) {
  const body = formBody(pluginId, entries)
  body.append("refresh_settings", JSON.stringify(refresh))
  return request<unknown>("/add_plugin", { method: "POST", body })
}

export const saveInstance = (pluginId: string, instance: string, entries: [string, string | File][]) =>
  request<unknown>(`/update_plugin_instance/${encodeURIComponent(instance)}`, { method: "PUT", body: formBody(pluginId, entries) })

export function saveRefresh(pluginId: string, instance: string, refresh: Record<string, string>) {
  const body = formBody(pluginId, [])
  body.append("refresh_settings", JSON.stringify(refresh))
  return request<unknown>(`/update_plugin_instance/${encodeURIComponent(instance)}`, { method: "PUT", body })
}
