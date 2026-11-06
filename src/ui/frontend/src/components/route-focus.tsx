import { useEffect, useRef } from "react"
import { useLocation } from "wouter"

/** La zone principale reste en place quand le contenu se charge, contrairement au titre. */
export function focusContent() {
  document.getElementById("main")?.focus({ preventScroll: true })
}

/** Après un changement de page, place le focus sur son contenu. */
export function RouteFocus() {
  const [location] = useLocation()
  const previous = useRef(location)
  useEffect(() => {
    if (previous.current === location) return
    previous.current = location
    focusContent()
  }, [location])
  return null
}
