import type { Key } from "@/i18n/translate"
import type { Definition, Errors, Field, FormValues, Option, Params, Picture, Section } from "./types"

const opt = (value: string, label: Key): Option => ({ value, label })
const raw = (value: string, text = value): Option => ({ value, text })

const FONT_SIZES = [opt("x-small", "pf.size.xSmall"), opt("small", "pf.size.small"), opt("normal", "pf.size.normal"), opt("large", "pf.size.large"), opt("x-large", "pf.size.xLarge")]
const fontSize = (options = FONT_SIZES, fallback = "normal"): Field => ({ kind: "select", name: "fontSize", label: "pf.fontSize", options, default: fallback })

const UNTRUSTED = "pf.untrustedUrl" satisfies Key

/** Image entière sur un fond, ou recadrée pour remplir l'écran. Les plugins lisent `padImage`. */
const imageFit: Field[] = [
  { kind: "switch", name: "padImage", label: "pf.fit.whole", help: "pf.fit.wholeHelp", default: true, on: "true", off: "false" },
  { kind: "segmented", name: "backgroundOption", label: "pf.fit.background", options: [opt("blur", "pf.fit.blur"), opt("color", "pf.fit.color")], default: "blur", when: { field: "padImage", in: ["true"] }, sendWhenHidden: true },
  { kind: "color", name: "backgroundColor", label: "pf.fit.backgroundColor", default: "#ffffff", when: { field: "backgroundOption", in: ["color"] }, sendWhenHidden: true },
]

const FRAMES: Record<string, { art: string; label: Key }> = {
  None: { art: "None", label: "pf.frame.none" },
  Corner: { art: "Corner", label: "pf.frame.corner" },
  "Top and Bottom": { art: "Top and bottom", label: "pf.frame.topBottom" },
  Rectangle: { art: "Rectangle", label: "pf.frame.rectangle" },
}

const CLOCK_FACE_LABELS: Record<string, Key> = { "Gradient Clock": "pf.clock.gradient", "Digital Clock": "pf.clock.digital", "Divided Clock": "pf.clock.divided", "Word Clock": "pf.clock.word" }

export function styleSection(params: Params): Section {
  const frames = (params.frame_styles ?? []) as { name: string }[]
  return {
    title: "pf.style",
    fields: [
      { kind: "pictures", name: "selectedFrame", label: "pf.style.frame", choices: (): Picture[] => frames.map(({ name }) => ({ value: name, text: name, label: FRAMES[name]?.label, frame: FRAMES[name]?.art ?? "None" })) },
      { kind: "segmented", name: "backgroundOption", label: "pf.style.background", options: [opt("color", "pf.style.color"), opt("image", "pf.style.image")], default: "color" },
      { kind: "inks", name: "backgroundColor", label: "pf.style.backgroundColor", default: "#ffffff", when: { field: "backgroundOption", in: ["color"] }, sendWhenHidden: true },
      { kind: "files", name: "backgroundImageFile", label: "pf.style.backgroundImage", multiple: false, when: { field: "backgroundOption", in: ["image"] }, sendWhenHidden: true },
      { kind: "inks", name: "textColor", label: "pf.style.textColor", default: "#000000" },
      { kind: "contrast", name: "contrast", text: "textColor", background: "backgroundColor", when: { field: "backgroundOption", in: ["color"] } },
      {
        kind: "more",
        name: "margins",
        label: "pf.style.margins",
        fields: (["topMargin", "bottomMargin", "leftMargin", "rightMargin"] as const).map((name): Field => ({ kind: "number", name, label: `pf.style.${name}`, min: 0, max: 100, step: 5, placeholder: "0" })),
      },
    ],
  }
}

function strings(params: Params, key: string) {
  return (params[key] ?? []) as string[]
}

const urlPlugin = (label: Key, format?: "url"): Definition => ({
  notice: UNTRUSTED,
  sections: [{ fields: [{ kind: "text", name: "url", label, placeholder: "https://", required: true, format }] }],
})

const OPENAI_MODELS = [raw("gpt-4o-mini", "GPT-4o mini"), raw("gpt-4o", "GPT-4o"), raw("gpt-4.1", "GPT-4.1"), raw("gpt-4.1-mini", "GPT-4.1 mini"), raw("gpt-4.1-nano", "GPT-4.1 nano"), raw("gpt-5", "GPT-5"), raw("gpt-5-mini", "GPT-5 mini"), raw("gpt-5-nano", "GPT-5 nano")]

const CALENDAR_TIME_VIEWS = ["timeGridDay", "timeGridWeek"]

function location(values: FormValues): Errors {
  const latitude = String(values.latitude ?? "").trim()
  const longitude = String(values.longitude ?? "").trim()
  const number = (value: string, limit: number) => value !== "" && Number.isFinite(Number(value)) && Math.abs(Number(value)) <= limit
  return number(latitude, 90) && number(longitude, 180) ? {} : { "field-location": "pf.weather.locationRequired" }
}

export const definitions: Record<string, Definition> = {
  year_progress: { sections: [] },
  image_url: urlPlugin("pf.url.image", "url"),
  // Chromium accepte aussi « example.com » ou une adresse locale : on ne refuse rien de plus que lui.
  screenshot: urlPlugin("pf.url.page"),
  countdown: {
    sections: [{ fields: [
      { kind: "text", name: "title", label: "pf.title" },
      { kind: "date", name: "date", label: "pf.countdown.date", required: true },
    ] }],
  },
  apod: {
    sections: [{ fields: [
      { kind: "switch", name: "randomizeApod", label: "pf.randomDate", default: false },
      { kind: "date", name: "customDate", label: "pf.dateOptional", help: "pf.dateBlankLatest", when: { field: "randomizeApod", in: ["false"] } },
    ] }],
  },
  wpotd: {
    sections: [{ fields: [
      { kind: "switch", name: "randomizeWpotd", label: "pf.randomDate", default: false },
      { kind: "date", name: "customDate", label: "pf.dateOptional", help: "pf.dateBlankToday", when: { field: "randomizeWpotd", in: ["false"] } },
      { kind: "switch", name: "shrinkToFitWpotd", label: "pf.wpotd.shrink", default: true },
    ] }],
  },
  comic: {
    sections: [{ fields: [
      { kind: "select", name: "comic", label: "pf.comic.comic", options: (params) => strings(params, "comics").map((comic) => raw(comic)) },
      { kind: "switch", name: "titleCaption", label: "pf.comic.caption", default: true },
      fontSize(["12", "14", "16", "18", "20"].map((size) => raw(size)), "14"),
    ] }],
  },
  ai_text: {
    apiKey: { key: "OPEN_AI_SECRET" },
    previewNote: "preview.billed",
    sections: [{ fields: [
      { kind: "text", name: "title", label: "pf.title" },
      { kind: "select", name: "textModel", label: "pf.ai.textModel", options: OPENAI_MODELS },
      { kind: "textarea", name: "textPrompt", label: "pf.ai.prompt", required: true },
    ] }],
  },
  ai_image: {
    apiKey: { key: "OPEN_AI_SECRET" },
    previewNote: "preview.billed",
    sections: [{ fields: [
      { kind: "textarea", name: "textPrompt", label: "pf.ai.prompt" },
      { kind: "switch", name: "randomizePrompt", label: "pf.ai.randomPrompt", default: false },
      { kind: "select", name: "imageModel", label: "pf.ai.imageModel", options: [raw("gpt-image-1", "GPT Image 1"), raw("gpt-image-2", "GPT Image 2")] },
      { kind: "segmented", name: "quality", label: "pf.ai.quality", options: [opt("low", "pf.ai.low"), opt("medium", "pf.ai.medium"), opt("high", "pf.ai.high")], default: "medium" },
    ] }],
  },
  rss: {
    notice: UNTRUSTED,
    sections: [{ fields: [
      { kind: "text", name: "feedUrl", label: "pf.rss.feedUrl", placeholder: "https://", required: true, format: "url" },
      { kind: "text", name: "title", label: "pf.title" },
      { kind: "switch", name: "includeImages", label: "pf.rss.images", default: false },
      fontSize(),
    ] }],
  },
  unsplash: {
    apiKey: { key: "UNSPLASH_ACCESS_KEY" },
    sections: [{ fields: [
      { kind: "text", name: "search_query", label: "pf.unsplash.query", help: "pf.unsplash.queryHelp" },
      { kind: "text", name: "collections", label: "pf.unsplash.collections", help: "pf.unsplash.collectionsHelp", placeholder: "1234,5678" },
      { kind: "select", name: "content_filter", label: "pf.unsplash.filter", options: [opt("low", "pf.unsplash.filterLow"), opt("high", "pf.unsplash.filterHigh")] },
      { kind: "select", name: "color", label: "pf.unsplash.color", options: [
        opt("", "pf.any"), opt("black_and_white", "pf.unsplash.bw"), opt("black", "pf.color.black"), opt("white", "pf.color.white"), opt("yellow", "pf.color.yellow"), opt("orange", "pf.color.orange"), opt("red", "pf.color.red"), opt("purple", "pf.color.purple"), opt("magenta", "pf.color.magenta"), opt("green", "pf.color.green"), opt("teal", "pf.color.teal"), opt("blue", "pf.color.blue"),
      ] },
      { kind: "select", name: "orientation", label: "pf.unsplash.orientation", options: [opt("", "pf.any"), opt("landscape", "settings.horizontal"), opt("portrait", "settings.vertical")] },
    ] }],
  },
  github: {
    // Les étoiles passent par l'API publique, sans clé.
    apiKey: { key: "GITHUB_SECRET", when: { field: "githubType", in: ["contributions", "sponsors"] } },
    sections: [{ fields: [
      { kind: "select", name: "githubType", label: "pf.github.type", options: [opt("contributions", "pf.github.contributions"), opt("sponsors", "pf.github.sponsors"), opt("stars", "pf.github.stars")] },
      { kind: "text", name: "githubUsername", label: "pf.github.username", required: true },
      { kind: "text", name: "githubRepository", label: "pf.github.repository", required: true, when: { field: "githubType", in: ["stars"] }, sendWhenHidden: true },
      { kind: "colors", name: "contributionColor[]", label: "pf.github.colors", default: ["#ebedf0", "#9be9a8", "#40c463", "#30a14e", "#216e39"], when: { field: "githubType", in: ["contributions"] }, sendWhenHidden: true },
    ] }],
  },
  clock: {
    sections: [{ fields: [
      {
        kind: "pictures",
        name: "selectedClockFace",
        label: "pf.clock.face",
        choices: (params) => ((params.clock_faces ?? []) as { name: string; icon: string; primary_color: string; secondary_color: string }[]).map((face) => ({
          value: face.name,
          text: face.name,
          label: CLOCK_FACE_LABELS[face.name],
          image: `/images/clock/${face.icon}`,
          sets: { primaryColor: face.primary_color, secondaryColor: face.secondary_color },
        })),
      },
      { kind: "color", name: "primaryColor", label: "pf.clock.primary", default: "#db3246" },
      { kind: "color", name: "secondaryColor", label: "pf.clock.secondary", default: "#000000" },
    ] }],
  },
  image_folder: {
    sections: [{ fields: [
      { kind: "text", name: "folder_path", label: "pf.folder.path", help: "pf.folder.pathHelp", placeholder: "/home/pi/pictures", required: true },
      ...imageFit,
    ] }],
  },
  image_album: {
    apiKey: { key: "IMMICH_KEY" },
    sections: [{ fields: [
      { kind: "fixed", name: "albumProvider", value: "Immich" },
      { kind: "text", name: "url", label: "pf.album.url", placeholder: "https://", required: true, format: "url" },
      { kind: "text", name: "album", label: "pf.album.name", required: true },
      { kind: "switch", name: "randomize", label: "pf.randomOrder", default: false },
      ...imageFit,
    ] }],
  },
  image_upload: {
    sections: [{ fields: [
      { kind: "files", name: "imageFiles[]", label: "pf.upload.images", multiple: true, required: true },
      { kind: "switch", name: "randomize", label: "pf.randomOrder", default: false },
      ...imageFit,
    ] }],
  },
  newspaper: {
    sections: [{ fields: [
      { kind: "custom", name: "newspaper", label: "pf.newspaper.name", names: { newspaperName: "", newspaperSlug: "", locationSearch: "" } },
    ] }],
    validate: (values): Errors => (values.newspaperSlug ? {} : { "field-newspaper": "pf.newspaper.required" }),
  },
  todo_list: {
    sections: [{ fields: [
      { kind: "text", name: "title", label: "pf.title" },
      {
        kind: "rows",
        name: "lists",
        label: "pf.todo.lists",
        add: "pf.todo.add",
        max: 3,
        columns: [
          { name: "list-title[]", label: "pf.todo.listTitle", kind: "text" },
          { name: "list[]", label: "pf.todo.tasks", kind: "textarea" },
        ],
      },
      { kind: "select", name: "listStyle", label: "pf.todo.style", options: [
        opt("disc", "pf.todo.disc"), opt("square", "pf.todo.square"), opt("'\\25C6  '", "pf.todo.diamond"), opt("decimal", "pf.todo.decimal"), opt("lower-roman", "pf.todo.roman"), opt("lower-alpha", "pf.todo.alpha"),
      ] },
      fontSize(),
    ] }],
  },
  calendar: {
    sections: [
      { fields: [
        {
          kind: "rows",
          name: "calendars",
          label: "pf.calendar.calendars",
          add: "pf.calendar.add",
          columns: [
            { name: "calendarURLs[]", label: "pf.calendar.url", kind: "text", required: true, format: "calendar", placeholder: "https://" },
            { name: "calendarColors[]", label: "pf.calendar.color", kind: "color", default: "#007bff" },
          ],
        },
        { kind: "segmented", name: "viewMode", label: "pf.calendar.layout", default: "dayGridMonth", options: [opt("timeGridDay", "pf.calendar.day"), opt("timeGridWeek", "pf.calendar.week"), opt("dayGrid", "pf.calendar.weeks"), opt("dayGridMonth", "pf.calendar.month"), opt("listMonth", "pf.calendar.list")] },
        { kind: "select", name: "language", label: "pf.calendar.language", options: (params) => Object.entries((params.locale_map ?? {}) as Record<string, string>).map(([code, name]) => raw(code, name)), default: "en" },
      ] },
      { title: "pf.whatToShow", fields: [
        { kind: "switch", name: "displayTitle", label: "pf.calendar.showTitle", default: true },
        { kind: "switch", name: "displayWeekends", label: "pf.calendar.weekends", default: true },
        { kind: "switch", name: "displayEventTime", label: "pf.calendar.eventTime", default: true },
        { kind: "switch", name: "displayNowIndicator", label: "pf.calendar.now", default: true, when: { field: "viewMode", in: CALENDAR_TIME_VIEWS }, fields: [
          { kind: "color", name: "nowIndicatorColor", label: "pf.calendar.nowColor", default: "#ff0000", when: { field: "viewMode", in: CALENDAR_TIME_VIEWS } },
        ] },
        { kind: "switch", name: "displayPreviousDays", label: "pf.calendar.previous", default: true, when: { field: "viewMode", in: ["timeGridWeek"] } },
        { kind: "select", name: "weekStartDay", label: "pf.calendar.weekStart", when: { field: "viewMode", in: ["timeGridWeek", "dayGridMonth", "dayGrid"] }, options: [opt("0", "pf.day.sunday"), opt("1", "pf.day.monday"), opt("2", "pf.day.tuesday"), opt("3", "pf.day.wednesday"), opt("4", "pf.day.thursday"), opt("5", "pf.day.friday"), opt("6", "pf.day.saturday")] },
        { kind: "number", name: "startTimeInterval", label: "pf.calendar.startHour", min: 0, max: 24, placeholder: "0", when: { field: "viewMode", in: CALENDAR_TIME_VIEWS } },
        { kind: "number", name: "endTimeInterval", label: "pf.calendar.endHour", min: 0, max: 24, placeholder: "24", when: { field: "viewMode", in: CALENDAR_TIME_VIEWS } },
        { kind: "number", name: "displayWeeks", label: "pf.calendar.weeksCount", min: 1, max: 52, placeholder: "4", when: { field: "viewMode", in: ["dayGrid"] } },
        fontSize([opt("x-small", "pf.size.xSmall"), opt("smaller", "pf.size.smaller"), opt("small", "pf.size.small"), opt("normal", "pf.size.normal"), opt("large", "pf.size.large"), opt("larger", "pf.size.larger"), opt("x-large", "pf.size.xLarge")]),
      ] },
    ],
  },
  weather: {
    apiKey: { key: "OPEN_WEATHER_MAP_SECRET", when: { field: "weatherProvider", in: ["OpenWeatherMap"] } },
    validate: location,
    // Open-Meteo ne fournit pas le nom du lieu : le titre vient forcément de la saisie.
    finalize: (settings) => {
      if (settings.get("weatherProvider")?.[0] === "OpenMeteo") settings.set("titleSelection", ["custom"])
    },
    sections: [
      { title: "pf.weather.where", fields: [
        { kind: "custom", name: "location", label: "pf.weather.place", names: { latitude: "", longitude: "" } },
        { kind: "segmented", name: "units", label: "pf.weather.units", default: "imperial", options: [opt("metric", "pf.weather.metric"), opt("imperial", "pf.weather.imperial"), opt("standard", "pf.weather.standard")] },
        { kind: "more", name: "source", label: "pf.weather.more", fields: [
          { kind: "select", name: "weatherProvider", label: "pf.weather.provider", default: "OpenMeteo", storedDefault: "OpenWeatherMap", options: [opt("OpenMeteo", "pf.weather.openMeteo"), opt("OpenWeatherMap", "pf.weather.openWeatherMap")] },
          { kind: "select", name: "weatherTimeZone", label: "pf.weather.timeZone", default: "locationTimeZone", options: [opt("locationTimeZone", "pf.weather.zonePlace"), opt("localTimeZone", "pf.weather.zoneDevice")], when: { field: "weatherProvider", in: ["OpenWeatherMap"] } },
        ] },
      ] },
      { title: "pf.whatToShow", fields: [
        { kind: "segmented", name: "titleSelection", label: "pf.weather.titleFrom", default: "location", options: [opt("location", "pf.weather.titlePlace"), opt("custom", "pf.weather.titleCustom")], when: { field: "weatherProvider", in: ["OpenWeatherMap"] }, sendWhenHidden: true },
        { kind: "text", name: "customTitle", label: "pf.title" },
        { kind: "switch", name: "displayMetrics", label: "pf.weather.metrics", default: true },
        { kind: "switch", name: "displayGraph", label: "pf.weather.graph", default: true },
        { kind: "switch", name: "displayGraphIcons", label: "pf.weather.graphIcons", default: false, fields: [
          { kind: "select", name: "graphIconStep", label: "pf.weather.graphIconStep", default: "2", options: ["1", "2", "4", "6", "12"].map((hours) => raw(hours)) },
        ] },
        { kind: "switch", name: "displayForecast", label: "pf.weather.forecast", default: true, fields: [
          { kind: "select", name: "forecastDays", label: "pf.weather.forecastDays", default: "7", options: ["3", "5", "7"].map((days) => raw(days)) },
        ] },
        { kind: "switch", name: "displayRain", label: "pf.weather.rain", default: false },
        { kind: "switch", name: "moonPhase", label: "pf.weather.moon", default: false },
        { kind: "switch", name: "displayRefreshTime", label: "pf.weather.refreshTime", default: true },
      ] },
    ],
  },
}
