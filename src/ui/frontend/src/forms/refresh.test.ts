import { describe, expect, it } from "vitest"
import { instanceNameError, refreshError, refreshFromStored, suggestedName, toRefreshSettings } from "./refresh"

describe("refreshFromStored", () => {
  it.each([
    [{ interval: 3600 }, "1", "hour"],
    [{ interval: 7200 }, "2", "hour"],
    [{ interval: 86400 }, "1", "day"],
    [{ interval: 172800 }, "2", "day"],
    [{ interval: 5400 }, "90", "minute"],
    [{ interval: 900 }, "15", "minute"],
  ])("keeps %j", (stored, interval, unit) => {
    expect(refreshFromStored(stored)).toMatchObject({ type: "interval", interval, unit })
  })

  it("reads a daily time", () => {
    expect(refreshFromStored({ scheduled: "06:15" })).toMatchObject({ type: "scheduled", time: "06:15" })
  })

  it("starts at one hour", () => {
    expect(refreshFromStored(null)).toMatchObject({ type: "interval", interval: "1", unit: "hour" })
  })
})

describe("refreshError", () => {
  const base = refreshFromStored(null)

  it.each(["1", "30", " 5 "])("accepts %j", (interval) => {
    expect(refreshError({ ...base, interval })).toBeNull()
  })

  it.each(["", "0", "1.5", "abc", "-1"])("rejects %j", (interval) => {
    expect(refreshError({ ...base, interval })).toBe("form.refreshIntervalInvalid")
  })

  it("needs a time for a daily refresh", () => {
    expect(refreshError({ ...base, type: "scheduled", time: "" })).toBe("form.refreshTimeRequired")
  })
})

describe("toRefreshSettings", () => {
  it("uses the names the routes expect", () => {
    expect(toRefreshSettings({ type: "interval", interval: " 2 ", unit: "day", time: "07:00" })).toEqual({ refreshType: "interval", interval: "2", unit: "day" })
    expect(toRefreshSettings({ type: "scheduled", interval: "1", unit: "hour", time: "06:15" })).toEqual({ refreshType: "scheduled", refreshTime: "06:15" })
  })
})

describe("instance names", () => {
  it.each(["Paris weather", "Météo été", "Salon 2"])("accepts %j", (name) => {
    expect(instanceNameError(name)).toBeNull()
  })

  it("refuses a blank name", () => {
    expect(instanceNameError("  ")).toBe("form.nameRequired")
  })

  it.each(["L'heure", "a/b", "x:y"])("refuses %j, as the server does", (name) => {
    expect(instanceNameError(name)).toBe("form.nameInvalid")
  })

  it.each([["Today's Newspaper", "Todays Newspaper"], ["Wikipedia:Picture of the day", "Wikipedia Picture of the day"], ["Clock", "Clock"]])("suggests a valid name for %j", (name, suggestion) => {
    expect(suggestedName(name)).toBe(suggestion)
    expect(instanceNameError(suggestedName(name))).toBeNull()
  })
})
