import { Tabs } from '@base-ui/react/tabs'
import type { DayLog } from '../../shared/cycles'
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
  return (
    <Tabs.Root value={tab} onValueChange={(v) => onTab(v as CycleTab)}>
      <Tabs.List className="mb-3.5 grid grid-cols-3 gap-1 rounded-2xl bg-surface-2 p-1">
        {TABS.map(([id, label]) => (
          <Tabs.Tab
            key={id}
            value={id}
            className={cx(
              'rounded-xl py-2 text-sm text-ink-2 transition-colors outline-none',
              'focus-visible:outline-2 focus-visible:outline-accent data-active:bg-surface data-active:font-semibold data-active:text-ink data-active:shadow-sm',
            )}
          >
            {label}
          </Tabs.Tab>
        ))}
      </Tabs.List>
      <Tabs.Panel value="today">
        <Today key={today} {...common} names={names} onSave={onSave} onDelete={onDelete} />
      </Tabs.Panel>
      <Tabs.Panel value="calendar">
        <Calendar {...common} names={names} onSave={onSave} onDelete={onDelete} />
      </Tabs.Panel>
      <Tabs.Panel value="stats">
        <Stats {...common} iudInsertedOn={iudInsertedOn} />
      </Tabs.Panel>
    </Tabs.Root>
  )
}
