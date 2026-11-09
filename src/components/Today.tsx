import { Toggle } from '@base-ui/react/toggle'
import { ToggleGroup } from '@base-ui/react/toggle-group'
import { useMemo, useState } from 'react'
import { addDays, computeStatus, FLOW_LABELS, type DayLog, type Flow } from '../../supabase/functions/_shared/cycles'
import { formatLong, formatShort } from '../lib/dates'
import { DayEditor } from './DayEditor'
import { Button, cx, flowBg } from './ui'

interface Props {
  today: string
  logs: DayLog[]
  defaultCycle: number
  names: Record<string, string>
  onSave: (log: DayLog) => void
  onDelete: (day: string) => void
}

const chip =
  'relative inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-line bg-surface px-3.5 py-2 data-pressed:border-accent data-pressed:font-semibold data-pressed:ring-1 data-pressed:ring-accent'

export function Today({ today, logs, defaultCycle, names, onSave, onDelete }: Props) {
  const [day, setDay] = useState(today)
  const byDay = useMemo(() => new Map(logs.map((l) => [l.day, l])), [logs])
  const status = useMemo(() => computeStatus(logs, today, defaultCycle), [logs, today, defaultCycle])
  const log = byDay.get(day)
  const recent = [0, -1, -2].map((o) => addDays(today, o))

  const lastFlow = (status.kind === 'in_period' || status.kind === 'maybe_ended' ? status.period.days.at(-1)?.flow : null) ?? 2
  const quick = (flow: Flow) => {
    onSave({ ...(byDay.get(today) ?? { day: today, pain: null, symptoms: [], note: null }), day: today, flow })
    setDay(today)
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

      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none]">
        <ToggleGroup aria-label="Jour à noter" value={[day]} onValueChange={(v) => v.length && setDay(v[0])} className="flex gap-2">
          {recent.map((d, i) => {
            const l = byDay.get(d)
            return (
              <Toggle key={d} value={d} className={chip}>
                {i === 0 ? 'Aujourd’hui' : i === 1 ? 'Hier' : formatShort(d)}
                {l && <span className={cx('size-2.5 rounded-full', l.flow ? flowBg[l.flow] : 'bg-line')} />}
              </Toggle>
            )
          })}
        </ToggleGroup>
        <label className={cx(chip, 'overflow-hidden', !recent.includes(day) && 'border-accent font-semibold ring-1 ring-accent')}>
          📅 {recent.includes(day) ? 'Autre' : formatShort(day)}
          <input
            aria-label="Choisir une autre date"
            type="date"
            max={today}
            value={day}
            onChange={(e) => e.target.value && setDay(e.target.value)}
            className="absolute inset-0 opacity-0"
          />
        </label>
      </div>

      <h2 className="text-xl font-bold first-letter:uppercase">{day === today ? 'Aujourd’hui' : formatLong(day)}</h2>
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
