import type { DayLog } from '../../shared/cycles'
import type { Couple } from '../lib/api'
import type { LoadStatus } from '../lib/store'
import { SpaceTabs } from './SpaceTabs'
import { Stats } from './Stats'
import { Today } from './Today'

export type CycleTab = 'today' | 'stats'

interface Props {
  tab: CycleTab
  onTab: (t: CycleTab) => void
  today: string
  logs: DayLog[]
  couple: Couple
  /** ⚙️ : ouvre les réglages du suivi (écran empilé). */
  onSettings: () => void
  names: Record<string, string>
  onSave: (log: DayLog) => void
  onDelete: (day: string) => void
  /** Premier chargement des journées : en cours, raté, ou fait. */
  load?: LoadStatus
  onRetry?: () => void
}

/** Espace « Cycle » : suivi (saisie du jour + calendrier) et analyse ; ses réglages sont derrière ⚙️. */
export function Cycle({ tab, onTab, today, logs, couple, onSettings, names, onSave, onDelete, load, onRetry }: Props) {
  const common = { today, logs, defaultCycle: couple.default_cycle_length, load, onRetry }
  return (
    <SpaceTabs
      title="Cycle"
      onSettings={onSettings}
      tab={tab}
      onTab={onTab}
      tabs={[
        { id: 'today', label: 'Suivi', node: <Today key={today} {...common} names={names} onSave={onSave} onDelete={onDelete} /> },
        { id: 'stats', label: 'Analyse', node: <Stats {...common} iudInsertedOn={couple.iud_inserted_on} /> },
      ]}
    />
  )
}
