import { describe, expect, it } from "vitest"
import { formatRefresh } from "./format"

const iso = "2026-11-04T22:48:00+00:00"
const sameDay = new Date("2026-11-04T23:30:00+00:00")
const paris = { timezone: "Europe/Paris", timeFormat: "24h", language: "fr" } as const

describe("formatRefresh", () => {
  it("donne seulement l'heure le jour même, dans le fuseau de l'appareil", () => {
    expect(formatRefresh(iso, paris, new Date("2026-11-04T22:50:00+00:00"))).toBe("23:48")
  })

  it("respecte le format 12 h", () => {
    expect(formatRefresh(iso, { timezone: "UTC", timeFormat: "12h", language: "en" }, sameDay).replace(/\s/g, " ")).toBe("10:48 PM")
  })

  it("ajoute la date si ce n'est plus le même jour", () => {
    const text = formatRefresh(iso, paris, new Date("2026-11-07T10:00:00+00:00"))
    expect(text).toContain("4 nov")
    expect(text).toContain("23:48")
  })

  it("garde lisible une date invalide", () => {
    expect(formatRefresh("n'importe quoi", paris)).toBe("n'importe quoi")
  })

  it("compare les jours dans le fuseau de l'appareil, pas en UTC", () => {
    expect(formatRefresh(iso, paris, new Date("2026-11-04T23:30:00+00:00"))).toContain("nov")
  })
})
