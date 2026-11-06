import type { ComponentProps } from "react"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"

type Props = {
  open: boolean
  onClose: () => void
  onConfirm: () => void
  title: string
  body: string
  confirm: string
  cancel: string
  destructive?: boolean
  busy?: boolean
  error?: string
  finalFocus?: ComponentProps<typeof AlertDialogContent>["finalFocus"]
}

export function ConfirmDialog({ open, onClose, onConfirm, title, body, confirm, cancel, destructive, busy, error, finalFocus }: Props) {
  return (
    <AlertDialog open={open} onOpenChange={(next) => { if (!next && !busy) onClose() }}>
      <AlertDialogContent className="w-[calc(100vw-2rem)]" finalFocus={finalFocus}>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{body}</AlertDialogDescription>
        </AlertDialogHeader>
        {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
        <AlertDialogFooter>
          <AlertDialogCancel className="min-h-10">{cancel}</AlertDialogCancel>
          <AlertDialogAction className="min-h-10" variant={destructive ? "destructive" : "default"} aria-busy={busy} onClick={() => { if (!busy) onConfirm() }}>{confirm}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
