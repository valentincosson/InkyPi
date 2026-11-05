import { Link } from "wouter"
import { getPlugins } from "@/api"
import { LoadFailed, Loading, PageTitle } from "@/components/page-state"
import { Shell } from "@/components/shell"
import { hasForm, pluginLabel } from "@/forms/registry"
import { useI18n } from "@/i18n"
import { useResource } from "@/use-resource"

const card = "flex min-h-16 items-center gap-3 rounded-[var(--radius)] border border-border bg-card p-3 font-medium transition-colors hover:bg-accent"

export function PluginsPage() {
  const { t } = useI18n()
  const { data, failed, retry } = useResource(getPlugins)
  return (
    <Shell title={t("nav.plugins")} current="nav.plugins">
      <PageTitle>{t("nav.plugins")}</PageTitle>
      {data ? (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {data.plugins.map(({ id, name }) => {
            const content = <><img src={`/images/${id}/icon.png`} alt="" className="size-8 shrink-0 object-contain dark:invert" /><span className="min-w-0 [overflow-wrap:anywhere]">{pluginLabel(t, id, name)}</span></>
            return <li key={id}>{hasForm(id) ? <Link href={`/plugin/${id}`} className={card}>{content}</Link> : <a href={`/plugin/${id}`} className={card}>{content}</a>}</li>
          })}
        </ul>
      ) : failed ? <LoadFailed title={t("plugins.loadFailed")} onRetry={retry} /> : <Loading />}
    </Shell>
  )
}
