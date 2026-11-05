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
