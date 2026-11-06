import { useState, type FormEvent, type ReactNode } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { FieldError } from "@/components/ui/field"
import { useI18n } from "@/i18n"

type Props = {
  title: string
  description: string
  confirm: string
  opener: string
  firstField?: string
  /** Une seconde action, placée à l'écart de l'enregistrement. */
  aside?: ReactNode
  onClose: () => void
  onSubmit: () => Promise<string | null>
  children: ReactNode
}

/** Fenêtre d'envoi : l'erreur du serveur s'y affiche, et ce qui est saisi reste en place. */
export function ActionDialog({ title, description, confirm, opener, firstField, aside, onClose, onSubmit, children }: Props) {
  const { t } = useI18n()
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (busy) return
    setBusy(true)
    setError("")
    const failure = await onSubmit()
    if (failure) {
      setError(failure)
      setBusy(false)
    }
  }
  return (
    <Dialog open onOpenChange={(open) => { if (!open && !busy) onClose() }}>
      <DialogContent className="w-[calc(100vw-2rem)]" initialFocus={firstField ? () => document.getElementById(firstField) : undefined} finalFocus={() => document.getElementById(opener)}>
        <form onSubmit={submit} noValidate className="grid gap-4">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </DialogHeader>
          {children}
          {error ? <FieldError>{error}</FieldError> : null}
          <DialogFooter>
            {aside ? <div className="sm:mr-auto">{aside}</div> : null}
            <Button type="button" variant="outline" className="min-h-10" disabled={busy} onClick={onClose}>{t("action.cancel")}</Button>
            <Button type="submit" className="min-h-10" aria-busy={busy}>{confirm}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
