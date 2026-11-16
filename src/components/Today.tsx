import { useMemo } from 'react'
import { computeStatus, FLOW_LABELS, type DayLog, type Flow } from '../../shared/cycles'
import { formatDM, formatLong } from '../lib/dates'
import { Calendar } from './Calendar'
import { Button } from './ui'

interface Props {
  today: string
  logs: DayLog[]
  defaultCycle: number
  names: Record<string, string>
  onSave: (log: DayLog) => void
  onDelete: (day: string) => void
}

/**
 * Écran « Suivi » : une ligne de contexte (où en est le cycle), puis le calendrier, qui est l'écran.
 * Rien à saisir avant d'avoir touché un jour : toucher aujourd'hui (ou un jour passé) ouvre sa saisie.
 */
export function Today({ today, logs, defaultCycle, names, onSave, onDelete }: Props) {
  const byDay = useMemo(() => new Map(logs.map((l) => [l.day, l])), [logs])
  const status = useMemo(() => computeStatus(logs, today, defaultCycle), [logs, today, defaultCycle])

  const lastFlow = (status.kind === 'in_period' || status.kind === 'maybe_ended' ? status.period.days.at(-1)?.flow : null) ?? 2
  const quick = (flow: Flow) => {
    onSave({ ...(byDay.get(today) ?? { day: today, pain: null, symptoms: [], note: null }), day: today, flow })
  }

  // Raccourcis d'un geste, proposés en tête de la saisie d'aujourd'hui.
  const shortcuts =
    status.kind === 'in_period' && !status.loggedToday ? (
      <div className="mb-4 grid grid-cols-[2fr_1fr] gap-2.5">
        <Button onClick={() => quick(lastFlow as Flow)}>Ça continue ({FLOW_LABELS[lastFlow].toLowerCase()})</Button>
        <Button variant="outline" onClick={() => quick(0)}>
          C’est fini
        </Button>
      </div>
    ) : status.kind === 'maybe_ended' ? (
      <div className="mb-4 grid grid-cols-[2fr_1fr] gap-2.5">
        <Button onClick={() => quick(0)}>Oui, c’est fini</Button>
        <Button variant="outline" onClick={() => quick(lastFlow as Flow)}>
          Non, ça continue
        </Button>
      </div>
    ) : null

  return (
    <div className="flex flex-col gap-5">
      <StatusLine status={status} today={today} />
      <section aria-label="Calendrier">
        <Calendar today={today} logs={logs} defaultCycle={defaultCycle} names={names} onSave={onSave} onDelete={onDelete} todayExtra={shortcuts} />
      </section>
    </div>
  )
}

/** Ligne de contexte : petit éphéméride à feuilles (jour du cycle) et, à côté, où on en est. */
function StatusLine({ status, today }: { status: ReturnType<typeof computeStatus>; today: string }) {
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
  // Éphéméride : le jour du cycle (ou des règles) quand on le connaît, sinon la date du jour.
  const cycleDay = status.kind === 'in_period' ? status.dayNumber : status.kind === 'waiting' || status.kind === 'late' ? status.cycleDay : null
  return (
    <div className="sk-status" data-tone={tone}>
      <div aria-hidden className="sk-ephem">
        <div className="sk-ephem-band">{cycleDay != null ? 'Jour' : formatDM(today).replace(/^\d+\s*/, '')}</div>
        <div className="sk-ephem-num">{cycleDay ?? Number(today.slice(8))}</div>
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[1.12rem] leading-tight font-semibold tracking-tight">{title}</div>
        <div className="mt-0.5 text-[0.88rem] leading-snug text-ink-2">{sub}</div>
      </div>
    </div>
  )
}
