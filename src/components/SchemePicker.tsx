import { Toggle } from '@base-ui/react/toggle'
import { ToggleGroup } from '@base-ui/react/toggle-group'
import { useState } from 'react'
import { getSchemeChoice, setSchemeChoice, type SchemeChoice } from '../lib/scheme'
import { cx } from './ui'

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
      className="mt-1 grid grid-cols-3 gap-2"
    >
      {CHOICES.map(([id, icon, label]) => (
        <Toggle
          key={id}
          value={id}
          className={cx(
            'flex flex-col items-center gap-1 rounded-xl border border-line bg-surface py-2.5 text-sm text-ink-2 transition-colors select-none',
            'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
            'data-pressed:border-accent data-pressed:font-semibold data-pressed:text-ink data-pressed:ring-1 data-pressed:ring-accent',
          )}
        >
          <span aria-hidden className="text-lg">
            {icon}
          </span>
          {label}
        </Toggle>
      ))}
    </ToggleGroup>
  )
}
