import { describe, expect, it } from "vitest"
import type { DeviceSettings } from "@/api"
import { normalize, splitInterval, suggestedTimezone, toFormData, toValues, validate } from "@/settings-form"

const settings: DeviceSettings = {
  name: "Frame",
  orientation: "horizontal",
  rotated: false,
  log_system_stats: false,
  timezone: "Europe/Paris",
  time_format: "24h",
  interval_seconds: 1800,
  image: { saturation: 1.2, contrast: 1, sharpness: 1, brightness: 1, inky_saturation: 0.65 },
  inky_display: true,
  timezones: ["Europe/Paris", "UTC"],
}

describe("splitInterval", () => {
  it.each([
    [3600, "1", "hour"],
    [7200, "2", "hour"],
    [5400, "90", "minute"],
    [1800, "30", "minute"],
    [90, "2", "minute"],
    [30, "1", "minute"],
  ])("%i seconds", (seconds, interval, unit) => {
    expect(splitInterval(seconds)).toEqual({ interval, unit })
  })
})

describe("suggestedTimezone", () => {
  it("proposes the browser time zone when the device knows it", () => {
    expect(suggestedTimezone(settings.timezones, "UTC")).toBe("UTC")
  })

  it("proposes nothing otherwise", () => {
    expect(suggestedTimezone(settings.timezones, "Mars/Olympus")).toBe("")
  })
})

describe("validate", () => {
  const valid = toValues(settings)

  it("accepts the current settings", () => {
    expect(validate(valid, settings.timezones)).toEqual({})
  })

  it.each([
    [{ name: "  " }, "name"],
    [{ timezone: "" }, "timezone"],
    [{ timezone: "Nowhere/Land" }, "timezone"],
    [{ interval: "" }, "interval"],
    [{ interval: "0" }, "interval"],
    [{ interval: "1.5" }, "interval"],
    [{ interval: "abc" }, "interval"],
    [{ interval: "25", unit: "hour" as const }, "interval"],
    [{ interval: "1441", unit: "minute" as const }, "interval"],
  ])("rejects %j", (change, field) => {
    expect(Object.keys(validate({ ...valid, ...change }, settings.timezones))).toEqual([field])
  })

  it.each([
    [{ interval: "24", unit: "hour" as const }],
    [{ interval: "1440", unit: "minute" as const }],
  ])("accepts the limit %j", (change) => {
    expect(validate({ ...valid, ...change }, settings.timezones)).toEqual({})
  })
})

describe("toFormData", () => {
  it("sends checkboxes only when they are on", () => {
    const off = toFormData(toValues(settings))
    expect(off.has("invertImage")).toBe(false)
    expect(off.has("logSystemStats")).toBe(false)

    const on = toFormData({ ...toValues(settings), rotated: true, logStats: true })
    expect(on.get("invertImage")).toBe("on")
    expect(on.get("logSystemStats")).toBe("on")
  })

  it("keeps the Inky saturation set on another display", () => {
    const form = toFormData(toValues({ ...settings, inky_display: false }))
    expect(form.get("inky_saturation")).toBe("0.65")
  })

  it("adds nothing for a display that has no Inky saturation", () => {
    const form = toFormData(toValues({ ...settings, inky_display: false, image: { ...settings.image, inky_saturation: null } }))
    expect(form.has("inky_saturation")).toBe(false)
  })

  it("uses the field names of the server route", () => {
    expect([...toFormData(normalize(toValues(settings))).keys()].sort()).toEqual(
      ["brightness", "contrast", "deviceName", "inky_saturation", "interval", "orientation", "saturation", "sharpness", "timeFormat", "timezoneName", "unit"].sort(),
    )
  })
})

describe("normalize", () => {
  it("removes stray spaces and leading zeros", () => {
    const values = normalize({ ...toValues(settings), name: " Frame ", interval: " 030 " })
    expect(values.name).toBe("Frame")
    expect(values.interval).toBe("30")
  })
})
