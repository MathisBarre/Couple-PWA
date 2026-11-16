import { useMemo, useState, type ReactNode } from 'react'
import { addDays, detectPeriods, predict, toDate, type DayLog } from '../../shared/cycles'
import { formatLong, formatMonth } from '../lib/dates'
import { DayEditor } from './DayEditor'
import { Chevron } from './icons'
import { cx, flowBg, flowText, Sheet } from './ui'

interface Props {
  today: string
  logs: DayLog[]
  defaultCycle: number
  names: Record<string, string>
  onSave: (log: DayLog) => void
  onDelete: (day: string) => void
  /** Affiché en tête de la saisie d'aujourd'hui (raccourcis « ça continue / c'est fini »). */
  todayExtra?: ReactNode
}

const WEEKDAYS = ['L', 'M', 'M', 'J', 'V', 'S', 'D']

export function Calendar({ today, logs, defaultCycle, names, onSave, onDelete, todayExtra }: Props) {
  const [month, setMonth] = useState(today.slice(0, 7) + '-01')
  const [selected, setSelected] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const byDay = useMemo(() => new Map(logs.map((l) => [l.day, l])), [logs])

  const predicted = useMemo(() => {
    const p = predict(detectPeriods(logs.filter((l) => l.day <= today)), defaultCycle)
    const set = new Set<string>()
    if (!p.nextStart) return set
    // Affiche les 3 prochains cycles prévus.
    for (let c = 0; c < 3; c++)
      for (let i = 0; i < p.periodLength; i++) {
        const d = addDays(p.nextStart, c * p.cycleLength + i)
        if (d > today) set.add(d)
      }
    return set
  }, [logs, today, defaultCycle])

  const cells = useMemo(() => {
    const offset = (toDate(month).getUTCDay() + 6) % 7
    return Array.from({ length: 42 }, (_, i) => addDays(month, i - offset))
  }, [month])

  const shift = (n: number) => {
    const d = toDate(month)
    d.setUTCMonth(d.getUTCMonth() + n)
    setMonth(d.toISOString().slice(0, 10))
  }

  const sel = selected ? byDay.get(selected) : undefined

  return (
    <div className="flex flex-col gap-5">
      <div className="sk-block pb-3">
        <div className="sk-cal-head">
          <h2 className="first-letter:uppercase">{formatMonth(month)}</h2>
          <div className="flex gap-2">
            <button type="button" className="sk-round" onClick={() => shift(-1)} aria-label="Mois précédent">
              <Chevron dir="left" />
            </button>
            <button type="button" className="sk-round" onClick={() => shift(1)} aria-label="Mois suivant">
              <Chevron />
            </button>
          </div>
        </div>

        <div className="sk-cal-grid">
          {WEEKDAYS.map((w, i) => (
            <div key={i} className="sk-cal-week">{w}</div>
          ))}
        </div>
        <div className="sk-cal-grid">
          {cells.map((d) => {
            const l = byDay.get(d)
            const flow = l?.flow
            const future = d > today
            return (
              <button
                key={d}
                disabled={future}
                onClick={() => {
                  setSelected(d)
                  setOpen(true)
                }}
                className={cx(
                  'sk-day',
                  flow != null && flow > 0 && flowText[flow],
                  d.slice(0, 7) !== month.slice(0, 7) && 'opacity-35',
                  d === today && 'sk-day-today',
                  open && d === selected && 'ring-2 ring-accent ring-inset',
                )}
              >
                {/* Jour noté : gommette (du rose pâle au bordeaux) ; « rien » : simple empreinte. */}
                {flow != null && <i aria-hidden className={cx('sk-mark', flowBg[flow])} />}
                {!l && predicted.has(d) && <i aria-hidden className="sk-predict" />}
                {d === today && (
                  <svg aria-hidden viewBox="0 0 50 46" preserveAspectRatio="none" className="sk-today-ring" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round">
                    <path d="M30 5.5C17 2 5.5 9 4.5 22 3.5 35 13 43 26 42.5 39 42 47 33 46 21 45 9.5 36 3.5 22 4.5" vectorEffect="non-scaling-stroke" />
                  </svg>
                )}
                <span className="relative">{Number(d.slice(8))}</span>
                {(l?.pain ?? 0) >= 2 && <span className="absolute bottom-[9%] size-[5px] rounded-full bg-current" />}
              </button>
            )
          })}
        </div>
      </div>

      <div className="flex flex-wrap justify-center gap-x-4 gap-y-1.5 px-1 text-xs text-ink-2">
        <span className="inline-flex items-center gap-1.5"><i className="sk-legend-mark bg-flow-1" /> Traces</span>
        <span className="inline-flex items-center gap-1.5"><i className="sk-legend-mark bg-flow-3" /> Règles</span>
        <span className="inline-flex items-center gap-1.5"><i className="sk-legend-mark border-[1.5px] border-dashed border-flow-3" /> Prévu</span>
        <span className="inline-flex items-center gap-1.5"><i className="size-1.5 rounded-full bg-ink" /> Douleur</span>
      </div>

      <Sheet open={open} onClose={() => setOpen(false)} title={selected ? formatLong(selected) : ''}>
        {selected === today && todayExtra}
        {selected && (
          <DayEditor
            key={selected}
            day={selected}
            log={sel}
            onSave={onSave}
            onDelete={(d) => {
              onDelete(d)
              setOpen(false)
            }}
            authorName={sel?.updated_by ? names[sel.updated_by] : undefined}
          />
        )}
      </Sheet>
    </div>
  )
}
