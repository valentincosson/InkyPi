import { useEffect, useRef, useState } from "react"
import { ConfirmDialog } from "@/components/confirm-dialog"
import { useI18n } from "@/i18n"

/** Demande confirmation avant de suivre un lien tant qu'une saisie n'est pas enregistrée. */
export function UnsavedGuard({ dirty }: { dirty: boolean }) {
  const { t } = useI18n()
  const [pending, setPending] = useState<HTMLAnchorElement | null>(null)
  const leaving = useRef(false)

  useEffect(() => {
    if (!dirty) return
    const onClick = (event: MouseEvent) => {
      if (leaving.current || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
      const link = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>("a[href]") : null
      if (!link || link.target === "_blank" || link.hasAttribute("download") || link.getAttribute("href")?.startsWith("#") || link.href === window.location.href) return
      event.preventDefault()
      event.stopPropagation()
      setPending(link)
    }
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!leaving.current) event.preventDefault()
    }
    document.addEventListener("click", onClick, true)
    window.addEventListener("beforeunload", onBeforeUnload)
    return () => {
      document.removeEventListener("click", onClick, true)
      window.removeEventListener("beforeunload", onBeforeUnload)
    }
  }, [dirty])

  return (
    <ConfirmDialog
      open={pending !== null}
      onClose={() => setPending(null)}
      onConfirm={() => {
        leaving.current = true
        setPending(null)
        pending?.click()
      }}
      title={t("unsaved.title")}
      body={t("unsaved.body")}
      confirm={t("unsaved.leave")}
      cancel={t("unsaved.stay")}
    />
  )
}
