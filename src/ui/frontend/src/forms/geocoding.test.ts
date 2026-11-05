import { afterEach, describe, expect, it, vi } from "vitest"
import { searchPlaces } from "./geocoding"

afterEach(() => vi.unstubAllGlobals())

function respond(body: unknown, status = 200) {
  const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status }))
  vi.stubGlobal("fetch", fetchMock)
  return fetchMock
}

describe("searchPlaces", () => {
  it("describes each place and keeps its coordinates", async () => {
    respond({ results: [{ id: 1, name: "Saint-Étienne", admin1: "Auvergne-Rhône-Alpes", country: "France", latitude: 45.43, longitude: 4.39 }] })
    expect(await searchPlaces("saint", "fr")).toEqual([{ id: 1, label: "Saint-Étienne, Auvergne-Rhône-Alpes, France", latitude: 45.43, longitude: 4.39 }])
  })

  it("does not repeat a name, such as a city that is also its region", async () => {
    respond({ results: [{ id: 2, name: "Singapore", admin1: "Singapore", country: "Singapore", latitude: 1.3, longitude: 103.8 }] })
    expect((await searchPlaces("singapore", "en"))[0].label).toBe("Singapore")
  })

  it("treats no result as an empty list", async () => {
    respond({})
    expect(await searchPlaces("zzz", "en")).toEqual([])
  })

  it("asks for the interface language and encodes the name", async () => {
    const fetchMock = respond({})
    await searchPlaces("São Paulo", "fr")
    const url = new URL(fetchMock.mock.calls[0][0] as string)
    expect(url.searchParams.get("name")).toBe("São Paulo")
    expect(url.searchParams.get("language")).toBe("fr")
  })

  it("reports a failure", async () => {
    respond({}, 500)
    await expect(searchPlaces("paris", "en")).rejects.toThrow("HTTP 500")
  })
})
