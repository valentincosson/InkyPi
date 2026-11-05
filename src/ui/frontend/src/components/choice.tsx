import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

export function Choice<T extends string>({ id, label, value, options, onChange }: { id: string; label?: string; value: T; options: { value: T; label: string }[]; onChange: (value: T) => void }) {
  return (
    <Select items={options} value={value} onValueChange={(next) => onChange(next as T)}>
      <SelectTrigger id={id} aria-label={label} className="min-h-10 w-full bg-card"><SelectValue /></SelectTrigger>
      <SelectContent>
        {options.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
      </SelectContent>
    </Select>
  )
}
