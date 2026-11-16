import { useMemo, useState } from 'react'
import { computeStatus, detectPeriods, diffDays, FLOW_LABELS, predict, type DayLog, type Flow } from '../../shared/cycles'
import { formatLong } from '../lib/dates'
import { Calendar } from './Calendar'
import { Icon } from './icons'
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
 * Écran « Suivi » : le calendrier d'abord. Toucher un jour (aujourd'hui ou un jour passé) ouvre
 * sa saisie ; rien n'est à remplir avant d'avoir touché. Au-dessus, une ligne de contexte (jour du
 * cycle, prochaines règles) qui ouvre la saisie d'aujourd'hui.
 */
export function Today({ today, logs, defaultCycle, names, onSave, onDelete }: Props) {
  const byDay = useMemo(() => new Map(logs.map((l) => [l.day, l])), [logs])
  const status = useMemo(() => computeStatus(logs, today, defaultCycle), [logs, today, defaultCycle])
  const [selected, setSelected] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const openDay = (day: string) => {
    setSelected(day)
    setOpen(true)
  }

  const lastFlow = (status.kind === 'in_period' || status.kind === 'maybe_ended' ? status.period.days.at(-1)?.flow : null) ?? 2
  const quick = (flow: Flow) => {
    onSave({ ...(byDay.get(today) ?? { day: today, pain: null, symptoms: [], note: null }), day: today, flow })
  }

  // Raccourcis du jour, en tête de la saisie d'aujourd'hui pendant les règles.
  const shortcuts =
    status.kind === 'in_period' && !status.loggedToday ? (
      <div className="mb-4 grid grid-cols-[2fr_1fr] gap-2.5">
        <Button className="px-2" onClick={() => quick(lastFlow as Flow)}>
          Ça continue ({FLOW_LABELS[lastFlow].toLowerCase()})
        </Button>
        <Button variant="outline" className="px-2" onClick={() => quick(0)}>
          C’est fini
        </Button>
      </div>
    ) : status.kind === 'maybe_ended' ? (
      <div className="mb-4 grid grid-cols-[2fr_1fr] gap-2.5">
        <Button className="px-2" onClick={() => quick(0)}>
          Oui, c’est fini
        </Button>
        <Button variant="outline" className="px-2" onClick={() => quick(lastFlow as Flow)}>
          Non, ça continue
        </Button>
      </div>
    ) : null

  return (
    <div className="flex flex-col gap-4">
      <StatusLine status={status} logs={logs} today={today} defaultCycle={defaultCycle} onOpen={() => openDay(today)} />

      {/* Le calendrier est l'écran : toucher un jour l'ouvre pour le renseigner ou le modifier. */}
      <section aria-label="Calendrier" className="hero card p-4 pt-4.5">
        <Calendar
          today={today}
          logs={logs}
          defaultCycle={defaultCycle}
          names={names}
          onSave={onSave}
          onDelete={onDelete}
          selected={selected}
          open={open}
          onOpen={openDay}
          onClose={() => setOpen(false)}
          todayTop={shortcuts}
        />
      </section>
      <p className="text-center text-[0.8125rem] font-medium text-ink-2">Touchez un jour pour le renseigner.</p>
    </div>
  )
}

type Tone = 'calm' | 'period' | 'soon'

/** Ligne de contexte compacte : petit anneau du cycle (jour en cours), état et prévision. */
function StatusLine({
  status,
  logs,
  today,
  defaultCycle,
  onOpen,
}: {
  status: ReturnType<typeof computeStatus>
  logs: DayLog[]
  today: string
  defaultCycle: number
  onOpen: () => void
}) {
  let title = ''
  let sub = ''
  let tone: Tone = 'calm'
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
    <button
      type="button"
      onClick={onOpen}
      aria-label={`${title}. ${sub} Renseigner aujourd’hui.`}
      className="card flex w-full items-center gap-3.5 py-3 pr-3 pl-3.5 text-left transition-transform outline-none focus-visible:outline-2 focus-visible:outline-accent active:scale-[0.985]"
    >
      <CycleRing logs={logs} today={today} defaultCycle={defaultCycle} tone={tone} />
      <span className="min-w-0 flex-1">
        <span
          className={cx(
            'block text-[1.0625rem] leading-snug font-bold tracking-[-0.02em]',
            tone === 'period' && 'text-accent',
            tone === 'soon' && 'text-on-soon',
          )}
        >
          {title}
        </span>
        <span className="mt-0.5 block text-[0.8125rem] leading-snug text-ink-2">{sub}</span>
      </span>
      <Icon name="chevron-right" className="size-4 shrink-0 text-ink-2/60" strokeWidth={2.2} />
    </button>
  )
}

const R = 23
const LEN = 2 * Math.PI * R

/** Petit anneau : part du cycle écoulée, jour du cycle au centre. */
function CycleRing({ logs, today, defaultCycle, tone }: { logs: DayLog[]; today: string; defaultCycle: number; tone: Tone }) {
  const model = useMemo(() => {
    const periods = detectPeriods(logs.filter((l) => l.day <= today))
    const last = periods.at(-1)
    if (!last) return null
    const cycleDay = diffDays(today, last.start) + 1
    return { cycleDay, part: Math.min(cycleDay / predict(periods, defaultCycle).cycleLength, 1) }
  }, [logs, today, defaultCycle])
  const color = tone === 'soon' ? 'var(--color-on-soon)' : 'var(--color-accent)'

  return (
    <span className="relative grid size-14 shrink-0 place-items-center">
      <svg aria-hidden viewBox="0 0 56 56" className="absolute inset-0 size-full -rotate-90">
        <circle cx={28} cy={28} r={R} fill="none" stroke="var(--color-ink)" strokeOpacity={0.09} strokeWidth={5} />
        {model && (
          <circle
            cx={28}
            cy={28}
            r={R}
            fill="none"
            stroke={color}
            strokeWidth={5}
            strokeLinecap="round"
            strokeDasharray={`${Math.max(model.part * LEN, 0.01)} ${LEN}`}
            style={{ filter: `drop-shadow(0 0 3px color-mix(in srgb, ${color} 55%, transparent))` }}
          />
        )}
      </svg>
      {model ? (
        <span className="text-center leading-none">
          <span className="block text-[0.5625rem] font-bold tracking-[0.08em] text-ink-2 uppercase">Jour</span>
          <span className="block text-[1.25rem] font-extrabold tracking-[-0.04em]">{model.cycleDay}</span>
        </span>
      ) : (
        <Icon name="drop" className="size-5 text-accent" />
      )}
    </span>
  )
}
