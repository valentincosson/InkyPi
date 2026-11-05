import { createContext, useContext, useEffect, useState, type ReactNode } from "react"
import { Button } from "@/components/ui/button"
import { Combobox, ComboboxContent, ComboboxEmpty, ComboboxInput, ComboboxItem, ComboboxList } from "@/components/ui/combobox"
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { CalendarDaysIcon, ChartSplineIcon, ChevronDownIcon, ClockIcon, CloudRainIcon, MapPinIcon, MoonIcon, PlusIcon, SunriseIcon } from "lucide-react"
import { FrameArt } from "@/art"

type Option = { label: string; value: string }
const cities = ["Paris, France", "Lyon, France", "Marseille, France", "Bruxelles, Belgium", "Genève, Switzerland", "Montréal, Canada"]
const inks = [["Black", "#000000"], ["White", "#ffffff"], ["Red", "#c8102e"], ["Yellow", "#f2c500"], ["Blue", "#1d4ea8"], ["Green", "#1f7a45"]]

/** Signale chaque valeur du formulaire au parent, qui la compare à celle de l'aperçu affiché. */
export const FormValues = createContext<(key: string, value: unknown) => void>(() => {})

function useField<T>(key: string, initial: T) {
  const report = useContext(FormValues)
  const [value, setValue] = useState(initial)
  useEffect(() => { report(key, value) }, [key, value, report])
  return [value, setValue] as const
}

export function Choice({ id, label, options, value, onChange, hideLabel }: { id: string; label: string; options: Option[]; value: string; onChange: (v: string) => void; hideLabel?: boolean }) {
  const select = (
    <Select items={options} value={value} onValueChange={(v) => onChange(String(v))}>
      <SelectTrigger id={id} aria-label={hideLabel ? label : undefined} className="min-h-10 w-full bg-card"><SelectValue /></SelectTrigger>
      <SelectContent>{options.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
    </Select>
  )
  return hideLabel ? select : <Field><FieldLabel htmlFor={id}>{label}</FieldLabel>{select}</Field>
}

function TextField({ id, label, name, initial, placeholder, type = "text", inputMode }: { id: string; label: string; name: string; initial: string; placeholder?: string; type?: string; inputMode?: "decimal" }) {
  const [value, setValue] = useField(name, initial)
  return <Field><FieldLabel htmlFor={id}>{label}</FieldLabel><Input id={id} type={type} inputMode={inputMode} placeholder={placeholder} value={value} onChange={(e) => setValue(e.target.value)} className="min-h-10 bg-card" /></Field>
}

function Disclosure({ label, children }: { label: string; children: ReactNode }) {
  return (
    <details className="group">
      <summary className="-mx-1 flex min-h-10 w-fit cursor-pointer list-none items-center gap-2 rounded-[var(--radius)] px-1 text-sm font-medium [&::-webkit-details-marker]:hidden">
        <ChevronDownIcon className="size-4 transition-transform group-open:rotate-180" aria-hidden="true" />{label}
      </summary>
      <div className="grid gap-4 pt-2 pb-1">{children}</div>
    </details>
  )
}

export function Segmented({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: Option[] }) {
  return (
    <div className="inline-flex rounded-[var(--radius)] bg-muted p-0.5" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" aria-pressed={value === o.value} onClick={() => onChange(o.value)}
          className={`min-h-9 min-w-11 rounded-[calc(var(--radius)-2px)] px-3 text-sm font-medium transition-colors ${value === o.value ? "bg-card text-foreground shadow-[0_0_0_1px_var(--control),0_1px_2px_rgb(0_0_0/.08)]" : "text-muted-foreground hover:text-foreground"}`}>{o.label}</button>
      ))}
    </div>
  )
}

export function Where() {
  const [city, setCity] = useField("city", "Paris, France")
  const [units, setUnits] = useField("units", "metric")
  const [provider, setProvider] = useField("provider", "OpenMeteo")
  const [zone, setZone] = useField("zone", "locationTimeZone")
  return (
    <div className="grid gap-4">
      <Field>
        <FieldLabel htmlFor="city">Place</FieldLabel>
        <Combobox items={cities} value={city} onValueChange={(v) => v && setCity(String(v))}>
          <ComboboxInput id="city" placeholder="Search for a city" className="min-h-10 w-full bg-card" />
          <ComboboxContent>
            <ComboboxEmpty>No place with that name. Try a nearby city.</ComboboxEmpty>
            <ComboboxList>{(item: string) => <ComboboxItem key={item} value={item}>{item}</ComboboxItem>}</ComboboxList>
          </ComboboxContent>
        </Combobox>
      </Field>
      <div className="grid gap-2">
        <span className="text-sm font-medium">Units</span>
        <div><Segmented label="Units" value={units} onChange={setUnits} options={[{ label: "°C", value: "metric" }, { label: "°F", value: "imperial" }, { label: "K", value: "standard" }]} /></div>
      </div>
      <Disclosure label="More options">
        <div className="grid grid-cols-2 items-end gap-3">
          <TextField id="lat" name="lat" label="Latitude" initial="48.8566" inputMode="decimal" />
          <TextField id="lon" name="lon" label="Longitude" initial="2.3522" inputMode="decimal" />
          <Button variant="outline" className="col-span-2 min-h-10 w-fit"><MapPinIcon data-icon="inline-start" />Pick on a map</Button>
        </div>
        <Choice id="source" label="Weather source" value={provider} onChange={setProvider} options={[{ label: "Open-Meteo (free)", value: "OpenMeteo" }, { label: "OpenWeatherMap (API key)", value: "OpenWeatherMap" }]} />
        <Choice id="zone" label="Times shown in" value={zone} onChange={setZone} options={[{ label: "The place's time zone", value: "locationTimeZone" }, { label: "This device's time zone", value: "localTimeZone" }]} />
      </Disclosure>
    </div>
  )
}

export function Title() {
  return <TextField id="title" name="title" label="Title on the screen" initial="" placeholder="Uses the place name" />
}

function Item({ icon, id, label, on, onChange, children }: { icon: ReactNode; id: string; label: string; on: boolean; onChange: (v: boolean) => void; children?: ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className="flex min-h-12 cursor-pointer items-center gap-3 px-3">
        <span className="text-muted-foreground [&_svg]:size-4" aria-hidden="true">{icon}</span>
        <span className="flex-1 text-sm">{label}</span>
        <Switch id={id} checked={on} onCheckedChange={onChange} />
      </label>
      {on && children ? <div className="flex items-center justify-between gap-3 px-3 pb-3 pl-10 text-sm text-muted-foreground">{children}</div> : null}
    </div>
  )
}

export function Contents() {
  const [metrics, setMetrics] = useField("metrics", true)
  const [graph, setGraph] = useField("graph", true)
  const [forecast, setForecast] = useField("forecast", true)
  const [rain, setRain] = useField("rain", false)
  const [moon, setMoon] = useField("moon", false)
  const [refresh, setRefresh] = useField("refresh", true)
  const [days, setDays] = useField("days", "5")
  const [step, setStep] = useField("step", "none")
  return (
    <div className="divide-y divide-border rounded-[var(--radius)] border border-border bg-card">
      <Item id="metrics" icon={<SunriseIcon />} label="Sun, wind and air" on={metrics} onChange={setMetrics} />
      <Item id="graph" icon={<ChartSplineIcon />} label="Hourly graph" on={graph} onChange={setGraph}>
        <span>Icons on the graph</span>
        <div className="w-36"><Choice id="step" label="Icons on the graph" hideLabel value={step} onChange={setStep} options={[{ label: "None", value: "none" }, ...["1", "2", "4", "6", "12"].map((v) => ({ label: `Every ${v} h`, value: v }))]} /></div>
      </Item>
      <Item id="forecast" icon={<CalendarDaysIcon />} label="Forecast" on={forecast} onChange={setForecast}>
        <span>Length</span>
        <div className="w-36"><Choice id="days" label="Length of the forecast" hideLabel value={days} onChange={setDays} options={["3", "5", "7"].map((v) => ({ label: `${v} days`, value: v }))} /></div>
      </Item>
      <Item id="rain" icon={<CloudRainIcon />} label="Rain amount" on={rain} onChange={setRain} />
      <Item id="moon" icon={<MoonIcon />} label="Moon phase" on={moon} onChange={setMoon} />
      <Item id="refresh" icon={<ClockIcon />} label="Last refresh time" on={refresh} onChange={setRefresh} />
    </div>
  )
}

function Inks({ label, name, initial }: { label: string; name: string; initial: string }) {
  const [value, setValue] = useField(name, initial)
  const custom = !inks.some(([, hex]) => hex === value)
  return (
    <fieldset>
      <legend className="mb-1 text-sm font-medium">{label}</legend>
      <div className="flex flex-wrap items-center gap-0.5">
        {inks.map(([ink, hex]) => (
          <label key={hex} className="cursor-pointer" title={ink}>
            <input type="radio" name={name} checked={value === hex} onChange={() => setValue(hex)} className="peer sr-only" aria-label={ink} />
            <span className="flex size-11 items-center justify-center rounded-full peer-focus-visible:outline-2 peer-focus-visible:outline-ring [input:checked+&>span]:shadow-[0_0_0_2px_var(--background),0_0_0_4px_var(--foreground)]">
              <span className="block size-7 rounded-full shadow-[inset_0_0_0_1px_var(--input)]" style={{ background: hex }} />
            </span>
          </label>
        ))}
        <label className="relative flex size-11 cursor-pointer items-center justify-center rounded-full has-focus-visible:outline-2 has-focus-visible:outline-ring" title="Other colour">
          <input type="color" value={value} onChange={(e) => setValue(e.target.value)} className="absolute size-px opacity-0" aria-label={`Other ${label.toLowerCase()}`} />
          <span className={`flex size-7 items-center justify-center rounded-full border border-dashed border-input text-muted-foreground ${custom ? "shadow-[0_0_0_2px_var(--background),0_0_0_4px_var(--foreground)]" : ""}`} style={custom ? { background: value } : undefined}>{custom ? null : <PlusIcon className="size-3.5" aria-hidden="true" />}</span>
        </label>
      </div>
    </fieldset>
  )
}

export function Styling() {
  const [frame, setFrame] = useField("frame", "None")
  return (
    <div className="grid gap-5">
      <fieldset>
        <legend className="mb-2 text-sm font-medium">Border</legend>
        <div className="grid grid-cols-4 gap-2">
          {["None", "Corner", "Top and bottom", "Rectangle"].map((kind) => (
            <label key={kind} className="cursor-pointer text-center text-sm leading-tight text-muted-foreground">
              <input type="radio" name="frame" checked={frame === kind} onChange={() => setFrame(kind)} className="peer sr-only" />
              <span className="mb-1.5 block overflow-hidden rounded-[var(--radius)] shadow-[0_0_0_1px_var(--control)] peer-checked:shadow-[0_0_0_2px_var(--foreground)] peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ring"><FrameArt kind={kind} /></span>{kind}
            </label>
          ))}
        </div>
      </fieldset>
      <Inks label="Background" name="background" initial="#ffffff" />
      <Inks label="Text colour" name="text" initial="#000000" />
      <Disclosure label="Margins and background image">
        <div className="max-w-40"><TextField id="margin" name="margin" label="Margin, in pixels" initial="5" type="number" /></div>
        <Button variant="outline" className="min-h-10 w-fit">Choose a background image</Button>
      </Disclosure>
    </div>
  )
}

export function AddToPlaylist({ trigger, onAdded }: { trigger: React.ReactElement; onAdded?: () => void }) {
  const [playlist, setPlaylist] = useState("All day")
  const [unit, setUnit] = useState("hour")
  return (
    <Dialog>
      <DialogTrigger render={trigger} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add to a playlist</DialogTitle>
          <DialogDescription>It takes its turn on the screen with the others.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <Field><FieldLabel htmlFor="instance">Name</FieldLabel><Input id="instance" defaultValue="Paris weather" className="min-h-10" /></Field>
          <Choice id="playlist" label="Playlist" value={playlist} onChange={setPlaylist} options={["All day", "Evening"].map((v) => ({ label: v, value: v }))} />
          <div className="grid grid-cols-2 items-end gap-3">
            <Field><FieldLabel htmlFor="every">Refresh its data every</FieldLabel><Input id="every" type="number" min={1} defaultValue="1" className="min-h-10" /></Field>
            <Choice id="unit" label="Unit" value={unit} onChange={setUnit} options={[{ label: "minutes", value: "minute" }, { label: "hours", value: "hour" }, { label: "days", value: "day" }]} />
          </div>
        </div>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" className="min-h-10" />}>Cancel</DialogClose>
          <DialogClose render={<Button className="min-h-10" onClick={onAdded} />}>Add to playlist</DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
