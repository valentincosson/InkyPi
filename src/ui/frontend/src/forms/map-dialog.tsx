import { useEffect, useRef, useState } from "react"
import { circleMarker, map as createMap, tileLayer, type CircleMarker, type Map as LeafletMap } from "leaflet"
import "leaflet/dist/leaflet.css"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { useI18n } from "@/i18n"

type Coordinates = { latitude: number; longitude: number }

function parse(latitude: string, longitude: string): Coordinates | null {
  const lat = Number(latitude)
  const long = Number(longitude)
  return latitude.trim() && longitude.trim() && Number.isFinite(lat) && Number.isFinite(long) && Math.abs(lat) <= 90 && Math.abs(long) <= 180 ? { latitude: lat, longitude: long } : null
}

function round(value: number) {
  return Math.round(value * 1e5) / 1e5
}

export function MapDialog({ latitude, longitude, onClose, onPick }: { latitude: string; longitude: string; onClose: () => void; onPick: (coordinates: Coordinates) => void }) {
  const { t } = useI18n()
  const [picked, setPicked] = useState<Coordinates | null>(() => parse(latitude, longitude))
  const [element, setElement] = useState<HTMLDivElement | null>(null)
  const initial = useRef(picked)

  // La boîte de dialogue monte son contenu après coup : la carte attend que son conteneur existe.
  useEffect(() => {
    if (!element) return
    const start = initial.current
    const map: LeafletMap = createMap(element).setView(start ? [start.latitude, start.longitude] : [20, 0], start ? 5 : 2)
    tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>', maxZoom: 19 }).addTo(map)
    const style = { radius: 8, color: "#ffffff", weight: 2, fillColor: "#3f5bd9", fillOpacity: 1 }
    let marker: CircleMarker | null = start ? circleMarker([start.latitude, start.longitude], style).addTo(map) : null
    map.on("click", ({ latlng }) => {
      const wrapped = latlng.wrap()
      if (marker) marker.setLatLng(wrapped)
      else marker = circleMarker(wrapped, style).addTo(map)
      setPicked({ latitude: round(wrapped.lat), longitude: round(wrapped.lng) })
    })
    const resize = window.setTimeout(() => map.invalidateSize(), 150)
    return () => {
      window.clearTimeout(resize)
      map.remove()
    }
  }, [element])

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent className="w-[calc(100vw-2rem)] sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("pf.weather.pickOnMap")}</DialogTitle>
          <DialogDescription>{t("pf.weather.mapHelp")}</DialogDescription>
        </DialogHeader>
        <div ref={setElement} role="group" aria-label={t("pf.weather.mapLabel")} className="isolate h-72 rounded-[var(--radius)] border border-border bg-muted" />
        <p role="status" className="text-sm text-muted-foreground tabular-nums">{picked ? `${picked.latitude}, ${picked.longitude}` : t("pf.weather.mapNothing")}</p>
        <DialogFooter>
          <Button type="button" variant="outline" className="min-h-10" onClick={onClose}>{t("action.cancel")}</Button>
          <Button type="button" className="min-h-10" aria-disabled={!picked} onClick={() => { if (picked) onPick(picked) }}>{t("pf.weather.usePlace")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
