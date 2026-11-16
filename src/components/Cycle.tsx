import type { DayLog } from '../../shared/cycles'
import type { CycleInfo } from '../lib/api'
import type { LoadStatus } from '../lib/store'
import { CyclePicker } from './CyclePicker'
import { SpaceTabs } from './SpaceTabs'
import { Stats } from './Stats'
import { Today } from './Today'

export type CycleTab = 'today' | 'stats'

interface Props {
  tab: CycleTab
  onTab: (t: CycleTab) => void
  today: string
  logs: DayLog[]
  /** Cycles suivis dans l'espace (un par personne) et celui affiché. */
  cycles: CycleInfo[]
  cycle: CycleInfo
  onCycle: (id: string) => void
  /** ⚙️ : ouvre les réglages du suivi (écran empilé). */
  onSettings: () => void
  names: Record<string, string>
  onSave: (log: DayLog) => void
  onDelete: (day: string) => void
  /** Premier chargement des journées : en cours, raté, ou fait. */
  load?: LoadStatus
  onRetry?: () => void
}

/**
 * Espace « Cycle » : suivi (saisie du jour + calendrier) et analyse ; ses réglages sont derrière ⚙️.
 * Plusieurs cycles suivis : une pastille par personne, collée sous les onglets.
 */
export function Cycle({ tab, onTab, today, logs, cycles, cycle, onCycle, onSettings, names, onSave, onDelete, load, onRetry }: Props) {
  const common = { today, logs, defaultCycle: cycle.default_cycle_length, load, onRetry }
  const bar = cycles.length > 1 ? <CyclePicker cycles={cycles} value={cycle.id} onChange={onCycle} className="mt-2.5" /> : undefined
  return (
    <SpaceTabs
      title="Cycle"
      onSettings={onSettings}
      tab={tab}
      onTab={onTab}
      tabs={[
        // La clé change avec le cycle : la saisie en cours d'une personne ne passe pas à une autre.
        { id: 'today', label: 'Suivi', bar, node: <Today key={`${cycle.id}:${today}`} {...common} names={names} onSave={onSave} onDelete={onDelete} /> },
        {
          id: 'stats',
          label: 'Analyse',
          bar,
          // Section stérilet : si une date de pose est notée, ou pour un cycle unique (comme avant).
          node: <Stats key={cycle.id} {...common} iudInsertedOn={cycle.iud_inserted_on} showIud={cycles.length === 1 || cycle.iud_inserted_on != null} />,
        },
      ]}
    />
  )
}
