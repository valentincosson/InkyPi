import { describe, expect, it } from "vitest"
import { activeAt, emptyTakeovers, formatClock, formatTick, gaps, isAllDay, minutesInZone, neverShown, playlistNameError, refreshRule, startsTooLate, timeOptions, toMinutes, trackFor, windowError, windowRanges } from "@/playlists"

const playlist = (name: string, start_time: string, end_time: string, entries = 1) => ({ name, start_time, end_time, entries: Array.from({ length: entries }) })

describe("windowRanges", () => {
  it("follows the same rule as the engine", () => {
    expect(windowRanges("09:00", "12:00")).toEqual([{ from: 540, to: 720 }])
    expect(windowRanges("00:00", "24:00")).toEqual([{ from: 0, to: 1440 }])
    expect(windowRanges("21:00", "03:00")).toEqual([{ from: 1260, to: 1440 }, { from: 0, to: 180 }])
  })

  it("has nothing for a window with no length", () => {
    expect(windowRanges("09:00", "09:00")).toEqual([])
  })

  it("does not invent an empty piece after midnight", () => {
    expect(windowRanges("21:00", "00:00")).toEqual([{ from: 1260, to: 1440 }])
  })
})

describe("trackFor", () => {
  const day = [
    { start: "00:00", end: "08:00", playlist: "Default" },
    { start: "08:00", end: "12:00", playlist: "Morning" },
    { start: "12:00", end: "24:00", playlist: "Default" },
  ]

  it("splits a window into shown and hidden", () => {
    expect(trackFor(day, playlist("Default", "00:00", "24:00"))).toEqual({
      shown: [{ from: 0, to: 480 }, { from: 720, to: 1440 }],
      hidden: [{ from: 480, to: 720 }],
    })
  })

  it("has nothing hidden when the playlist always wins", () => {
    expect(trackFor(day, playlist("Morning", "08:00", "12:00"))).toEqual({ shown: [{ from: 480, to: 720 }], hidden: [] })
  })

  it("hides a whole window that never wins", () => {
    expect(trackFor(day, playlist("Late", "13:00", "14:00"))).toEqual({ shown: [], hidden: [{ from: 780, to: 840 }] })
  })

  it("handles a window crossing midnight", () => {
    const night = [{ start: "00:00", end: "03:00", playlist: "Night" }, { start: "03:00", end: "21:00", playlist: null }, { start: "21:00", end: "24:00", playlist: "Other" }]
    expect(trackFor(night, playlist("Night", "21:00", "03:00"))).toEqual({ shown: [{ from: 0, to: 180 }], hidden: [{ from: 1260, to: 1440 }] })
  })
})

describe("what the day tells", () => {
  const day = [
    { start: "00:00", end: "06:00", playlist: null },
    { start: "06:00", end: "08:00", playlist: "Default" },
    { start: "08:00", end: "12:00", playlist: "Morning" },
    { start: "12:00", end: "24:00", playlist: "Default" },
  ]

  it("finds who is active at a given minute", () => {
    expect(activeAt(day, 0)).toBeNull()
    expect(activeAt(day, 480)).toBe("Morning")
    expect(activeAt(day, 1439)).toBe("Default")
  })

  it("names the playlists that never reach the screen", () => {
    const lists = [playlist("Default", "06:00", "24:00"), playlist("Morning", "08:00", "12:00"), playlist("Late", "13:00", "14:00"), playlist("None", "09:00", "09:00")]
    expect(neverShown(day, lists).map(({ name }) => name)).toEqual(["Late", "None"])
  })

  it("finds the hours when an empty playlist freezes the screen", () => {
    const lists = [playlist("Default", "06:00", "24:00"), playlist("Morning", "08:00", "12:00", 0)]
    expect(emptyTakeovers(day, lists)).toEqual([{ start: "08:00", end: "12:00", playlist: "Morning" }])
  })

  it("finds the hours nothing is planned", () => {
    expect(gaps(day)).toEqual([{ start: "00:00", end: "06:00", playlist: null }])
  })
})

describe("minutesInZone", () => {
  it("reads the device clock, not the browser's", () => {
    const moment = new Date("2026-01-15T23:30:00Z")
    expect(minutesInZone(moment, "UTC")).toBe(1410)
    expect(minutesInZone(moment, "Europe/Paris")).toBe(30)
    expect(minutesInZone(moment, "America/New_York")).toBe(1110)
  })

  it("counts midnight as the start of the day", () => {
    expect(minutesInZone(new Date("2026-01-15T00:00:00Z"), "UTC")).toBe(0)
  })
})

describe("times", () => {
  it("converts to minutes", () => {
    expect(toMinutes("00:00")).toBe(0)
    expect(toMinutes("09:15")).toBe(555)
    expect(toMinutes("24:00")).toBe(1440)
  })

  it("offers every quarter of an hour", () => {
    const options = timeOptions("start", "00:00")
    expect(options).toHaveLength(96)
    expect(options.slice(0, 2)).toEqual(["00:00", "00:15"])
    expect(options.at(-1)).toBe("23:45")
  })

  it("starts never at the very end of the day, and ends never at its very start", () => {
    expect(timeOptions("start", "00:00")).not.toContain("24:00")
    expect(timeOptions("end", "24:00")).not.toContain("00:00")
    expect(timeOptions("end", "24:00").at(-1)).toBe("24:00")
  })

  it("keeps a stored time that is off the list", () => {
    const options = timeOptions("start", "09:07")
    expect(options).toContain("09:07")
    expect(options.indexOf("09:07")).toBe(options.indexOf("09:00") + 1)
    expect(timeOptions("end", "00:00")[0]).toBe("00:00")
  })

  it("formats in 24 hours as stored", () => {
    expect(formatClock("09:15", "24h", "en")).toBe("09:15")
    expect(formatClock("24:00", "24h", "en")).toBe("24:00")
  })

  it("formats in 12 hours", () => {
    expect(formatClock("09:15", "12h", "en").replace(/\s/g, " ")).toBe("9:15 AM")
    expect(formatClock("13:00", "12h", "en").replace(/\s/g, " ")).toBe("1:00 PM")
    expect(formatClock("24:00", "12h", "en").replace(/\s/g, " ")).toBe("12:00 AM")
  })

  it("formats the ruler", () => {
    expect(formatTick(6, "24h", "en")).toBe("6")
    expect(formatTick(24, "24h", "en")).toBe("24")
    expect(formatTick(18, "12h", "en").replace(/\s/g, " ")).toBe("6 PM")
    expect(formatTick(24, "12h", "en").replace(/\s/g, " ")).toBe("12 AM")
  })

  it("recognises the whole day", () => {
    expect(isAllDay("00:00", "24:00")).toBe(true)
    expect(isAllDay("00:00", "23:45")).toBe(false)
  })

  it("refuses a window with no length", () => {
    expect(windowError("09:00", "09:00")).toBe("playlists.sameTimes")
    expect(windowError("21:00", "03:00")).toBeNull()
  })

  it("refuses a start the engine cannot read", () => {
    expect(windowError("24:00", "05:00")).toBe("playlists.lateStart")
  })

  it("finds the playlists that stop the engine", () => {
    const lists = [playlist("Odd", "24:00", "05:00"), playlist("Idle", "24:00", "24:00"), playlist("Empty", "24:00", "00:00"), playlist("Fine", "00:00", "05:00")]
    expect(startsTooLate(lists).map(({ name }) => name)).toEqual(["Odd"])
  })
})

describe("playlistNameError", () => {
  it("needs a name", () => {
    expect(playlistNameError("   ", [])).toBe("playlists.nameRequired")
  })

  it("accepts apostrophes and accents", () => {
    expect(playlistNameError("Soirée d'hiver", [])).toBeNull()
  })

  it("refuses a name already used", () => {
    expect(playlistNameError(" Morning ", ["Morning"])).toBe("playlists.nameTaken")
  })

  it.each(["a/b", ".", ".."])("refuses %s, which no address can carry", (name) => {
    expect(playlistNameError(name, [])).toBe("playlists.nameInvalid")
  })
})

describe("refreshRule", () => {
  it.each([
    [{ interval: 60 }, ["playlists.everyMinute", {}]],
    [{ interval: 300 }, ["playlists.everyMinutes", { count: "5" }]],
    [{ interval: 5400 }, ["playlists.everyMinutes", { count: "90" }]],
    [{ interval: 3600 }, ["playlists.everyHour", {}]],
    [{ interval: 7200 }, ["playlists.everyHours", { count: "2" }]],
    [{ interval: 86400 }, ["playlists.everyDay", {}]],
    [{ interval: 172800 }, ["playlists.everyDays", { count: "2" }]],
  ])("reads %j", (refresh, expected) => {
    expect(refreshRule(refresh)).toEqual(expected)
  })

  it("reads a daily time", () => {
    expect(refreshRule({ scheduled: "07:00" })).toEqual(["playlists.dailyAt", { time: "07:00" }])
  })

  it("says nothing about an entry without a rule", () => {
    expect(refreshRule({})).toBeNull()
  })
})
