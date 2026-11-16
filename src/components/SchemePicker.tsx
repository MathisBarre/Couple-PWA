import { Toggle } from '@base-ui/react/toggle'
import { ToggleGroup } from '@base-ui/react/toggle-group'
import { useState } from 'react'
import { getSchemeChoice, setSchemeChoice, type SchemeChoice } from '../lib/scheme'
import { Icon, type IconName } from './icons'
import { cx } from './ui'

const CHOICES: [SchemeChoice, IconName, string][] = [
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
      className="mt-1 grid grid-cols-3 border-t border-l border-ink"
    >
      {CHOICES.map(([id, icon, label]) => (
        <Toggle
          key={id}
          value={id}
          className={cx(
            'flex flex-col items-center gap-1.5 border-r border-b border-ink py-3 text-[0.98rem] transition-colors select-none',
            'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
            'data-pressed:bg-ink data-pressed:font-semibold data-pressed:text-bg',
          )}
        >
          <Icon name={icon} className="size-6" />
          {label}
        </Toggle>
      ))}
    </ToggleGroup>
  )
}
