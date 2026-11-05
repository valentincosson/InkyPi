export function Segmented({ label, value, options, onChange }: { label: string; value: string; options: { value: string; label: string }[]; onChange: (value: string) => void }) {
  return (
    <div className="flex w-fit max-w-full flex-wrap gap-0.5 rounded-[var(--radius)] bg-muted p-0.5" role="group" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
          className={`min-h-9 min-w-11 rounded-[calc(var(--radius)-2px)] px-3 text-sm font-medium transition-colors ${value === option.value ? "bg-card text-foreground shadow-[0_0_0_1px_var(--control),0_1px_2px_rgb(0_0_0/.08)]" : "text-muted-foreground hover:text-foreground"}`}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}
