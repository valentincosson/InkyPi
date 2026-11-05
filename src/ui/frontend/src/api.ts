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
