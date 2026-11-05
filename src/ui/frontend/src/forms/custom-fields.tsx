import { lazy, Suspense, useEffect, useMemo, useState } from "react"
import { MapPinIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Combobox, ComboboxContent, ComboboxEmpty, ComboboxInput, ComboboxItem, ComboboxList } from "@/components/ui/combobox"
import { Field as FieldBox, FieldDescription, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { useI18n } from "@/i18n"
import { fieldId } from "./engine"
import { ErrorText, invalidProps, useForm } from "./fields"
import { searchPlaces, type Place } from "./geocoding"
import type { CustomField } from "./types"

const MapDialog = lazy(() => import("./map-dialog").then(({ MapDialog }) => ({ default: MapDialog })))

const SEARCH_DELAY_MS = 350

export function LocationField({ field }: { field: CustomField }) {
  const { t, language } = useI18n()
  const { values, errors, setMany, set } = useForm()
  const id = fieldId(field.name)
  const error = errors[id]
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<Place[]>([])
  const [failed, setFailed] = useState(false)
  const [mapOpen, setMapOpen] = useState(false)
  const latitude = String(values.latitude ?? "")
  const longitude = String(values.longitude ?? "")

  useEffect(() => {
    const name = query.trim()
    if (name.length < 2) return
    const controller = new AbortController()
    const timer = window.setTimeout(() => {
      searchPlaces(name, language, controller.signal)
        .then((places) => {
          setResults(places)
          setFailed(false)
        })
        .catch((reason: Error) => {
          if (reason.name !== "AbortError") setFailed(true)
        })
    }, SEARCH_DELAY_MS)
    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [query, language])

  return (
    <div className="grid gap-3">
      <FieldBox>
        <FieldLabel htmlFor={id}>{t(field.label)}</FieldLabel>
        <Combobox<Place>
          items={results}
          filter={null}
          itemToStringLabel={(place) => place.label}
          inputValue={query}
          onInputValueChange={setQuery}
          onValueChange={(place) => {
            if (place) setMany({ latitude: String(place.latitude), longitude: String(place.longitude) })
          }}
        >
          <ComboboxInput id={id} className="min-h-10 w-full bg-card" placeholder={t("pf.weather.searchPlaceholder")} triggerLabel={t("pf.weather.showPlaces")} {...invalidProps(error, id)} />
          <ComboboxContent>
            <ComboboxEmpty>{query.trim().length < 2 ? t("pf.weather.typeToSearch") : t("pf.weather.noPlace")}</ComboboxEmpty>
            <ComboboxList>{(place: Place) => <ComboboxItem key={place.id} value={place}>{place.label}</ComboboxItem>}</ComboboxList>
          </ComboboxContent>
        </Combobox>
        {failed ? <FieldDescription role="status">{t("pf.weather.searchFailed")}</FieldDescription> : null}
        <FieldDescription>
          {t("pf.weather.searchCredit")} <a href="https://open-meteo.com/" target="_blank" rel="noreferrer">Open-Meteo</a>, <a href="https://www.geonames.org/" target="_blank" rel="noreferrer">GeoNames</a>
        </FieldDescription>
        <ErrorText id={id} error={error} />
      </FieldBox>
      <div className="grid grid-cols-2 gap-3">
        <FieldBox>
          <FieldLabel htmlFor="field-latitude">{t("pf.weather.latitude")}</FieldLabel>
          <Input id="field-latitude" className="min-h-10 bg-card tabular-nums" inputMode="decimal" autoComplete="off" value={latitude} onChange={(event) => set("latitude", event.target.value)} />
        </FieldBox>
        <FieldBox>
          <FieldLabel htmlFor="field-longitude">{t("pf.weather.longitude")}</FieldLabel>
          <Input id="field-longitude" className="min-h-10 bg-card tabular-nums" inputMode="decimal" autoComplete="off" value={longitude} onChange={(event) => set("longitude", event.target.value)} />
        </FieldBox>
      </div>
      <Button type="button" variant="outline" className="min-h-10 w-fit" onClick={() => setMapOpen(true)}><MapPinIcon data-icon="inline-start" aria-hidden="true" />{t("pf.weather.pickOnMap")}</Button>
      {mapOpen ? (
        <Suspense fallback={null}>
          <MapDialog
            latitude={latitude}
            longitude={longitude}
            onClose={() => setMapOpen(false)}
            onPick={(next) => {
              setMany({ latitude: String(next.latitude), longitude: String(next.longitude) })
              setMapOpen(false)
            }}
          />
        </Suspense>
      ) : null}
    </div>
  )
}

type Newspaper = { name: string; slug: string; city: string; country: string }

export function NewspaperField({ field }: { field: CustomField }) {
  const { t } = useI18n()
  const { values, errors, params, setMany } = useForm()
  const id = fieldId(field.name)
  const error = errors[id]
  const newspapers = useMemo(() => (params.newspapers ?? []) as Newspaper[], [params.newspapers])
  const slug = String(values.newspaperSlug ?? "")
  const selected = useMemo(() => {
    const known = newspapers.find((newspaper) => newspaper.slug === slug)
    if (known) return known
    return slug ? { name: String(values.newspaperName ?? slug), slug, city: "", country: "" } : null
  }, [newspapers, slug, values.newspaperName])
  const place = (newspaper: Newspaper) => [newspaper.city, newspaper.country].filter(Boolean).join(", ")

  return (
    <FieldBox>
      <FieldLabel htmlFor={id}>{t(field.label)}</FieldLabel>
      <Combobox<Newspaper>
        items={newspapers}
        value={selected}
        autoHighlight
        itemToStringLabel={(newspaper) => newspaper.name}
        isItemEqualToValue={(item, value) => item.slug === value.slug}
        filter={(newspaper, query) => `${newspaper.name} ${place(newspaper)}`.toLowerCase().includes(query.trim().toLowerCase())}
        onValueChange={(newspaper) => setMany({ newspaperName: newspaper?.name ?? "", newspaperSlug: newspaper?.slug ?? "", locationSearch: newspaper ? place(newspaper) : "" })}
      >
        <ComboboxInput id={id} className="min-h-10 w-full bg-card" placeholder={t("pf.newspaper.placeholder")} triggerLabel={t("pf.newspaper.show")} {...invalidProps(error, id)} />
        <ComboboxContent>
          <ComboboxEmpty>{t("pf.newspaper.none")}</ComboboxEmpty>
          <ComboboxList>
            {(newspaper: Newspaper) => (
              <ComboboxItem key={newspaper.slug} value={newspaper}>
                <span className="min-w-0">{newspaper.name} <span className="text-muted-foreground">{place(newspaper)}</span></span>
              </ComboboxItem>
            )}
          </ComboboxList>
        </ComboboxContent>
      </Combobox>
      <ErrorText id={id} error={error} />
    </FieldBox>
  )
}
