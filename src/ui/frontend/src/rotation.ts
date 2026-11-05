/** Marge volontairement large : un rendu lent ou un changement d'intervalle repousse le réveil du moteur. */
const RENDER_MARGIN_SECONDS = 600
const LATE_CYCLES = 2

export type NextChange = { kind: "at"; date: Date } | { kind: "soon" } | { kind: "late" }

/**
 * Une estimation : le rendu prend du temps et le moteur ne promet pas une heure exacte.
 * Le retard se mesure depuis `watchingSince` : hors de la fenêtre d'une playlist, un écran immobile est normal.
 */
export function nextChange(refreshedAt: string | null, intervalSeconds: number, now: Date, watchingSince: string | null = null): NextChange | null {
  if (!refreshedAt) return null
  const refreshed = new Date(refreshedAt).getTime()
  if (Number.isNaN(refreshed)) return null
  const elapsed = (now.getTime() - refreshed) / 1000
  const watching = watchingSince ? new Date(watchingSince).getTime() : Number.NaN
  const silent = (now.getTime() - Math.max(refreshed, Number.isNaN(watching) ? refreshed : watching)) / 1000
  if (silent > intervalSeconds * LATE_CYCLES + RENDER_MARGIN_SECONDS) return { kind: "late" }
  if (elapsed >= intervalSeconds) return { kind: "soon" }
  return { kind: "at", date: new Date(refreshed + intervalSeconds * 1000) }
}
