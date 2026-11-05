import { useState, type FormEvent, type ReactNode } from "react"
import { getSettings, requestPower, saveSettings, type DeviceSettings } from "@/api"
import { ConfirmDialog } from "@/components/confirm-dialog"
import { LoadFailed, Loading, PageTitle } from "@/components/page-state"
import { Shell } from "@/components/shell"
import { UnsavedGuard } from "@/components/unsaved-guard"
import { Button, buttonVariants } from "@/components/ui/button"
import { Combobox, ComboboxContent, ComboboxEmpty, ComboboxInput, ComboboxItem, ComboboxList } from "@/components/ui/combobox"
import { Field, FieldContent, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Slider } from "@/components/ui/slider"
import { Switch } from "@/components/ui/switch"
import { useI18n } from "@/i18n"
import type { Key, Language } from "@/i18n/translate"
import { saveErrorMessage } from "@/save-error"
import { IMAGE_DEFAULTS, INKY_SATURATION_DEFAULT, normalize, suggestedTimezone, toFormData, toValues, validate, type FieldName, type SettingsValues, type Unit } from "@/settings-form"
import { useResource } from "@/use-resource"

const LANGUAGES: { value: Language; label: string }[] = [
  { value: "en", label: "English" },
  { value: "fr", label: "Français" },
]

function Section({ id, title, description, children }: { id: string; title: string; description?: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="grid gap-x-6 gap-y-4 border-t border-border py-7 lg:grid-cols-4">
      <div>
        <h2 id={id} className="text-lg leading-snug font-semibold">{title}</h2>
        {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
      </div>
      <div className="grid max-w-[640px] content-start gap-5 lg:col-span-3">{children}</div>
    </section>
  )
}

function Choice<T extends string>({ id, label, value, options, onChange }: { id: string; label?: string; value: T; options: { value: T; label: string }[]; onChange: (value: T) => void }) {
  return (
    <Select items={options} value={value} onValueChange={(next) => onChange(next as T)}>
      <SelectTrigger id={id} aria-label={label} className="min-h-10 w-full bg-card"><SelectValue /></SelectTrigger>
      <SelectContent>
        {options.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
      </SelectContent>
    </Select>
  )
}

function Toggle({ id, label, description, checked, onChange }: { id: string; label: string; description: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <Field orientation="horizontal" className="items-start justify-between gap-6">
      <FieldContent>
        <FieldLabel htmlFor={id}>{label}</FieldLabel>
        <FieldDescription>{description}</FieldDescription>
      </FieldContent>
      <Switch id={id} className="mt-0.5" checked={checked} onCheckedChange={onChange} />
    </Field>
  )
}

function Tuning({ id, label, value, max = 2, step = 0.1, onChange }: { id: string; label: string; value: number; max?: number; step?: number; onChange: (value: number) => void }) {
  return (
    <div>
      <div className="mb-3 flex items-baseline justify-between gap-3 text-sm">
        <span id={id} className="font-medium">{label}</span>
        <span className="text-muted-foreground tabular-nums">{value.toFixed(step < 0.1 ? 2 : 1)}</span>
      </div>
      <Slider aria-labelledby={id} min={0} max={max} step={step} value={[value]} onValueChange={(next) => onChange(Array.isArray(next) ? next[0] : next)} />
    </div>
  )
}

function Orientation({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const { t } = useI18n()
  const options = [
    { value: "horizontal", label: t("settings.horizontal"), frame: "h-6 w-10" },
    { value: "vertical", label: t("settings.vertical"), frame: "h-10 w-6" },
  ]
  return (
    <div className="grid gap-2">
      <span id="orientation-label" className="text-sm leading-snug font-medium">{t("settings.orientation")}</span>
      <RadioGroup aria-labelledby="orientation-label" value={value} onValueChange={(next) => onChange(next as string)} className="grid grid-cols-2 gap-3">
        {options.map((option) => (
          <label key={option.value} className="flex min-h-16 cursor-pointer items-center gap-3 rounded-[var(--radius)] border border-[var(--control)] bg-card px-3 has-data-checked:border-primary has-data-checked:shadow-[0_0_0_1px_var(--primary)]">
            <RadioGroupItem value={option.value} />
            <span className="flex-1 text-sm font-medium">{option.label}</span>
            <span aria-hidden="true" className={`${option.frame} shrink-0 rounded-[3px] border-2 border-[var(--art-ink)] bg-[var(--art-bg)]`} />
          </label>
        ))}
      </RadioGroup>
    </div>
  )
}

type Status = { kind: "saved" | "invalid" | "noChanges" } | { kind: "error"; message: string } | null

function SettingsForm({ settings }: { settings: DeviceSettings }) {
  const { t } = useI18n()
  const [saved, setSaved] = useState(() => toValues(settings))
  // Sans fuseau enregistré, on propose celui du navigateur : il reste à enregistrer.
  const [values, setValues] = useState(() => ({ ...saved, timezone: saved.timezone || suggestedTimezone(settings.timezones) }))
  const [attempted, setAttempted] = useState(false)
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState<Status>(null)

  const dirty = JSON.stringify(values) !== JSON.stringify(saved)
  const errors = attempted ? validate(values, settings.timezones) : {}
  const set = <K extends keyof SettingsValues>(key: K, value: SettingsValues[K]) => {
    setValues((current) => ({ ...current, [key]: value }))
    setStatus(null)
  }
  const invalid = (field: FieldName) => (errors[field] ? { "aria-invalid": true, "aria-describedby": `${field}-error` } : {})
  const fieldError = (field: FieldName) => (errors[field] ? <FieldError id={`${field}-error`}>{t(errors[field])}</FieldError> : null)

  const imageIsDefault = (Object.keys(IMAGE_DEFAULTS) as (keyof typeof IMAGE_DEFAULTS)[]).every((key) => values[key] === IMAGE_DEFAULTS[key]) && (values.inkySaturation === null || !settings.inky_display || values.inkySaturation === INKY_SATURATION_DEFAULT)
  const resetImage = () => {
    setValues((current) => ({ ...current, ...IMAGE_DEFAULTS, inkySaturation: settings.inky_display ? INKY_SATURATION_DEFAULT : current.inkySaturation }))
    setStatus(null)
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (saving) return
    const [firstInvalid] = Object.keys(validate(values, settings.timezones))
    if (firstInvalid) {
      setAttempted(true)
      setStatus({ kind: "invalid" })
      document.getElementById(firstInvalid)?.focus()
      return
    }
    if (!dirty) {
      setStatus({ kind: "noChanges" })
      return
    }
    const clean = normalize(values)
    setSaving(true)
    setStatus(null)
    try {
      await saveSettings(toFormData(clean))
      // Une saisie faite pendant l'envoi reste à l'écran, et à enregistrer.
      setValues((current) => (JSON.stringify(current) === JSON.stringify(values) ? clean : current))
      setSaved(clean)
      setAttempted(false)
      setStatus({ kind: "saved" })
    } catch (error) {
      setStatus({ kind: "error", message: saveErrorMessage(error, t) })
    } finally {
      setSaving(false)
    }
  }

  const unit = (singular: Key, plural: Key) => t(values.interval.trim() === "1" ? singular : plural)

  return (
    <form onSubmit={submit} noValidate>
      <UnsavedGuard dirty={dirty} />
      <Section id="section-device" title={t("settings.device")}>
        <Field>
          <FieldLabel htmlFor="name">{t("settings.name")}</FieldLabel>
          <Input id="name" className="min-h-10 bg-card" autoComplete="off" value={values.name} onChange={(event) => set("name", event.target.value)} {...invalid("name")} />
          {fieldError("name")}
        </Field>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="timezone">{t("settings.timezone")}</FieldLabel>
            <Combobox items={settings.timezones} value={values.timezone || null} onValueChange={(next) => set("timezone", (next as string | null) ?? "")} autoHighlight>
              <ComboboxInput id="timezone" className="min-h-10 w-full bg-card" placeholder={t("settings.timezonePlaceholder")} triggerLabel={t("settings.showTimezones")} {...invalid("timezone")} />
              <ComboboxContent>
                <ComboboxEmpty>{t("settings.noTimezone")}</ComboboxEmpty>
                <ComboboxList>{(zone: string) => <ComboboxItem key={zone} value={zone}>{zone}</ComboboxItem>}</ComboboxList>
              </ComboboxContent>
            </Combobox>
            {fieldError("timezone")}
          </Field>
          <Field>
            <FieldLabel htmlFor="time-format">{t("settings.timeFormat")}</FieldLabel>
            <Choice id="time-format" value={values.timeFormat} onChange={(next) => set("timeFormat", next)} options={[{ value: "12h", label: t("settings.12h") }, { value: "24h", label: t("settings.24h") }]} />
          </Field>
        </div>
        <Toggle id="log-stats" label={t("settings.logStats")} description={t("settings.logStatsBody")} checked={values.logStats} onChange={(next) => set("logStats", next)} />
      </Section>

      <Section id="section-display" title={t("settings.display")}>
        <Orientation value={values.orientation} onChange={(next) => set("orientation", next)} />
        <Toggle id="rotated" label={t("settings.rotated")} description={t("settings.rotatedBody")} checked={values.rotated} onChange={(next) => set("rotated", next)} />
        <Field>
          <FieldLabel htmlFor="interval">{t("settings.interval")}</FieldLabel>
          <div className="grid grid-cols-[6rem_minmax(0,11rem)] gap-2">
            <Input id="interval" className="min-h-10 bg-card tabular-nums" inputMode="numeric" autoComplete="off" value={values.interval} onChange={(event) => set("interval", event.target.value)} {...invalid("interval")} />
            <Choice<Unit> id="interval-unit" label={t("settings.unit")} value={values.unit} onChange={(next) => set("unit", next)} options={[{ value: "minute", label: unit("settings.minute", "settings.minutes") }, { value: "hour", label: unit("settings.hour", "settings.hours") }]} />
          </div>
          {fieldError("interval")}
        </Field>
      </Section>

      <Section id="section-image" title={t("settings.image")} description={t("settings.imageBody")}>
        <div className="grid gap-x-8 gap-y-6 sm:grid-cols-2">
          <Tuning id="saturation" label={t("settings.saturation")} value={values.saturation} onChange={(next) => set("saturation", next)} />
          <Tuning id="contrast" label={t("settings.contrast")} value={values.contrast} onChange={(next) => set("contrast", next)} />
          <Tuning id="sharpness" label={t("settings.sharpness")} value={values.sharpness} onChange={(next) => set("sharpness", next)} />
          <Tuning id="brightness" label={t("settings.brightness")} value={values.brightness} onChange={(next) => set("brightness", next)} />
          {settings.inky_display && values.inkySaturation !== null ? <Tuning id="inky-saturation" label={t("settings.inkySaturation")} value={values.inkySaturation} max={1} step={0.05} onChange={(next) => set("inkySaturation", next)} /> : null}
        </div>
        {imageIsDefault ? null : <Button type="button" variant="outline" className="min-h-10 w-fit" onClick={resetImage}>{t("settings.reset")}</Button>}
      </Section>

      <div className={`-mx-5 bg-background px-5 ${dirty || status || saving ? "sticky bottom-0 z-10" : ""}`}>
        <div className="flex flex-wrap items-center justify-end gap-x-4 gap-y-2 border-t border-border py-3">
          <p role={status?.kind === "error" ? "alert" : "status"} className={`min-w-0 flex-1 basis-60 text-sm ${status?.kind === "error" ? "text-destructive" : "text-muted-foreground"}`}>
            {saving ? t("settings.saving")
              : status?.kind === "error" ? status.message
              : status?.kind === "saved" && !dirty ? t("settings.saved")
              : status?.kind === "invalid" ? t("settings.invalid")
              : status?.kind === "noChanges" ? t("settings.noChanges")
              : dirty ? t("settings.unsaved") : ""}
          </p>
          <Button type="submit" className="min-h-10" aria-busy={saving}>{t("settings.save")}</Button>
        </div>
      </div>
    </form>
  )
}

function Language() {
  const { t, language, setLanguage } = useI18n()
  return (
    <Section id="section-language" title={t("settings.language")} description={t("settings.languageBody")}>
      <div className="max-w-[calc(50%-0.625rem)] max-sm:max-w-none">
        <Choice id="language" label={t("settings.language")} value={language} onChange={setLanguage} options={LANGUAGES} />
      </div>
    </Section>
  )
}

function Maintenance() {
  const { t } = useI18n()
  // Le choix reste renseigné après la fermeture : la boîte de dialogue s'efface en douceur.
  const [action, setAction] = useState<"restart" | "shutdown">("restart")
  const [asking, setAsking] = useState(false)
  const [requested, setRequested] = useState<"restart" | "shutdown" | null>(null)
  return (
    <Section id="section-maintenance" title={t("settings.maintenance")}>
      <div className="flex flex-wrap gap-2">
        <a data-slot="button" data-variant="outline" className={`${buttonVariants({ variant: "outline" })} min-h-10`} href="/download-logs?hours=24" download>{t("settings.logs")}</a>
        <Button variant="outline" className="min-h-10" onClick={() => { setAction("restart"); setAsking(true) }}>{t("settings.restart")}</Button>
        <Button variant="destructive" className="min-h-10" onClick={() => { setAction("shutdown"); setAsking(true) }}>{t("settings.shutdown")}</Button>
      </div>
      <p role="status" className="text-sm text-muted-foreground empty:hidden">{requested === "restart" ? t("settings.restarting") : requested === "shutdown" ? t("settings.shuttingDown") : ""}</p>
      <ConfirmDialog
        open={asking}
        onClose={() => setAsking(false)}
        onConfirm={() => {
          requestPower(action)
          setRequested(action)
          setAsking(false)
        }}
        title={t(action === "shutdown" ? "settings.shutdownTitle" : "settings.restartTitle")}
        body={t(action === "shutdown" ? "settings.shutdownBody" : "settings.restartBody")}
        confirm={t(action === "shutdown" ? "settings.shutdown" : "settings.restart")}
        cancel={t("action.cancel")}
        destructive={action === "shutdown"}
      />
    </Section>
  )
}

export function SettingsPage() {
  const { t } = useI18n()
  const { data, failed, retry } = useResource(getSettings)
  return (
    <Shell title={t("nav.settings")} current="nav.settings">
      <PageTitle>{t("nav.settings")}</PageTitle>
      {data ? <SettingsForm settings={data} /> : failed ? <LoadFailed title={t("settings.loadFailed")} onRetry={retry} /> : <Loading />}
      <Language />
      {data ? <Maintenance /> : null}
    </Shell>
  )
}
