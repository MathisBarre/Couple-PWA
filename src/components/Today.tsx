import { useMemo } from 'react'
import { computeStatus, FLOW_LABELS, type DayLog, type Flow } from '../../shared/cycles'
import { formatLong } from '../lib/dates'
import { Calendar } from './Calendar'
import { DayEditor } from './DayEditor'
import { Button, cx } from './ui'

interface Props {
  today: string
  logs: DayLog[]
  defaultCycle: number
  names: Record<string, string>
  onSave: (log: DayLog) => void
  onDelete: (day: string) => void
}

export function Today({ today, logs, defaultCycle, names, onSave, onDelete }: Props) {
  const byDay = useMemo(() => new Map(logs.map((l) => [l.day, l])), [logs])
  const status = useMemo(() => computeStatus(logs, today, defaultCycle), [logs, today, defaultCycle])
  const log = byDay.get(today)

  const lastFlow = (status.kind === 'in_period' || status.kind === 'maybe_ended' ? status.period.days.at(-1)?.flow : null) ?? 2
  const quick = (flow: Flow) => {
    onSave({ ...(byDay.get(today) ?? { day: today, pain: null, symptoms: [], note: null }), day: today, flow })
  }

  return (
    <div className="flex flex-col gap-3.5">
      <StatusCard status={status} />

      {status.kind === 'in_period' && !status.loggedToday && (
        <div className="grid grid-cols-[2fr_1fr] gap-2.5">
          <Button onClick={() => quick(lastFlow as Flow)}>Ça continue ({FLOW_LABELS[lastFlow].toLowerCase()})</Button>
          <Button variant="outline" onClick={() => quick(0)}>
            C’est fini
          </Button>
        </div>
      )}
      {status.kind === 'maybe_ended' && (
        <div className="grid grid-cols-[2fr_1fr] gap-2.5">
          <Button onClick={() => quick(0)}>Oui, c’est fini</Button>
          <Button variant="outline" onClick={() => quick(lastFlow as Flow)}>
            Non, ça continue
          </Button>
        </div>
      )}

      <h2 className="text-xl font-bold">Aujourd’hui</h2>
      <DayEditor
        day={today}
        log={log}
        onSave={onSave}
        onDelete={onDelete}
        authorName={log?.updated_by ? names[log.updated_by] : undefined}
      />

      {/* Calendrier juste en dessous : toucher un jour passé l'ouvre pour le modifier. */}
      <section aria-label="Calendrier" className="mt-4 border-t border-line pt-5">
        <Calendar today={today} logs={logs} defaultCycle={defaultCycle} names={names} onSave={onSave} onDelete={onDelete} />
      </section>
    </div>
  )
}

function StatusCard({ status }: { status: ReturnType<typeof computeStatus> }) {
  let title = ''
  let sub = ''
  let tone: 'calm' | 'period' | 'soon' = 'calm'
  switch (status.kind) {
    case 'empty':
      title = 'Bienvenue'
      sub = 'Notez le premier jour des dernières règles pour lancer les prévisions.'
      break
    case 'in_period':
      title = `Règles · jour ${status.dayNumber}`
      sub = status.loggedToday ? 'Journée notée. À demain !' : 'Pas encore noté aujourd’hui.'
      tone = 'period'
      break
    case 'maybe_ended':
      title = 'C’est terminé ?'
      sub = `Dernier saignement noté il y a ${status.daysSinceBleeding} jours.`
      tone = 'period'
      break
    case 'waiting':
      title = status.daysUntil === 0 ? 'Règles prévues aujourd’hui' : `Prochaines règles dans ~${status.daysUntil} j`
      sub = `Vers le ${formatLong(status.nextStart)} · jour ${status.cycleDay} du cycle`
      tone = status.daysUntil <= 3 ? 'soon' : 'calm'
      break
    case 'late':
      title = `Retard de ${status.daysLate} jour${status.daysLate > 1 ? 's' : ''}`
      sub = `Prévues le ${formatLong(status.nextStart)} · jour ${status.cycleDay} du cycle`
      tone = 'soon'
      break
  }
  return (
    <div
      className={cx(
        'rounded-2xl p-4.5',
        tone === 'calm' && 'border border-line bg-surface',
        tone === 'period' && 'bg-accent text-on-accent',
        tone === 'soon' && 'bg-soon text-on-soon',
      )}
    >
      <div className="text-2xl font-bold">{title}</div>
      <div className={cx('mt-1', tone === 'calm' ? 'text-ink-2' : 'opacity-85')}>{sub}</div>
    </div>
  )
}
