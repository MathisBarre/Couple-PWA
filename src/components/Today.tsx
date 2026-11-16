import { useMemo, type ReactNode } from 'react'
import { addDays, computeStatus, detectPeriods, diffDays, FLOW_LABELS, predict, type DayLog, type Flow } from '../../shared/cycles'
import { formatDM, formatLong } from '../lib/dates'
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
    <div className="flex flex-col gap-4">
      <StatusCard status={status} logs={logs} today={today} defaultCycle={defaultCycle}>
        {status.kind === 'in_period' && !status.loggedToday && (
          <div className="grid grid-cols-[2fr_1fr] gap-2.5">
            <Button className="px-2" onClick={() => quick(lastFlow as Flow)}>Ça continue ({FLOW_LABELS[lastFlow].toLowerCase()})</Button>
            <Button variant="outline" className="px-2" onClick={() => quick(0)}>
              C’est fini
            </Button>
          </div>
        )}
        {status.kind === 'maybe_ended' && (
          <div className="grid grid-cols-[2fr_1fr] gap-2.5">
            <Button className="px-2" onClick={() => quick(0)}>
              Oui, c’est fini
            </Button>
            <Button variant="outline" className="px-2" onClick={() => quick(lastFlow as Flow)}>
              Non, ça continue
            </Button>
          </div>
        )}
      </StatusCard>

      <h2 className="mt-3 text-[1.375rem] leading-tight font-bold tracking-[-0.03em]">Aujourd’hui</h2>
      <DayEditor
        day={today}
        log={log}
        onSave={onSave}
        onDelete={onDelete}
        authorName={log?.updated_by ? names[log.updated_by] : undefined}
      />

      {/* Calendrier juste en dessous : toucher un jour passé l'ouvre pour le modifier. */}
      <section aria-label="Calendrier" className="card mt-4 p-4 pt-3.5">
        <Calendar today={today} logs={logs} defaultCycle={defaultCycle} names={names} onSave={onSave} onDelete={onDelete} />
      </section>
    </div>
  )
}

type Tone = 'calm' | 'period' | 'soon'

function StatusCard({
  status,
  logs,
  today,
  defaultCycle,
  children,
}: {
  status: ReturnType<typeof computeStatus>
  logs: DayLog[]
  today: string
  defaultCycle: number
  children?: ReactNode
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
    <div className={cx('hero card relative overflow-hidden px-4 pt-3 pb-5', tone === 'soon' && 'hero-soon')}>
      <CycleArc logs={logs} today={today} defaultCycle={defaultCycle} tone={tone} />
      <div className="relative mt-2.5 text-center">
        <div
          className={cx(
            'text-[1.375rem] leading-tight font-bold tracking-[-0.03em] text-balance',
            tone === 'period' && 'text-accent',
            tone === 'soon' && 'text-on-soon',
          )}
        >
          {title}
        </div>
        <div className="mx-auto mt-1.5 max-w-[19rem] text-[0.9375rem] leading-snug text-pretty text-ink-2">{sub}</div>
      </div>
      {children && <div className="relative mt-4">{children}</div>}
    </div>
  )
}

// Géométrie de l'arc : ouvert en bas, 260° de balayage, une case par jour du cycle.
const CX = 140
const CY = 130
const R = 108
const START = 140
const SWEEP = 260
const point = (deg: number, r = R) => {
  const a = (deg * Math.PI) / 180
  return [CX + r * Math.cos(a), CY + r * Math.sin(a)] as const
}
const arc = (from: number, to: number) => {
  const [x1, y1] = point(from)
  const [x2, y2] = point(to)
  return `M${x1.toFixed(2)} ${y1.toFixed(2)}A${R} ${R} 0 ${to - from > 180 ? 1 : 0} 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`
}
const FLOW_STROKE = ['', 'var(--color-flow-1)', 'var(--color-flow-2)', 'var(--color-flow-3)', 'var(--color-flow-4)', 'var(--color-flow-5)']

/**
 * Le cycle en cours, dessiné : un arc d'une case par jour, du premier jour des règles (à gauche)
 * aux prochaines règles prévues (à droite). Les jours de saignement prennent la couleur de leur
 * flux, les jours écoulés une teinte d'accent, aujourd'hui est le repère lumineux. Au centre, le
 * jour du cycle en grand.
 */
function CycleArc({ logs, today, defaultCycle, tone }: { logs: DayLog[]; today: string; defaultCycle: number; tone: Tone }) {
  const model = useMemo(() => {
    const past = logs.filter((l) => l.day <= today)
    const periods = detectPeriods(past)
    const last = periods.at(-1)
    if (!last) return null
    const { cycleLength, nextStart } = predict(periods, defaultCycle)
    const cycleDay = diffDays(today, last.start) + 1
    // Un retard allonge l'arc ; au-delà de 60 cases elles ne seraient plus lisibles.
    const total = Math.min(Math.max(cycleLength, cycleDay), 60)
    const byDay = new Map(past.map((l) => [l.day, l]))
    const days = Array.from({ length: total }, (_, i) => ({
      flow: byDay.get(addDays(last.start, i))?.flow ?? 0,
      late: i >= cycleLength,
    }))
    return { start: last.start, nextStart, cycleDay, total, days, at: Math.min(cycleDay, total) - 1 }
  }, [logs, today, defaultCycle])

  const total = model?.total ?? defaultCycle
  const step = SWEEP / total
  const gap = Math.min(2.4, step * 0.28)
  const seg = (i: number) => arc(START + i * step + gap / 2, START + (i + 1) * step - gap / 2)
  const knob = model ? point(START + (model.at + 0.5) * step) : null
  const [lx, ly] = point(START, R)
  const [rx] = point(START + SWEEP, R)

  return (
    <div className="relative mx-auto aspect-[280/228] w-full max-w-[19.5rem]">
      <svg viewBox="0 0 280 228" className="absolute inset-0 size-full" role="img" aria-label={model ? `Jour ${model.cycleDay} du cycle` : 'Cycle'}>
        <defs>
          <filter id="knob-glow" x="-150%" y="-150%" width="400%" height="400%">
            <feGaussianBlur stdDeviation="5" />
          </filter>
        </defs>
        <g fill="none" strokeWidth={10}>
          {Array.from({ length: total }, (_, i) => {
            const d = model?.days[i]
            const elapsed = model != null && i <= model.at
            const stroke = d?.flow ? FLOW_STROKE[d.flow] : d?.late && elapsed ? 'var(--color-on-soon)' : elapsed ? 'var(--color-accent)' : 'var(--color-ink)'
            const opacity = d?.flow ? 1 : d?.late && elapsed ? 0.55 : elapsed ? 0.3 : 0.09
            return <path key={i} d={seg(i)} stroke={stroke} strokeOpacity={opacity} />
          })}
        </g>
        {knob && (
          <>
            <circle cx={knob[0]} cy={knob[1]} r={11} fill={tone === 'soon' ? 'var(--color-on-soon)' : 'var(--color-accent)'} opacity={0.55} filter="url(#knob-glow)" />
            <circle cx={knob[0]} cy={knob[1]} r={9.5} fill="#fff" stroke={tone === 'soon' ? 'var(--color-on-soon)' : 'var(--color-accent)'} strokeWidth={4} />
          </>
        )}
        {model && (
          <g className="fill-ink-2 text-[11px] font-semibold" textAnchor="middle">
            <text x={lx + 2} y={ly + 23}>
              {formatDM(model.start)}
            </text>
            {model.nextStart && (
              <text x={rx - 2} y={ly + 23}>
                ~{formatDM(model.nextStart)}
              </text>
            )}
          </g>
        )}
      </svg>
      <div className="absolute inset-x-0 top-[30%] flex flex-col items-center">
        {model ? (
          <>
            <span className="eyebrow">Jour</span>
            <span className="-my-1 text-[5.25rem] leading-none font-extrabold tracking-[-0.06em]">{model.cycleDay}</span>
            <span className="text-sm font-medium text-ink-2">du cycle</span>
          </>
        ) : (
          <img src="/logo.svg" alt="" className="mt-4 size-20" />
        )}
      </div>
    </div>
  )
}
