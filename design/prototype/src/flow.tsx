import { useEffect, useRef, useState } from "react"
import { CheckIcon, LoaderCircleIcon } from "lucide-react"
import { queue } from "@/data"

export type Phase = "idle" | "sending" | "drawing" | "done"
const label: Record<Phase, string> = { idle: "", sending: "Sending to the screen", drawing: "Drawing. This can take a little while.", done: "On the screen" }
const times = ["00:48", "01:48", "02:48", "03:48"]

export function SkipLink() {
  return <a href="#" onClick={(e) => { e.preventDefault(); const main = document.getElementById("main"); main?.setAttribute("tabindex", "-1"); main?.focus() }} className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:bg-white focus:p-2 focus:text-black">Skip to content</a>
}

/** Reproduit le cycle réel : envoi, dessin lent par l'écran, puis confirmation. */
export function useScreen() {
  const [index, setIndex] = useState(0)
  const [phase, setPhase] = useState<Phase>("idle")
  const [lastRefresh, setLastRefresh] = useState("23:48")
  const timers = useRef<number[]>([])
  useEffect(() => () => timers.current.forEach(window.clearTimeout), [])
  const run = (after?: () => void) => {
    if (phase === "sending" || phase === "drawing") return
    timers.current.forEach(window.clearTimeout)
    setPhase("sending")
    timers.current = [
      window.setTimeout(() => setPhase("drawing"), 800),
      window.setTimeout(() => { after?.(); setLastRefresh("23:49"); setPhase("done") }, 2800),
    ]
  }
  return {
    now: queue[index],
    upcoming: times.map((at, i) => ({ ...queue[(index + i + 1) % queue.length], at })),
    phase, busy: phase === "sending" || phase === "drawing", lastRefresh,
    refresh: () => run(),
    next: () => run(() => setIndex((i) => (i + 1) % queue.length)),
    send: () => run(),
  }
}

export function Status({ phase, text, className = "" }: { phase: Phase; text?: string; className?: string }) {
  return (
    <p role="status" className={`flex items-center gap-2 empty:hidden ${className}`}>
      {phase === "sending" || phase === "drawing" ? <LoaderCircleIcon className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : null}
      {phase === "done" ? <CheckIcon className="size-4" aria-hidden="true" /> : null}
      {text ?? label[phase]}
    </p>
  )
}

export function usePluginSearch<T extends { name: string; hint: string; group: string }>(items: T[]) {
  const [query, setQuery] = useState("")
  const [group, setGroup] = useState("All")
  const q = query.trim().toLowerCase()
  return { query, setQuery, group, setGroup, results: items.filter((p) => (group === "All" || p.group === group) && (!q || `${p.name} ${p.hint}`.toLowerCase().includes(q))) }
}
