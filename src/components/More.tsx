import type { ReactNode } from 'react'
import type { ModuleId } from '../modules'
import { ScreenHeader } from './ScreenHeader'
import { Icon, type IconName } from './icons'
import { cx } from './ui'

/** Écran « Plus » : les espaces qui ne tiennent pas dans la barre du bas, puis les réglages. */
export function More({
  modules,
  onOpen,
  children,
}: {
  modules: readonly { id: ModuleId; label: string; icon: IconName; description: string }[]
  onOpen: (id: ModuleId) => void
  children: ReactNode
}) {
  return (
    <>
      <ScreenHeader title="Plus" />
      <div className="flex flex-col gap-5">
        <h2 className="etiquette -mb-2">Autres espaces</h2>
        <div className="grid grid-cols-2 border-t border-l border-ink">
          {modules.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => onOpen(m.id)}
              className={cx(
                'flex flex-col items-start gap-1 border-r border-b border-ink p-4 text-left active:bg-surface-2',
                'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
              )}
            >
              <Icon name={m.icon} className="size-7" />
              <span className="font-semibold">{m.label}</span>
              <span className="text-sm text-ink-2 italic">{m.description}</span>
            </button>
          ))}
        </div>
        {children}
      </div>
    </>
  )
}
