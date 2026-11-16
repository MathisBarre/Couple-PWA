import { useMemo } from 'react'
import { computeStatus, detectPeriods, diffDays, FLOW_LABELS, predict, type DayLog, type Flow } from '../../shared/cycles'
import { formatLong } from '../lib/dates'
import { Calendar } from './Calendar'
import { CycleDial } from './CycleDial'
import { Button, cx } from './ui'

interface Props {
  today: string
  logs: DayLog[]
  defaultCycle: number
  names: Record<string, string>
  onSave: (log: DayLog) => void
  onDelete: (day: string) => void
}

/**
 * Suivi : l'écran s'ouvre sur le calendrier, la page d'almanach du mois, avec le jour d'aujourd'hui
 * nettement marqué. Rien à saisir avant de toucher : un appui sur un jour (aujourd'hui ou un jour
 * passé) ouvre sa saisie. Au-dessus, une simple ligne de contexte (où en est le cycle).
 */
export function Today({ today, logs, defaultCycle, names, onSave, onDelete }: Props) {
  const byDay = useMemo(() => new Map(logs.map((l) => [l.day, l])), [logs])
  const status = useMemo(() => computeStatus(logs, today, defaultCycle), [logs, today, defaultCycle])
  // Cycle en cours, pour le cadran : son premier jour, sa durée attendue, ses jours notés.
  const dial = useMemo(() => {
    const periods = detectPeriods(logs.filter((l) => l.day <= today))
    const last = periods.at(-1)
    const cycleLength = predict(periods, defaultCycle).cycleLength
    if (!last) return { cycleDay: null, cycleLength, days: [] }
    return {
      cycleDay: diffDays(today, last.start) + 1,
      cycleLength,
      days: logs.filter((l) => l.day >= last.start && l.day <= today).map((l) => ({ n: diffDays(l.day, last.start) + 1, flow: l.flow })),
    }
  }, [logs, today, defaultCycle])

  const lastFlow = (status.kind === 'in_period' || status.kind === 'maybe_ended' ? status.period.days.at(-1)?.flow : null) ?? 2
  const quick = (flow: Flow) => {
    onSave({ ...(byDay.get(today) ?? { day: today, pain: null, symptoms: [], note: null }), day: today, flow })
  }

  // Réponses en un geste pendant les règles : proposées en tête de la saisie d'aujourd'hui.
  const todayActions =
    status.kind === 'in_period' && !status.loggedToday ? (
      <div className="grid grid-cols-[2fr_1fr] gap-2.5">
        <Button onClick={() => quick(lastFlow as Flow)}>Ça continue ({FLOW_LABELS[lastFlow].toLowerCase()})</Button>
        <Button variant="outline" onClick={() => quick(0)}>
          C’est fini
        </Button>
      </div>
    ) : status.kind === 'maybe_ended' ? (
      <div className="grid grid-cols-[2fr_1fr] gap-2.5">
        <Button onClick={() => quick(0)}>Oui, c’est fini</Button>
        <Button variant="outline" onClick={() => quick(lastFlow as Flow)}>
          Non, ça continue
        </Button>
      </div>
    ) : null

  return (
    <div className="flex flex-col">
      <StatusLine status={status} today={today} dial={dial} />
      {/* Toucher un jour (aujourd'hui ou passé) l'ouvre pour le noter ou le modifier. */}
      <section aria-label="Calendrier">
        <Calendar today={today} logs={logs} defaultCycle={defaultCycle} names={names} onSave={onSave} onDelete={onDelete} todayActions={todayActions} />
      </section>
    </div>
  )
}

/**
 * Ligne de contexte, comme le bandeau d'une page d'almanach : la date et le jour du cycle en
 * étiquette, puis où en est le cycle en une phrase, avec le petit cadran en regard.
 * Pendant les règles, le bandeau passe en aplat d'encre de couleur.
 */
function StatusLine({
  status,
  today,
  dial,
}: {
  status: ReturnType<typeof computeStatus>
  today: string
  dial: { cycleDay: number | null; cycleLength: number; days: { n: number; flow: Flow | null }[] }
}) {
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
  const aplat = tone === 'period'
  return (
    <div className={cx('-mx-4 px-4', aplat && 'bg-accent text-on-accent [--dial-dot:currentColor]')}>
      <div className={cx('etiquette flex items-center justify-between border-b py-2', aplat ? 'border-current' : 'border-line text-ink-2')}>
        <span>{formatLong(today)}</span>
        {dial.cycleDay != null && (
          <span>
            Jour {dial.cycleDay} / {Math.max(dial.cycleLength, dial.cycleDay)}
          </span>
        )}
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)_5.25rem] items-center gap-3 py-3">
        <div className="min-w-0">
          <div className={cx('text-[1.45rem] leading-[1.12] font-medium tracking-[-0.01em] text-balance', tone === 'soon' && 'text-accent')}>{title}</div>
          <div className={cx('mt-1 text-[0.95rem] leading-snug text-balance italic', aplat ? 'opacity-90' : 'text-ink-2')}>{sub}</div>
        </div>
        <CycleDial {...dial} compact className="size-21" />
      </div>
    </div>
  )
}
