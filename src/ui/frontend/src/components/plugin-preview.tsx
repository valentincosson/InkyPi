import { LoaderCircleIcon, RefreshCwIcon } from "lucide-react"
import type { PluginData } from "@/api"
import { PluginArt } from "@/components/plugin-art"
import { Button } from "@/components/ui/button"
import { formatRefresh } from "@/format"
import { useI18n } from "@/i18n"
import type { Key } from "@/i18n/translate"

export type PreviewImage = {
  url: string
  /** Ce que le formulaire envoyait quand cette image a été produite. */
  signature: string
  source: "fresh" | "saved"
  date?: string
}

type Props = {
  pluginId: string
  name: string
  image: PreviewImage | null
  device: PluginData["device"]
  stale: boolean
  updating: boolean
  blocked: boolean
  error: string
  note?: Key
  onUpdate: () => void
  onImageFailed: () => void
}

/** Montre l'image que ces réglages donnent, sans jamais envoyer quoi que ce soit à l'écran. */
export function PluginPreview({ pluginId, name, image, device, stale, updating, blocked, error, note, onUpdate, onImageFailed }: Props) {
  const { t, language } = useI18n()
  const shape = { aspectRatio: `${device.width} / ${device.height}` }

  const state = () => {
    if (updating) return t("preview.updating")
    if (!image) return t("preview.none")
    if (stale) return t("preview.outOfDate")
    if (image.source === "fresh") return t("preview.upToDate")
    return t("preview.saved", { date: formatRefresh(image.date ?? "", { timezone: device.timezone, timeFormat: device.time_format, language }) })
  }

  return (
    <div id="plugin-preview" className="grid min-w-0 gap-2">
      <div className={`device relative ${device.height > device.width ? "mx-auto w-full max-w-[min(280px,100%)]" : ""}`}>
        {image
          ? <img src={image.url} alt={t("preview.alt", { name })} style={shape} className={stale ? "opacity-60" : ""} onError={onImageFailed} />
          : <div className="flex items-center justify-center overflow-hidden rounded-[4px] bg-[var(--art-bg)]" style={shape}><PluginArt id={pluginId} className="max-w-[60%]" /></div>}
        {updating ? <div className="device-progress" aria-hidden="true" /> : null}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <p role="status" className={`flex min-w-0 flex-1 basis-40 items-start gap-2 text-sm ${stale && !updating ? "text-foreground" : "text-muted-foreground"}`}>
          {updating ? <LoaderCircleIcon className="mt-0.5 size-4 shrink-0 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : null}
          {!updating && image && stale ? <span className="mt-1.5 size-2 shrink-0 rounded-full bg-[var(--warn)]" aria-hidden="true" /> : null}
          {state()}
        </p>
        <Button id="action-preview" variant="outline" className="min-h-10" aria-busy={updating} aria-disabled={updating || blocked} onClick={onUpdate}>
          <RefreshCwIcon data-icon="inline-start" aria-hidden="true" />{t("preview.update")}
        </Button>
      </div>
      {error ? <p role="alert" className="text-sm text-destructive [overflow-wrap:anywhere]">{error}</p> : null}
      {note ? <p className="text-sm text-muted-foreground">{t(note)}</p> : null}
    </div>
  )
}
