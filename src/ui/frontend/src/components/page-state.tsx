import { Button } from "@/components/ui/button"
import { useI18n } from "@/i18n"

export function LoadFailed({ title, onRetry }: { title: string; onRetry: () => void }) {
  const { t } = useI18n()
  return (
    <div className="rounded-[var(--radius)] border border-dashed border-input px-6 py-16 text-center" role="alert">
      <p className="text-lg font-semibold">{title}</p>
      <p className="mt-1 text-muted-foreground">{t("error.body")}</p>
      <Button variant="outline" className="mt-4 min-h-10" onClick={onRetry}>{t("error.retry")}</Button>
    </div>
  )
}

export function Loading() {
  const { t } = useI18n()
  return (
    <div role="status" className="grid max-w-[720px] gap-3">
      <span className="sr-only">{t("page.loading")}</span>
      <div className="h-10 rounded-[var(--radius)] bg-accent" />
      <div className="h-10 rounded-[var(--radius)] bg-accent" />
      <div className="h-10 w-2/3 rounded-[var(--radius)] bg-accent" />
    </div>
  )
}

export function PageTitle({ children }: { children: string }) {
  return <h1 className="mb-6 text-[1.625rem] leading-tight font-semibold">{children}</h1>
}
