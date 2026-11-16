import { Toggle } from '@base-ui/react/toggle'
import { ToggleGroup } from '@base-ui/react/toggle-group'
import { useState } from 'react'
import { getSchemeChoice, setSchemeChoice, type SchemeChoice } from '../lib/scheme'
import { Glyph } from './icons'

const CHOICES: [SchemeChoice, string, string][] = [
  ['system', '📱', 'Système'],
  ['light', '☀️', 'Clair'],
  ['dark', '🌙', 'Sombre'],
]

/** Clair / sombre / comme le téléphone. Choix gardé sur cet appareil, appliqué tout de suite. */
export function SchemePicker() {
  const [choice, setChoice] = useState(getSchemeChoice)
  return (
    <ToggleGroup
      aria-label="Thème"
      value={[choice]}
      onValueChange={(v) => {
        if (!v.length) return
        const next = v[0] as SchemeChoice
        setChoice(next)
        setSchemeChoice(next)
      }}
      className="sk-seg grid-cols-3"
    >
      {CHOICES.map(([id, icon, label]) => (
        <Toggle
          key={id}
          value={id}
          className="sk-seg-item flex min-h-11 items-center justify-center gap-1.5 select-none"
        >
          <Glyph icon={icon} className="size-[1.15rem]" />
          {label}
        </Toggle>
      ))}
    </ToggleGroup>
  )
}
