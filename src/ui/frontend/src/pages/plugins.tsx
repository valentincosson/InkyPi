import { useEffect, useMemo, useRef, useState } from "react"
import { KeyRoundIcon, SearchIcon } from "lucide-react"
import { Link } from "wouter"
import { getPlugins, savePluginOrder, type PluginSummary } from "@/api"
import { LoadFailed, Loading, PageTitle } from "@/components/page-state"
import { PluginArt } from "@/components/plugin-art"
import { ReorderList } from "@/components/reorder-list"
import { Segmented } from "@/components/segmented"
import { Shell } from "@/components/shell"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { hasForm, PLUGIN_META, pluginHint, pluginLabel } from "@/forms/registry"
import { useI18n } from "@/i18n"
import type { Key } from "@/i18n/translate"
import { saveErrorMessage } from "@/save-error"
import { useResource } from "@/use-resource"

type GroupFilter = "all" | "pictures" | "information" | "other"
const GROUPS: { id: Exclude<GroupFilter, "all">; label: Key }[] = [
  { id: "pictures", label: "plugins.pictures" },
  { id: "information", label: "plugins.information" },
  { id: "other", label: "plugins.other" },
]

function groupOf(id: string): Exclude<GroupFilter, "all"> {
  return Object.hasOwn(PLUGIN_META, id) ? PLUGIN_META[id].group : "other"
}

function Thumbnail({ id }: { id: string }) {
  return hasForm(id)
    ? <PluginArt id={id} />
    : <span className="flex aspect-[5/3] items-center justify-center bg-[var(--art-bg)]"><img src={`/images/${id}/icon.png`} alt="" className="size-14 object-contain dark:invert" /></span>
}

function PluginCard({ plugin }: { plugin: PluginSummary }) {
  const { t } = useI18n()
  const hint = pluginHint(t, plugin.id)
  const content = (
    <>
      <span className="block overflow-hidden rounded-[var(--radius)] shadow-[0_0_0_1px_var(--border)] transition-shadow group-hover:shadow-[0_0_0_1px_var(--input)]">
        <Thumbnail id={plugin.id} />
      </span>
      <span className="mt-2 block text-sm font-medium [overflow-wrap:anywhere]">{pluginLabel(t, plugin.id, plugin.name)}</span>
      {hasForm(plugin.id) && PLUGIN_META[plugin.id].needsKey ? (
        <span className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
          <KeyRoundIcon className="size-3" aria-hidden="true" />{t("plugins.apiKey")}
        </span>
      ) : null}
    </>
  )
  // Un plugin sans description garde son ancienne page, chargée en dehors de l'application.
  return hasForm(plugin.id)
    ? <Link href={`/plugin/${plugin.id}`} title={hint} className="group block">{content}</Link>
    : <a href={`/plugin/${plugin.id}`} className="group block">{content}</a>
}

function Reordering({ plugins, onDone, onCancel }: { plugins: PluginSummary[]; onDone: (plugins: PluginSummary[]) => void; onCancel: () => void }) {
  const { t } = useI18n()
  const [items, setItems] = useState(() => plugins.map((plugin) => ({ ...plugin, label: pluginLabel(t, plugin.id, plugin.name) })))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const help = useRef<HTMLParagraphElement>(null)

  useEffect(() => {
    help.current?.focus()
  }, [])

  const inGroup = (id: string) => items.filter((item) => groupOf(item.id) === id)
  // L'ordre ne vaut qu'à l'intérieur d'un type : l'enregistrement met les types à la suite.
  const replaceGroup = (group: string, next: typeof items) => setItems(GROUPS.flatMap(({ id }) => (id === group ? next : inGroup(id))))
  const save = async () => {
    if (saving) return
    setSaving(true)
    setError("")
    try {
      const ordered = GROUPS.flatMap(({ id }) => inGroup(id))
      await savePluginOrder(ordered.map(({ id }) => id))
      onDone(ordered.map(({ id, name }) => ({ id, name })))
    } catch (reason) {
      setError(saveErrorMessage(reason, t))
      setSaving(false)
    }
  }
  return (
    <div className="grid max-w-[640px] gap-4">
      <p ref={help} tabIndex={-1} className="-mt-4 text-muted-foreground">{t("plugins.reorderHelp")}</p>
      {GROUPS.filter(({ id }) => inGroup(id).length).map(({ id, label }) => (
        <section key={id} className="grid gap-2" aria-labelledby={`order-${id}`}>
          <h2 id={`order-${id}`} className="text-lg font-semibold">{t(label)}</h2>
          <ReorderList
            items={inGroup(id)}
            onChange={(next) => replaceGroup(id, next)}
            render={(item) => (
              <span className="flex items-center gap-3">
                <span className="block w-14 shrink-0 overflow-hidden rounded-[calc(var(--radius)-2px)] shadow-[0_0_0_1px_var(--border)]"><Thumbnail id={item.id} /></span>
                <span className="min-w-0 text-sm font-medium [overflow-wrap:anywhere]">{item.label}</span>
              </span>
            )}
          />
        </section>
      ))}
      <div className="sticky bottom-0 z-10 -mx-5 grid gap-2 border-t border-border bg-background px-5 py-3 sm:mx-0 sm:px-0">
        {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="outline" className="min-h-10" disabled={saving} onClick={onCancel}>{t("action.cancel")}</Button>
          <Button className="min-h-10" aria-busy={saving} onClick={() => void save()}>{t("plugins.saveOrder")}</Button>
        </div>
      </div>
    </div>
  )
}

function Catalogue({ initial }: { initial: PluginSummary[] }) {
  const { t } = useI18n()
  const [plugins, setPlugins] = useState(initial)
  const [reordering, setReordering] = useState(false)
  const [saved, setSaved] = useState(false)
  const [query, setQuery] = useState("")
  const [group, setGroup] = useState<GroupFilter>("all")
  const returnFocus = useRef(false)

  // Au retour de la réorganisation, ce bouton remet aussi la confirmation à l'écran.
  useEffect(() => {
    if (!reordering && returnFocus.current) {
      returnFocus.current = false
      document.getElementById("reorder-button")?.focus()
    }
  }, [reordering])

  const results = useMemo(() => {
    const search = query.trim().toLowerCase()
    return plugins.filter((plugin) => {
      if (group !== "all" && groupOf(plugin.id) !== group) return false
      return !search || `${pluginLabel(t, plugin.id, plugin.name)} ${pluginHint(t, plugin.id)}`.toLowerCase().includes(search)
    })
  }, [plugins, query, group, t])

  if (reordering) {
    return (
      <Reordering
        plugins={plugins}
        onCancel={() => {
          returnFocus.current = true
          setReordering(false)
        }}
        onDone={(next) => {
          returnFocus.current = true
          setPlugins(next)
          setReordering(false)
          setSaved(true)
        }}
      />
    )
  }

  const shownGroups = GROUPS.filter(({ id }) => results.some((plugin) => groupOf(plugin.id) === id))
  const filters = GROUPS.filter(({ id }) => plugins.some((plugin) => groupOf(plugin.id) === id))

  return (
    <>
      <p className="-mt-4 text-muted-foreground">{t("plugins.intro")}</p>
      <div className="mt-5 flex flex-wrap items-center gap-3">
        <div className="relative w-full max-w-xs">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input aria-label={t("plugins.search")} placeholder={t("plugins.search")} className="min-h-10 bg-card pl-9" value={query} onChange={(event) => setQuery(event.target.value)} />
        </div>
        <Segmented label={t("plugins.filter")} value={group} onChange={(next) => setGroup(next as GroupFilter)} options={[{ value: "all", label: t("plugins.all") }, ...filters.map(({ id, label }) => ({ value: id, label: t(label) }))]} />
        <Button id="reorder-button" variant="outline" className="min-h-10 sm:ml-auto" onClick={() => { setSaved(false); setReordering(true) }}>{t("plugins.reorder")}</Button>
      </div>
      <p role="status" className="sr-only">{t("plugins.count", { count: String(results.length) })}</p>
      {saved ? <p role="status" className="mt-3 text-sm text-muted-foreground">{t("plugins.orderSaved")}</p> : null}
      {shownGroups.length === 0 ? (
        <div className="mt-10 rounded-[var(--radius)] border border-dashed border-input p-10 text-center">
          <p className="font-medium">{t("plugins.none")}</p>
          <Button variant="outline" className="mt-3 min-h-10" onClick={() => { setQuery(""); setGroup("all") }}>{t("plugins.showAll")}</Button>
        </div>
      ) : null}
      {shownGroups.map(({ id, label }) => (
        <section key={id} className="mt-8" aria-labelledby={`group-${id}`}>
          <h2 id={`group-${id}`} className="text-lg font-semibold">{t(label)}</h2>
          <ul className="mt-3 grid grid-cols-2 gap-x-6 gap-y-5 md:grid-cols-3 lg:grid-cols-4">
            {results.filter((plugin) => groupOf(plugin.id) === id).map((plugin) => <li key={plugin.id}><PluginCard plugin={plugin} /></li>)}
          </ul>
        </section>
      ))}
    </>
  )
}

export function PluginsPage() {
  const { t } = useI18n()
  const { data, failed, retry } = useResource(getPlugins)
  return (
    <Shell title={t("nav.plugins")} current="nav.plugins">
      <PageTitle>{t("nav.plugins")}</PageTitle>
      {data ? <Catalogue initial={data.plugins} /> : failed ? <LoadFailed title={t("plugins.loadFailed")} onRetry={retry} /> : <Loading />}
    </Shell>
  )
}
