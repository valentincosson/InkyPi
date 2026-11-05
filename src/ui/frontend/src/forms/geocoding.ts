export type Place = { id: number; label: string; latitude: number; longitude: number }

type Result = { id: number; name: string; latitude: number; longitude: number; admin1?: string; country?: string }

/** Open-Meteo, déjà le fournisseur météo par défaut du plugin. La requête part du navigateur, pas du Pi. */
export async function searchPlaces(name: string, language: string, signal?: AbortSignal): Promise<Place[]> {
  const query = new URLSearchParams({ name, count: "6", language, format: "json" })
  const response = await fetch(`https://geocoding-api.open-meteo.com/v1/search?${query}`, { signal })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  const { results = [] } = (await response.json()) as { results?: Result[] }
  return results.map((place) => ({
    id: place.id,
    label: [place.name, place.admin1, place.country].filter((part, index, parts) => part && parts.indexOf(part) === index).join(", "),
    latitude: place.latitude,
    longitude: place.longitude,
  }))
}
