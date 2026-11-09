import { Tabs } from '@base-ui/react/tabs'
import { useLayoutEffect, useRef } from 'react'
import type { DayLog } from '../../shared/cycles'
import { slideTabs } from '../lib/motion'
import { Calendar } from './Calendar'
import { Stats } from './Stats'
import { Today } from './Today'
import { cx } from './ui'

export type CycleTab = 'today' | 'calendar' | 'stats'

const TABS: [CycleTab, string][] = [
  ['today', 'Aujourd’hui'],
  ['calendar', 'Calendrier'],
  ['stats', 'Analyse'],
]

interface Props {
  tab: CycleTab
  onTab: (t: CycleTab) => void
  today: string
  logs: DayLog[]
  defaultCycle: number
  iudInsertedOn: string | null
  names: Record<string, string>
  onSave: (log: DayLog) => void
  onDelete: (day: string) => void
}

/** Espace « Cycle » : saisie du jour, calendrier et analyse, avec ses propres onglets en haut. */
export function Cycle({ tab, onTab, today, logs, defaultCycle, iudInsertedOn, names, onSave, onDelete }: Props) {
  const common = { today, logs, defaultCycle }
  const panels = useRef<Partial<Record<CycleTab, HTMLElement | null>>>({})
  const panelRef = (id: CycleTab) => (el: HTMLElement | null) => {
    panels.current[id] = el
  }

  // Les panneaux restent montés (saisie en cours conservée) et glissent l'un vers l'autre.
  const prev = useRef(tab)
  useLayoutEffect(() => {
    const from = prev.current
    prev.current = tab
    const a = panels.current[from]
    const b = panels.current[tab]
    if (from === tab || !a || !b) return
    const order = TABS.map(([id]) => id)
    return slideTabs(a, b, order.indexOf(tab) > order.indexOf(from) ? 1 : -1, { inFlow: true })
  }, [tab])

  return (
    <Tabs.Root value={tab} onValueChange={(v) => onTab(v as CycleTab)}>
      <Tabs.List className="relative mb-3.5 grid grid-cols-3 gap-1 rounded-2xl bg-surface-2 p-1">
        {/* Pastille qui glisse sous l'onglet actif, comme un sélecteur iOS. */}
        <Tabs.Indicator className="absolute top-(--active-tab-top) left-(--active-tab-left) h-(--active-tab-height) w-(--active-tab-width) rounded-xl bg-surface shadow-sm transition-[left,width] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none" />
        {TABS.map(([id, label]) => (
          <Tabs.Tab
            key={id}
            value={id}
            className={cx(
              'relative z-10 rounded-xl py-2 text-sm text-ink-2 transition-colors outline-none select-none',
              'focus-visible:outline-2 focus-visible:outline-accent data-active:font-semibold data-active:text-ink',
            )}
          >
            {label}
          </Tabs.Tab>
        ))}
      </Tabs.List>
      <div className="relative">
        <Tabs.Panel keepMounted value="today" ref={panelRef('today')}>
          <Today key={today} {...common} names={names} onSave={onSave} onDelete={onDelete} />
        </Tabs.Panel>
        <Tabs.Panel keepMounted value="calendar" ref={panelRef('calendar')}>
          <Calendar {...common} names={names} onSave={onSave} onDelete={onDelete} />
        </Tabs.Panel>
        <Tabs.Panel keepMounted value="stats" ref={panelRef('stats')}>
          <Stats {...common} iudInsertedOn={iudInsertedOn} />
        </Tabs.Panel>
      </div>
    </Tabs.Root>
  )
}
