import { describe, expect, it } from "vitest"
import { nextChange } from "@/rotation"

const refreshed = "2026-06-15T12:00:00+00:00"
const at = (time: string) => new Date(`2026-06-15T${time}:00+00:00`)

describe("nextChange", () => {
  it("estimates the time of the next change", () => {
    expect(nextChange(refreshed, 3600, at("12:30"))).toEqual({ kind: "at", date: at("13:00") })
  })

  it("says soon once the time has passed", () => {
    expect(nextChange(refreshed, 3600, at("13:00"))).toEqual({ kind: "soon" })
    expect(nextChange(refreshed, 3600, at("14:05"))).toEqual({ kind: "soon" })
  })

  it("allows a skipped wake-up and a slow render before calling it late", () => {
    expect(nextChange(refreshed, 3600, at("14:10"))).toEqual({ kind: "soon" })
    expect(nextChange(refreshed, 3600, at("14:11"))).toEqual({ kind: "late" })
  })

  it("does not call a day playlist late in the morning", () => {
    const lastNight = "2026-06-14T22:00:00+00:00"
    const opened = "2026-06-15T08:00:00+00:00"
    expect(nextChange(lastNight, 3600, at("08:30"), opened)).toEqual({ kind: "soon" })
    expect(nextChange(lastNight, 3600, at("10:11"), opened)).toEqual({ kind: "late" })
  })

  it("ignores a window older than the last refresh", () => {
    expect(nextChange(refreshed, 3600, at("14:11"), "2026-06-15T08:00:00+00:00")).toEqual({ kind: "late" })
  })

  it("knows nothing without a valid refresh time", () => {
    expect(nextChange(null, 3600, at("12:30"))).toBeNull()
    expect(nextChange("not a date", 3600, at("12:30"))).toBeNull()
  })
})
