import { Tabs } from '@base-ui/react/tabs'
import { useLayoutEffect, useRef, type ReactNode } from 'react'
import { slideTabs } from '../lib/motion'
import { cx } from './ui'

export interface SpaceTab<T extends string> {
  id: T
  label: string
  node: ReactNode
}

/**
 * Onglets en haut d'un espace (ex. Cycle : Aujourd'hui / Calendrier / Analyse / Réglages).
 * Un espace qui a ses propres réglages les met dans un dernier onglet « Réglages »,
 * les réglages communs à toute l'app restant dans l'onglet Réglages de la barre du bas.
 */
export function SpaceTabs<T extends string>({ tabs, tab, onTab }: { tabs: SpaceTab<T>[]; tab: T; onTab: (t: T) => void }) {
  const panels = useRef<Partial<Record<T, HTMLElement | null>>>({})

  // Les panneaux restent montés (saisie en cours conservée) et glissent l'un vers l'autre.
  const order = useRef<T[]>([])
  useLayoutEffect(() => {
    order.current = tabs.map((t) => t.id)
  })
  const prev = useRef(tab)
  useLayoutEffect(() => {
    const from = prev.current
    prev.current = tab
    const a = panels.current[from]
    const b = panels.current[tab]
    if (from === tab || !a || !b) return
    const ids = order.current
    return slideTabs(a, b, ids.indexOf(tab) > ids.indexOf(from) ? 1 : -1, { inFlow: true })
  }, [tab])

  return (
    <Tabs.Root value={tab} onValueChange={(v) => onTab(v as T)}>
      <Tabs.List
        className="relative mb-3.5 grid gap-1 rounded-2xl bg-surface-2 p-1"
        style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}
      >
        {/* Pastille qui glisse sous l'onglet actif, comme un sélecteur iOS. */}
        <Tabs.Indicator className="absolute top-(--active-tab-top) left-(--active-tab-left) h-(--active-tab-height) w-(--active-tab-width) rounded-xl bg-surface shadow-sm transition-[left,width] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none" />
        {tabs.map(({ id, label }) => (
          <Tabs.Tab
            key={id}
            value={id}
            className={cx(
              'relative z-10 truncate rounded-xl px-1 py-2 text-sm text-ink-2 transition-colors outline-none select-none',
              'focus-visible:outline-2 focus-visible:outline-accent data-active:font-semibold data-active:text-ink',
            )}
          >
            {label}
          </Tabs.Tab>
        ))}
      </Tabs.List>
      <div className="relative">
        {tabs.map(({ id, node }) => (
          <Tabs.Panel
            key={id}
            keepMounted
            value={id}
            ref={(el: HTMLElement | null) => {
              panels.current[id] = el
            }}
          >
            {node}
          </Tabs.Panel>
        ))}
      </div>
    </Tabs.Root>
  )
}
