import type { DayLog } from '../../shared/cycles'
import type { Couple } from '../lib/api'
import { Calendar } from './Calendar'
import { CycleSettings } from './CycleSettings'
import { SpaceTabs } from './SpaceTabs'
import { Stats } from './Stats'
import { Today } from './Today'

export type CycleTab = 'today' | 'calendar' | 'stats' | 'settings'

interface Props {
  tab: CycleTab
  onTab: (t: CycleTab) => void
  today: string
  logs: DayLog[]
  couple: Couple
  onCoupleChange: () => void
  names: Record<string, string>
  onSave: (log: DayLog) => void
  onDelete: (day: string) => void
}

/** Espace « Cycle » : saisie du jour, calendrier, analyse et réglages du suivi, avec ses onglets en haut. */
export function Cycle({ tab, onTab, today, logs, couple, onCoupleChange, names, onSave, onDelete }: Props) {
  const common = { today, logs, defaultCycle: couple.default_cycle_length }
  return (
    <SpaceTabs
      tab={tab}
      onTab={onTab}
      tabs={[
        { id: 'today', label: 'Aujourd’hui', node: <Today key={today} {...common} names={names} onSave={onSave} onDelete={onDelete} /> },
        { id: 'calendar', label: 'Calendrier', node: <Calendar {...common} names={names} onSave={onSave} onDelete={onDelete} /> },
        { id: 'stats', label: 'Analyse', node: <Stats {...common} iudInsertedOn={couple.iud_inserted_on} /> },
        { id: 'settings', label: 'Réglages', node: <CycleSettings couple={couple} onChange={onCoupleChange} /> },
      ]}
    />
  )
}
