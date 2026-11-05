import { useState } from "react"
import { PluginArt } from "@/components/plugin-art"

/** L'image d'une entrée, ou son illustration tant qu'elle n'a encore jamais tourné. */
export function InstanceImage({ url, pluginId }: { url: string | null; pluginId: string }) {
  const [failed, setFailed] = useState<string | null>(null)
  if (!url || failed === url) return <PluginArt id={pluginId} />
  return <img src={url} alt="" loading="lazy" onError={() => setFailed(url)} className="block aspect-[5/3] w-full bg-white object-contain" />
}
