import { useMemo, useState } from 'react'
import { addDays, computeStatus, FLOW_LABELS, type DayLog, type Flow } from '../../supabase/functions/_shared/cycles'
import { formatLong, formatShort } from '../lib/dates'
import { DayEditor } from './DayEditor'

interface Props {
  today: string
  logs: DayLog[]
  defaultCycle: number
  names: Record<string, string>
  onSave: (log: DayLog) => void
  onDelete: (day: string) => void
  initialDay?: string
}

export function Today({ today, logs, defaultCycle, names, onSave, onDelete, initialDay }: Props) {
  const [day, setDay] = useState(initialDay ?? today)
  const byDay = useMemo(() => new Map(logs.map((l) => [l.day, l])), [logs])
  const status = useMemo(() => computeStatus(logs, today, defaultCycle), [logs, today, defaultCycle])
  const log = byDay.get(day)

  const lastFlow = (status.kind === 'in_period' || status.kind === 'maybe_ended') ? status.period.days.at(-1)?.flow ?? 2 : 2
  const quick = (flow: Flow) => {
    onSave({ ...(byDay.get(today) ?? { day: today, pain: null, symptoms: [], note: null }), day: today, flow })
    setDay(today)
  }

  return (
    <div className="screen">
      <StatusCard status={status} />

      {status.kind === 'in_period' && !status.loggedToday && (
        <div className="quick">
          <button className="primary" onClick={() => quick(lastFlow as Flow)}>
            Ça continue ({FLOW_LABELS[lastFlow ?? 2].toLowerCase()})
          </button>
          <button onClick={() => quick(0)}>C’est fini</button>
        </div>
      )}
      {status.kind === 'maybe_ended' && (
        <div className="quick">
          <button className="primary" onClick={() => quick(0)}>
            Oui, c’est fini
          </button>
          <button onClick={() => quick(lastFlow as Flow)}>Non, ça continue</button>
        </div>
      )}

      <div className="day-picker">
        {[0, -1, -2].map((offset) => {
          const d = addDays(today, offset)
          const l = byDay.get(d)
          return (
            <button key={d} className={`day-chip ${day === d ? 'selected' : ''}`} onClick={() => setDay(d)}>
              {offset === 0 ? 'Aujourd’hui' : offset === -1 ? 'Hier' : formatShort(d)}
              {l && <span className={`dot flow-${l.flow ?? 0}`} />}
            </button>
          )
        })}
        <label className="day-chip date-input">
          📅
          <input type="date" max={today} value={day} onChange={(e) => e.target.value && setDay(e.target.value)} />
        </label>
      </div>

      <h2 className="day-title">{day === today ? 'Aujourd’hui' : formatLong(day)}</h2>
      <DayEditor
        key={day}
        day={day}
        log={log}
        onSave={onSave}
        onDelete={onDelete}
        authorName={log?.updated_by ? names[log.updated_by] : undefined}
      />
    </div>
  )
}

function StatusCard({ status }: { status: ReturnType<typeof computeStatus> }) {
  let title = ''
  let sub = ''
  let tone = 'calm'
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
    <div className={`status status-${tone}`}>
      <div className="status-title">{title}</div>
      <div className="status-sub">{sub}</div>
    </div>
  )
}
