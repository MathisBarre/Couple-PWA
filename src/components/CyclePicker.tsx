import { Toggle } from '@base-ui/react/toggle'
import { ToggleGroup } from '@base-ui/react/toggle-group'
import { cycleLabel, type CycleInfo } from '../lib/api'
import { haptic } from '../lib/haptics'

/** Choix du cycle affiché quand l'espace en suit plusieurs (une pastille par personne). */
export function CyclePicker({ cycles, value, onChange, className }: { cycles: CycleInfo[]; value: string; onChange: (id: string) => void; className?: string }) {
  if (cycles.length < 2) return null
  return (
    <ToggleGroup
      aria-label="Cycle affiché"
      value={[value]}
      onValueChange={(v) => {
        if (!v.length || v[0] === value) return
        haptic()
        onChange(v[0])
      }}
      className={`-mx-1 flex gap-2 overflow-x-auto px-1 py-0.5 [scrollbar-width:none] ${className ?? ''}`}
    >
      {cycles.map((c) => (
        <Toggle
          key={c.id}
          value={c.id}
          className="sk-key min-h-10 shrink-0 rounded-full px-4 py-1.5 text-sm font-medium whitespace-nowrap data-pressed:bg-flow-1 data-pressed:font-semibold data-pressed:text-ink"
        >
          {cycleLabel(cycles, c)}
        </Toggle>
      ))}
    </ToggleGroup>
  )
}
