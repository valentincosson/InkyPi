import { useEffect, useRef, useState, type ReactNode } from "react"
import { ArrowDownIcon, ArrowUpIcon, GripVerticalIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useI18n } from "@/i18n"
import { moved } from "@/reorder"

type Item = { id: string; label: string }

/** Réordonne à la souris, au doigt ou au clavier : les boutons restent le chemin qui marche partout. */
export function ReorderList<T extends Item>({ items, render, onChange }: { items: T[]; render: (item: T) => ReactNode; onChange: (items: T[]) => void }) {
  const { t } = useI18n()
  const [dragging, setDragging] = useState<number | null>(null)
  const [announcement, setAnnouncement] = useState("")
  const focusNext = useRef<string | null>(null)

  useEffect(() => {
    if (!focusNext.current) return
    document.getElementById(focusNext.current)?.focus()
    focusNext.current = null
  })

  const move = (from: number, to: number, focusId?: string) => {
    if (to < 0 || to >= items.length || from === to) return
    focusNext.current = focusId ?? null
    setAnnouncement(t("reorder.moved", { name: items[from].label, position: String(to + 1), total: String(items.length) }))
    onChange(moved(items, from, to))
  }

  return (
    <>
      <p role="status" className="sr-only">{announcement}</p>
      <ol className="divide-y divide-border rounded-[var(--radius)] border border-border bg-card">
        {items.map((item, index) => {
          const up = `move-up-${item.id}`
          const down = `move-down-${item.id}`
          return (
            <li
              key={item.id}
              draggable
              onDragStart={(event) => {
                event.dataTransfer.effectAllowed = "move"
                // Certains navigateurs ne démarrent pas le glisser sans donnée.
                event.dataTransfer.setData("text/plain", item.id)
                setDragging(index)
              }}
              onDragOver={(event) => {
                if (dragging === null) return
                event.preventDefault()
                if (dragging !== index) {
                  move(dragging, index)
                  setDragging(index)
                }
              }}
              onDrop={(event) => event.preventDefault()}
              onDragEnd={() => setDragging(null)}
              className={`flex items-center gap-3 px-3 py-1.5 ${dragging === index ? "bg-accent" : ""}`}
            >
              <GripVerticalIcon className="size-4 shrink-0 cursor-grab text-muted-foreground" aria-hidden="true" />
              <div className="min-w-0 flex-1">{render(item)}</div>
              <Button id={up} type="button" variant="ghost" size="icon" className="size-10 shrink-0" aria-label={t("reorder.up", { name: item.label })} aria-disabled={index === 0} onClick={() => move(index, index - 1, up)}><ArrowUpIcon aria-hidden="true" /></Button>
              <Button id={down} type="button" variant="ghost" size="icon" className="size-10 shrink-0" aria-label={t("reorder.down", { name: item.label })} aria-disabled={index === items.length - 1} onClick={() => move(index, index + 1, down)}><ArrowDownIcon aria-hidden="true" /></Button>
            </li>
          )
        })}
      </ol>
    </>
  )
}
