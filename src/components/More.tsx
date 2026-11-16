import type { ReactNode } from 'react'
import type { ModuleId } from '../modules'
import { ScreenHeader } from './ScreenHeader'
import { Glyph } from './icons'
import { cx } from './ui'

/** Écran « Plus » : les espaces qui ne tiennent pas dans la barre du bas, puis les réglages. */
export function More({
  modules,
  onOpen,
  children,
}: {
  modules: readonly { id: ModuleId; label: string; icon: string; description: string }[]
  onOpen: (id: ModuleId) => void
  children: ReactNode
}) {
  return (
    <>
      <ScreenHeader title="Plus" />
      <div className="flex flex-col gap-5">
        <h2 className="sk-section-title -mb-2 pl-2">Autres espaces</h2>
        <div className="grid grid-cols-2 gap-2.5">
          {modules.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => onOpen(m.id)}
              className={cx(
                'sk-card flex flex-col items-start gap-1 p-4 text-left active:bg-surface-2',
                'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
              )}
            >
              <span aria-hidden className="sk-app-icon size-10">
                <Glyph icon={m.icon} className="size-6" />
              </span>
              <span className="font-semibold">{m.label}</span>
              <span className="text-xs text-ink-2">{m.description}</span>
            </button>
          ))}
        </div>
        {children}
      </div>
    </>
  )
}
