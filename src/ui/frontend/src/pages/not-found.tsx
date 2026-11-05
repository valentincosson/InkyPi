import { Link } from "wouter"
import { Button } from "@/components/ui/button"
import { Shell } from "@/components/shell"
import { useI18n } from "@/i18n"

export function NotFoundPage() {
  const { t } = useI18n()
  return (
    <Shell title={t("notFound.title")}>
      <div className="px-6 py-16 text-center">
        <h1 tabIndex={-1} className="text-[1.625rem] leading-tight font-semibold outline-none">{t("notFound.title")}</h1>
        <Button variant="outline" className="mt-4 min-h-10" render={<Link href="/" />}>{t("notFound.back")}</Button>
      </div>
    </Shell>
  )
}
