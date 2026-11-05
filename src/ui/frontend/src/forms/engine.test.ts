import { describe, expect, it } from "vitest"
import { definitions } from "./definitions"
import { contrastRatio, fromDraft, initialValues, isVisible, toDraft, toEntries, validate } from "./engine"
import type { Definition, FileValue } from "./types"

const params = { frame_styles: [{ name: "None" }], style_settings: false }

describe("switches", () => {
  const rss = definitions.rss

  it("keeps an option on after reopening and saving again", () => {
    const values = initialValues(rss, params, { includeImages: "true", feedUrl: "https://a.test" })
    expect(values.includeImages).toBe(true)
    expect(toEntries(rss, values, params)).toContainEqual(["includeImages", "true"])
  })

  it("sends nothing when off, as a checkbox does", () => {
    const values = initialValues(rss, params, { feedUrl: "https://a.test" })
    expect(toEntries(rss, values, params).map(([name]) => name)).not.toContain("includeImages")
  })

  it("reads padImage in the sense the plugin uses it", () => {
    const folder = definitions.image_folder
    expect(initialValues(folder, params, { padImage: "true" }).padImage).toBe(true)
    expect(initialValues(folder, params, { padImage: "false" }).padImage).toBe(false)
    expect(initialValues(folder, params, {}).padImage).toBe(true)
    const off = toEntries(folder, { ...initialValues(folder, params), padImage: false }, params)
    expect(off).toContainEqual(["padImage", "false"])
  })
})

describe("settings the description does not know", () => {
  const clock = definitions.clock
  const clockParams = { ...params, clock_faces: [] }

  it("survive a save", () => {
    const values = initialValues(clock, clockParams, { addedUpstream: "kept", addedList: ["a", "b"] })
    const entries = toEntries(clock, values, clockParams)
    expect(entries).toContainEqual(["addedUpstream", "kept"])
    expect(entries.filter(([name]) => name === "addedList").map(([, value]) => value)).toEqual(["a", "b"])
  })

  it("are dropped when not text, because the form would turn them into text", () => {
    const entries = toEntries(clock, initialValues(clock, clockParams, { image_index: 3 }), clockParams)
    expect(entries.map(([name]) => name)).not.toContain("image_index")
  })
})

describe("hidden fields", () => {
  const github = definitions.github
  const calendar = definitions.calendar
  const calendarParams = { ...params, locale_map: { en: "English" } }

  it("only show when their condition is true", () => {
    const values = initialValues(github, params)
    const repository = { when: { field: "githubType", in: ["stars"] } }
    expect(isVisible(repository, values)).toBe(false)
    expect(isVisible(repository, { ...values, githubType: "stars" })).toBe(true)
  })

  it("are not required", () => {
    const values = { ...initialValues(github, params), githubUsername: "me" }
    expect(validate(github, values, params)).toEqual({})
    expect(validate(github, { ...values, githubType: "stars" }, params)).toEqual({ "field-githubRepository": "form.required" })
  })

  it("are not sent, unless the old form did", () => {
    const month = toEntries(calendar, initialValues(calendar, calendarParams), calendarParams).map(([name]) => name)
    expect(month).not.toContain("displayNowIndicator")
    const day = toEntries(calendar, { ...initialValues(calendar, calendarParams), viewMode: "timeGridDay" }, calendarParams).map(([name]) => name)
    expect(day).toContain("displayNowIndicator")
    expect(toEntries(github, initialValues(github, params), params).map(([name]) => name)).toContain("githubRepository")
  })
})

describe("validate", () => {
  it("explains a missing or invalid address", () => {
    const rss = definitions.rss
    const values = initialValues(rss, params)
    expect(validate(rss, values, params)).toEqual({ "field-feedUrl": "form.required" })
    expect(validate(rss, { ...values, feedUrl: "example.com" }, params)).toEqual({ "field-feedUrl": "form.invalidUrl" })
    expect(validate(rss, { ...values, feedUrl: "https://example.com/feed" }, params)).toEqual({})
  })

  it("checks every repeated row", () => {
    const calendar = definitions.calendar
    const calendarParams = { ...params, locale_map: {} }
    const values = { ...initialValues(calendar, calendarParams), calendars: [{ "calendarURLs[]": "https://a.test", "calendarColors[]": "#000000" }, { "calendarURLs[]": "", "calendarColors[]": "#000000" }] }
    expect(validate(calendar, values, calendarParams)).toEqual({ "field-calendars-1-calendarURLs": "form.required" })
  })

  it("refuses a file the server would silently ignore", () => {
    const upload = definitions.image_upload
    const values = initialValues(upload, params)
    expect(validate(upload, values, params)).toEqual({ "field-imageFiles": "form.fileRequired" })
    const withFile = (name: string) => ({ ...values, "imageFiles[]": { existing: [], added: [new File(["x"], name)] } satisfies FileValue })
    expect(validate(upload, withFile("photo.JPG"), params)).toEqual({})
    expect(validate(upload, withFile("notes.txt"), params)).toEqual({ "field-imageFiles": "form.fileType" })
  })

  it.each([
    ["", "", false],
    ["48.85", "", false],
    ["north", "2.35", false],
    ["91", "2.35", false],
    ["48.85", "181", false],
    ["48.85", "2.35", true],
    ["-33.9", "151.2", true],
  ])("checks coordinates %j %j", (latitude, longitude, valid) => {
    const weather = definitions.weather
    const values = { ...initialValues(weather, params), latitude, longitude }
    expect(Object.keys(validate(weather, values, params))).toEqual(valid ? [] : ["field-location"])
  })

  it("checks numeric limits but allows blank", () => {
    const definition: Definition = { sections: [{ fields: [{ kind: "number", name: "weeks", label: "pf.title", min: 1, max: 52 }] }] }
    expect(validate(definition, { weeks: "" }, params)).toEqual({})
    expect(validate(definition, { weeks: "60" }, params)).toEqual({ "field-weeks": "form.outOfRange" })
    expect(validate(definition, { weeks: "4" }, params)).toEqual({})
  })
})

describe("addresses", () => {
  it("accepts a shared iCloud calendar, as the plugin does", () => {
    const calendar = definitions.calendar
    const calendarParams = { ...params, locale_map: {} }
    const values = { ...initialValues(calendar, calendarParams), calendars: [{ "calendarURLs[]": "webcal://p01.icloud.com/a.ics", "calendarColors[]": "#000000" }] }
    expect(validate(calendar, values, calendarParams)).toEqual({})
  })

  it("lets Screenshot try what Chromium accepts", () => {
    const screenshot = definitions.screenshot
    for (const url of ["example.com", "file:///home/pi/a.html", "http://localhost:8080"]) {
      expect(validate(screenshot, { ...initialValues(screenshot, params), url }, params)).toEqual({})
    }
    expect(validate(screenshot, initialValues(screenshot, params), params)).toEqual({ "field-url": "form.required" })
  })
})

describe("files", () => {
  const upload = definitions.image_upload

  it("keeps existing images and adds new ones", () => {
    const file = new File(["x"], "new.png")
    const values = { ...initialValues(upload, params, { "imageFiles[]": ["/a.png"] }) }
    values["imageFiles[]"] = { existing: ["/a.png"], added: [file] }
    expect(toEntries(upload, values, params).filter(([name]) => name === "imageFiles[]").map(([, value]) => value)).toEqual(["/a.png", file])
  })

  it("replaces a single background image", () => {
    const definition: Definition = { sections: [{ fields: [{ kind: "files", name: "background", label: "pf.title", multiple: false }] }] }
    const file = new File(["x"], "new.png")
    expect(toEntries(definition, { background: { existing: ["/old.png"], added: [file] } }, params)).toEqual([["background", file]])
    expect(toEntries(definition, { background: { existing: ["/old.png"], added: [] } }, params)).toEqual([["background", "/old.png"]])
  })
})

describe("weather", () => {
  const weather = definitions.weather

  it("forces a typed title with Open-Meteo, which does not know the place name", () => {
    const entries = toEntries(weather, { ...initialValues(weather, params), titleSelection: "location" }, params)
    expect(entries).toContainEqual(["titleSelection", "custom"])
  })

  it("keeps the choice with OpenWeatherMap", () => {
    const values = { ...initialValues(weather, params), titleSelection: "location", weatherProvider: "OpenWeatherMap" }
    expect(toEntries(weather, values, params)).toContainEqual(["titleSelection", "location"])
  })

  it("keeps the source the plugin already uses on an entry saved without one", () => {
    const values = initialValues(weather, params, { latitude: "48.85", longitude: "2.35", units: "metric" })
    expect(values.weatherProvider).toBe("OpenWeatherMap")
    expect(initialValues(weather, params).weatherProvider).toBe("OpenMeteo")
  })

  it("restores the graph icon step instead of resetting it", () => {
    expect(initialValues(weather, params, { graphIconStep: "6" }).graphIconStep).toBe("6")
  })
})

describe("drafts", () => {
  const rss = definitions.rss
  const initial = initialValues(rss, params)

  it("come back as typed", () => {
    const edited = { ...initial, title: "Mine", includeImages: true }
    expect(fromDraft(toDraft(edited), initial)).toEqual(edited)
  })

  it("ignore a field that no longer exists and fill in a new one", () => {
    const draft = JSON.stringify({ title: "Mine", gone: "x" })
    expect(fromDraft(draft, initial)).toEqual({ ...initial, title: "Mine" })
  })

  it("ignore a value of the wrong type", () => {
    expect(fromDraft(JSON.stringify({ includeImages: "yes" }), initial)).toEqual(initial)
  })

  it("never overwrite the settings only the server knows", () => {
    const start = initialValues(rss, params, { feedUrl: "https://a.test", addedUpstream: "new" })
    const draft = JSON.stringify({ title: "Mine", $extra: JSON.stringify({ addedUpstream: "old" }) })
    expect(toEntries(rss, fromDraft(draft, start)!, params)).toContainEqual(["addedUpstream", "new"])
  })

  it("survive being corrupted", () => {
    expect(fromDraft("{not json", initial)).toBeNull()
  })

  it("keep existing files but not chosen ones", () => {
    const upload = definitions.image_upload
    const start = initialValues(upload, params)
    const edited = { ...start, "imageFiles[]": { existing: ["/a.png"], added: [new File(["x"], "b.png")] } }
    expect(fromDraft(toDraft(edited), start)?.["imageFiles[]"]).toEqual({ existing: ["/a.png"], added: [] })
  })
})

describe("contrastRatio", () => {
  it("measures black on white", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21)
  })

  it("finds no contrast in one colour", () => {
    expect(contrastRatio("#c8102e", "#c8102e")).toBeCloseTo(1)
  })

  it("does not depend on the order", () => {
    expect(contrastRatio("#ffffff", "#123456")).toBeCloseTo(contrastRatio("#123456", "#ffffff"))
  })
})
