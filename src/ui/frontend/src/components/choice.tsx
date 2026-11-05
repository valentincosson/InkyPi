import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

/** `long` : une longue liste s'ouvre sous le champ et reste courte, sans recouvrir ce qui l'entoure. */
export function Choice<T extends string>({ id, label, value, options, long, onChange }: { id: string; label?: string; value: T; options: { value: T; label: string }[]; long?: boolean; onChange: (value: T) => void }) {
  return (
    <Select items={options} value={value} onValueChange={(next) => onChange(next as T)}>
      <SelectTrigger id={id} aria-label={label} className="min-h-10 w-full bg-card"><SelectValue /></SelectTrigger>
      <SelectContent alignItemWithTrigger={!long} className={long ? "max-h-64" : undefined}>
        {options.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
      </SelectContent>
    </Select>
  )
}
