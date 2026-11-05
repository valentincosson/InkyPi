import { describe, expect, it } from "vitest"
import en from "./en.json"
import fr from "./fr.json"
import { translate } from "./translate"

describe("catalogues", () => {
  it("ont les mêmes clés", () => {
    expect(Object.keys(fr).sort()).toEqual(Object.keys(en).sort())
  })

  it("ont les mêmes paramètres pour chaque clé", () => {
    const params = (text: string) => (text.match(/\{\w+\}/g) ?? []).sort()
    for (const key of Object.keys(en) as (keyof typeof en)[]) expect(params(fr[key]), key).toEqual(params(en[key]))
  })
})

describe("translate", () => {
  it("remplace les paramètres", () => {
    expect(translate("fr", "screen.playlist", { name: "Salon d'hiver" })).toBe("Playlist Salon d'hiver")
  })

  it("laisse visible un paramètre manquant", () => {
    expect(translate("en", "screen.playlist")).toBe("{name} playlist")
  })
})
