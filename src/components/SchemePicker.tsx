import { Toggle } from '@base-ui/react/toggle'
import { ToggleGroup } from '@base-ui/react/toggle-group'
import { useState } from 'react'
import { getSchemeChoice, setSchemeChoice, type SchemeChoice } from '../lib/scheme'
import { Icon } from './icons'
import { cx } from './ui'

const CHOICES: [SchemeChoice, string, string][] = [
  ['system', 'phone', 'Système'],
  ['light', 'sun', 'Clair'],
  ['dark', 'moon', 'Sombre'],
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
      className="well mt-1 grid grid-cols-3 gap-1 rounded-[1.0625rem] p-1"
    >
      {CHOICES.map(([id, icon, label]) => (
        <Toggle
          key={id}
          value={id}
          className={cx(
            'scheme-item flex min-h-16 flex-col items-center justify-center gap-1 rounded-[0.8125rem] py-2.5 text-sm font-medium text-ink-2 transition-colors select-none',
            'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
            'data-pressed:font-bold data-pressed:text-ink',
          )}
        >
          <Icon name={icon} className="size-5.5" />
          {label}
        </Toggle>
      ))}
    </ToggleGroup>
  )
}
