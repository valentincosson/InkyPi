import { useCallback, useEffect, useState } from "react"
import { focusContent } from "@/components/route-focus"

/** Charge une donnée à l'ouverture de la page. `load` doit rester la même fonction d'un rendu à l'autre. */
export function useResource<T>(load: (signal: AbortSignal) => Promise<T>) {
  const [data, setData] = useState<T | null>(null)
  const [failed, setFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    load(controller.signal)
      .then((next) => {
        setData(next)
        setFailed(false)
      })
      .catch((error: Error) => {
        if (error.name !== "AbortError") setFailed(true)
      })
    return () => controller.abort()
  }, [load, attempt])

  const retry = () => {
    focusContent()
    setFailed(false)
    setAttempt((n) => n + 1)
  }

  /** Relit la donnée sans toucher au focus ni à ce qui est affiché : un échec se voit dans `failed`. */
  const reload = useCallback(async () => {
    try {
      setData(await load(new AbortController().signal))
      setFailed(false)
    } catch {
      setFailed(true)
    }
  }, [load])

  return { data, failed, retry, reload }
}
