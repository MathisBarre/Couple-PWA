import { useMemo, useState } from 'react'
import { addDays, detectPeriods, predict, toDate, type DayLog } from '../../shared/cycles'
import { formatLong, formatMonth } from '../lib/dates'
import { DayEditor } from './DayEditor'
import { Icon } from './icons'
import { cx, flowBg, flowText, IconButton, Sheet } from './ui'

interface Props {
  today: string
  logs: DayLog[]
  defaultCycle: number
  names: Record<string, string>
  onSave: (log: DayLog) => void
  onDelete: (day: string) => void
}

const WEEKDAYS = ['L', 'M', 'M', 'J', 'V', 'S', 'D']

export function Calendar({ today, logs, defaultCycle, names, onSave, onDelete }: Props) {
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
    <div className="flex flex-col gap-3.5">
      <div className="flex items-center justify-between">
        <h2 className="text-[1.375rem] leading-tight font-bold tracking-[-0.03em] first-letter:uppercase">{formatMonth(month)}</h2>
        <div className="flex gap-2">
          <IconButton onClick={() => shift(-1)} aria-label="Mois précédent">
            <Icon name="chevron-left" className="size-4.5" strokeWidth={2} />
          </IconButton>
          <IconButton onClick={() => shift(1)} aria-label="Mois suivant">
            <Icon name="chevron-right" className="size-4.5" strokeWidth={2} />
          </IconButton>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-1">
        {WEEKDAYS.map((w, i) => (
          <div key={i} className="eyebrow py-1 text-center">{w}</div>
        ))}
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
                'relative flex aspect-square items-center justify-center rounded-[0.875rem] text-[0.9375rem] font-medium transition-transform active:scale-90',
                flow ? cx(flowBg[flow], flowText[flow], 'day-flow font-semibold') : flow === 0 ? 'bg-well text-ink' : future ? 'text-ink-2/70' : 'text-ink',
                !l && predicted.has(d) && 'bg-accent-soft text-accent outline-[1.5px] -outline-offset-[1.5px] outline-flow-3 outline-dashed',
                d.slice(0, 7) !== month.slice(0, 7) && 'opacity-30',
                d === today && 'font-extrabold ring-2 ring-ink ring-inset',
                open && d === selected && 'ring-2 ring-accent ring-inset',
              )}
            >
              {Number(d.slice(8))}
              {(l?.pain ?? 0) >= 2 && <span className="absolute bottom-1.25 size-1 rounded-full bg-current" />}
            </button>
          )
        })}
      </div>

      <div className="flex flex-wrap gap-x-3.5 gap-y-1.5 border-t border-line pt-3 text-xs font-medium text-ink-2">
        <span className="inline-flex items-center gap-1.5"><i className="size-2.5 rounded-full bg-flow-1" /> Traces</span>
        <span className="inline-flex items-center gap-1.5"><i className="size-2.5 rounded-full bg-flow-3" /> Règles</span>
        <span className="inline-flex items-center gap-1.5"><i className="size-2.5 rounded-full border-[1.5px] border-dashed border-flow-3 bg-accent-soft" /> Prévu</span>
        <span className="inline-flex items-center gap-1.5"><i className="size-1.5 rounded-full bg-ink" /> Douleur</span>
      </div>

      <Sheet open={open} onClose={() => setOpen(false)} title={selected ? formatLong(selected) : ''}>
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
