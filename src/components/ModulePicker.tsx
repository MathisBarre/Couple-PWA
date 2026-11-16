import { Switch as BaseSwitch } from '@base-ui/react/switch'
import { haptic } from '../lib/haptics'
import { MODULES, type ModuleId } from '../modules'
import { Glyph } from './icons'

/**
 * Les espaces de l'app, chacun avec son interrupteur : à la création de l'espace (onboarding) et dans
 * les réglages. Le dernier espace activé ne peut pas être coupé.
 */
export function ModulePicker({ value, onChange, disabled }: { value: readonly ModuleId[]; onChange: (ids: ModuleId[]) => void; disabled?: boolean }) {
  const toggle = (id: ModuleId, on: boolean) => onChange(MODULES.map((m) => m.id).filter((m) => (m === id ? on : value.includes(m))))
  return (
    <ul className="sk-card sk-list w-full text-left">
      {MODULES.map((m) => {
        const on = value.includes(m.id)
        const last = on && value.length === 1
        return (
          <li key={m.id}>
            <label className="flex min-h-16 w-full items-center gap-3 px-4 py-3 select-none">
              {/* Pastille aux couleurs de l'espace (son thème s'applique à elle seule). */}
              <span data-theme={m.theme} aria-hidden className="sk-app-icon size-10 shrink-0">
                <Glyph icon={m.icon} className="size-6" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-semibold">{m.label}</span>
                <span className="block text-sm text-ink-2">{m.description}</span>
              </span>
              <BaseSwitch.Root
                checked={on}
                disabled={disabled || last}
                onCheckedChange={(v) => {
                  haptic()
                  toggle(m.id, v)
                }}
                className="sk-switch shrink-0 disabled:opacity-60"
                aria-label={m.label}
              >
                <BaseSwitch.Thumb className="sk-switch-thumb" />
              </BaseSwitch.Root>
            </label>
          </li>
        )
      })}
    </ul>
  )
}
