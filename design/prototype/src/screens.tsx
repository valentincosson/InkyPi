import { useCallback, useEffect, useRef, useState, type ReactNode } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { PluginArt } from "@/art"
import { plugins, type Plugin } from "@/data"
import { SkipLink, Status, usePluginSearch, useScreen } from "@/flow"
import { AddToPlaylist, Contents, FormValues, Segmented, Styling, Title, Where } from "@/form"
import { ArrowLeftIcon, KeyRoundIcon, LayersIcon, MonitorIcon, MoonIcon, PlusIcon, PuzzleIcon, RefreshCwIcon, SearchIcon, SettingsIcon, SkipForwardIcon, SunIcon } from "lucide-react"

const STORAGE_KEY = "inkypi-theme"
const nav = [["Screen", "home", MonitorIcon], ["Plugins", "plugins", PuzzleIcon], ["Playlists", "home", LayersIcon], ["Settings", "home", SettingsIcon], ["API keys", "home", KeyRoundIcon]] as const

function initialTheme() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored === "dark" || stored === "light") return stored
  } catch { /* stockage indisponible : on suit le système */ }
  return matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"
}

function ThemeToggle() {
  const [theme, setTheme] = useState(initialTheme)
  useEffect(() => {
    document.documentElement.className = theme
    try { localStorage.setItem(STORAGE_KEY, theme) } catch { /* simple confort */ }
  }, [theme])
  const dark = theme === "dark"
  return (
    <Button variant="ghost" size="icon" className="size-10" aria-label={dark ? "Switch to light mode" : "Switch to dark mode"} onClick={() => setTheme(dark ? "light" : "dark")}>
      {dark ? <SunIcon aria-hidden="true" /> : <MoonIcon aria-hidden="true" />}
    </Button>
  )
}

function Shell({ current, children }: { current: string; children: ReactNode }) {
  return (
    <div className="min-h-screen">
      <header className="z-20 border-b border-border bg-card lg:sticky lg:top-0">
        <SkipLink />
        <div className="mx-auto flex max-w-[1132px] flex-wrap items-center justify-between gap-x-6 px-5 py-2 lg:flex-nowrap lg:px-0">
          <a href="#home" className="py-1.5 text-lg font-semibold tracking-tight lg:mr-2">InkyPi</a>
          <div className="flex items-center gap-2 lg:order-last">
            <span className="inline-flex items-center gap-2 text-sm whitespace-nowrap text-muted-foreground"><span className="size-2 rounded-full bg-[var(--good)]" aria-hidden="true" />Screen connected</span>
            <span className="-mr-2"><ThemeToggle /></span>
          </div>
          <nav className="-mx-1 mt-1 flex w-[calc(100%+0.5rem)] gap-0.5 overflow-x-auto pb-1 lg:m-0 lg:w-auto lg:flex-1 lg:p-0" aria-label="Main">
            {nav.map(([label, screen, Icon]) => (
              <a key={label} href={`#${screen}`} aria-current={label === current ? "page" : undefined}
                className={`flex min-h-10 shrink-0 items-center gap-2 rounded-[var(--radius)] px-3 text-sm font-medium transition-colors ${label === current ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-accent/70 hover:text-foreground"}`}>
                <Icon className="size-4" aria-hidden="true" />{label}
              </a>
            ))}
          </nav>
        </div>
      </header>
      <main id="main" className="mx-auto max-w-[1132px] scroll-mt-20 px-5 py-7 pb-36 lg:px-0 lg:pb-16">{children}</main>
    </div>
  )
}

function Device({ image, alt, busy }: { image: string; alt: string; busy?: boolean }) {
  return (
    <div className="device relative">
      <img src={image} alt={alt} />
      {busy ? <span className="device-progress" aria-hidden="true" /> : null}
    </div>
  )
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return <div className="flex items-baseline justify-between gap-4 border-b border-border py-2.5 last:border-0"><dt className="text-muted-foreground">{label}</dt><dd className="text-right font-medium tabular-nums">{children}</dd></div>
}

export function Home() {
  const screen = useScreen()
  return (
    <Shell current="Screen">
      <div className="grid items-start gap-6 lg:grid-cols-4">
        <div className="lg:col-span-3"><Device image={screen.now.image} alt={`${screen.now.name}, on the screen`} busy={screen.busy} /></div>
        <div>
          <h1 className="text-[1.625rem] leading-tight font-semibold">{screen.now.name}</h1>
          <p className="mt-1 text-muted-foreground">On the screen now</p>
          <dl className="mt-3">
            <Row label="Plugin">{screen.now.plugin}</Row>
            <Row label="Playlist">All day</Row>
            <Row label="Last refresh">{screen.lastRefresh}</Row>
            <Row label="Changes at">00:48</Row>
          </dl>
          <div className="mt-3 grid gap-2">
            <Button size="lg" className="min-h-10" aria-disabled={screen.busy} onClick={screen.refresh}><RefreshCwIcon data-icon="inline-start" />Refresh</Button>
            <Button size="lg" variant="outline" className="min-h-10" aria-disabled={screen.busy} onClick={screen.next}><SkipForwardIcon data-icon="inline-start" />Show next</Button>
          </div>
          <Status phase={screen.phase} className="mt-3 text-sm text-muted-foreground" />
        </div>
      </div>
      <section className="mt-10" aria-labelledby="next">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="next" className="text-lg font-semibold">Up next</h2>
          <Button variant="outline" render={<a href="#plugins" />} className="min-h-10"><PlusIcon data-icon="inline-start" />Add content</Button>
        </div>
        <ol className="mt-3 grid grid-cols-2 gap-6 lg:grid-cols-4">
          {screen.upcoming.map((item) => (
            <li key={item.name}>
              <a href="#weather" className="group block">
                <img src={item.image} alt="" className="block aspect-[5/3] w-full rounded-[var(--radius)] bg-white shadow-[0_0_0_1px_var(--border)] transition-shadow group-hover:shadow-[0_0_0_1px_var(--input)]" />
                <span className="mt-2 flex items-baseline justify-between gap-3 text-sm"><span className="font-medium">{item.name}</span><span className="text-muted-foreground tabular-nums">{item.at}</span></span>
              </a>
            </li>
          ))}
        </ol>
      </section>
    </Shell>
  )
}

export function Plugins() {
  const search = usePluginSearch(plugins)
  const groups = ["Pictures", "Information"].filter((g) => search.results.some((p) => p.group === g))
  const href = (p: Plugin) => (p.id === "weather" ? "#weather" : "#plugins")
  return (
    <Shell current="Plugins">
      <h1 className="text-[1.625rem] leading-tight font-semibold">Plugins</h1>
      <p className="mt-1 text-muted-foreground">Choose what to show on the screen.</p>
      <div className="mt-5 flex flex-wrap items-center gap-3">
        <div className="relative w-full max-w-xs">
          <SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input aria-label="Search plugins" placeholder="Search plugins" value={search.query} onChange={(e) => search.setQuery(e.target.value)} className="min-h-10 bg-card pl-9" />
        </div>
        <Segmented label="Filter by type" value={search.group} onChange={search.setGroup} options={["All", "Pictures", "Information"].map((g) => ({ label: g, value: g }))} />
      </div>
      <p role="status" className="sr-only">{search.results.length} plugins</p>
      {groups.length === 0 && (
        <div className="mt-10 rounded-[var(--radius)] border border-dashed border-input p-10 text-center">
          <p className="font-medium">No plugin matches “{search.query}”{search.group === "All" ? "" : ` in ${search.group}`}.</p>
          <Button variant="outline" className="mt-3 min-h-10" onClick={() => { search.setQuery(""); search.setGroup("All") }}>Show all plugins</Button>
        </div>
      )}
      {groups.map((group) => (
        <section key={group} className="mt-8" aria-labelledby={`g-${group}`}>
          <h2 id={`g-${group}`} className="text-lg font-semibold">{group}</h2>
          <ul className="mt-3 grid grid-cols-2 gap-x-6 gap-y-5 md:grid-cols-3 lg:grid-cols-4">
            {search.results.filter((p) => p.group === group).map((plugin) => (
              <li key={plugin.id}>
                <a href={href(plugin)} title={plugin.hint} className="group block">
                  <span className="relative block overflow-hidden rounded-[var(--radius)] shadow-[0_0_0_1px_var(--border)] transition-shadow group-hover:shadow-[0_0_0_1px_var(--input)]">
                    <PluginArt id={plugin.id} />
                    {plugin.key && <span className="absolute top-2 right-2 inline-flex items-center gap-1 rounded-full bg-card px-2 py-0.5 text-xs font-medium text-muted-foreground shadow-[0_0_0_1px_var(--border)]"><KeyRoundIcon className="size-3" aria-hidden="true" />API key</span>}
                  </span>
                  <span className="mt-2 block text-sm font-medium">{plugin.name}</span>
                </a>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </Shell>
  )
}

function Part({ title, children }: { title: string; children: ReactNode }) {
  return <section className="grid gap-4 border-b border-border py-7 first:pt-0 last:border-0"><h2 className="text-lg font-semibold">{title}</h2>{children}</section>
}

export function WeatherForm() {
  const screen = useScreen()
  const shown = useRef<Record<string, unknown>>({})
  const current = useRef<Record<string, unknown>>({})
  const [stale, setStale] = useState(false)
  const [updating, setUpdating] = useState(false)
  const [added, setAdded] = useState(false)
  const compare = () => setStale(Object.keys(current.current).some((k) => current.current[k] !== shown.current[k]))
  const report = useCallback((key: string, value: unknown) => {
    if (!(key in shown.current)) shown.current[key] = value
    current.current[key] = value
    compare()
  }, [])
  const update = () => {
    if (updating || !stale) return
    const snapshot = { ...current.current }
    setUpdating(true)
    window.setTimeout(() => { shown.current = snapshot; setUpdating(false); compare() }, 1600)
  }
  const send = () => {
    if (screen.busy) return
    shown.current = { ...current.current }
    compare(); setAdded(false); screen.send()
  }
  const previewStatus = updating ? "Updating preview" : stale ? "Preview out of date" : "Preview up to date"
  return (
    <Shell current="Plugins">
      <a href="#plugins" className="-ml-0.5 inline-flex min-h-9 items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"><ArrowLeftIcon className="size-4" aria-hidden="true" />Plugins</a>
      <h1 className="mt-1 text-[1.625rem] leading-tight font-semibold">Weather</h1>
      <p className="mt-1 text-muted-foreground">Today and the coming days.</p>
      <div className="mt-6 grid items-start gap-8 lg:grid-cols-[minmax(0,520px)_minmax(0,1fr)] lg:gap-12">
        <FormValues.Provider value={report}>
          <div className="order-1 lg:order-none">
            <Part title="Where"><Where /></Part>
            <Part title="What to show"><Title /><Contents /></Part>
            <Part title="Style"><Styling /></Part>
          </div>
        </FormValues.Provider>
        <aside className="grid gap-3 lg:sticky lg:top-[84px]" aria-label="Preview">
          <Device image={screen.now.image} alt="Preview of the weather plugin" busy={updating || screen.busy} />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
              {stale && !updating ? <span className="size-2 rounded-full bg-[var(--warn)]" aria-hidden="true" /> : null}{previewStatus}
            </p>
            <Button variant="outline" className="min-h-10" aria-disabled={updating || !stale} onClick={update}><RefreshCwIcon data-icon="inline-start" className={updating ? "animate-spin" : ""} />Update preview</Button>
          </div>
          <div className="mobile-actions grid gap-2">
            <Status phase={added ? "done" : screen.phase} text={added ? "Added to All day" : undefined} className="text-sm text-muted-foreground" />
            <div className="grid grid-cols-2 gap-2">
              <Button size="lg" className="min-h-10" aria-disabled={screen.busy} onClick={send}>Show on screen</Button>
              <AddToPlaylist onAdded={() => setAdded(true)} trigger={<Button size="lg" variant="outline" className="min-h-10">Add to playlist</Button>} />
            </div>
          </div>
        </aside>
      </div>
    </Shell>
  )
}
