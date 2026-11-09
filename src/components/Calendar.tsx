import { useMemo, useState } from 'react'
import { addDays, detectPeriods, predict, toDate, type DayLog } from '../../supabase/functions/_shared/cycles'
import { formatLong, formatMonth } from '../lib/dates'
import { DayEditor } from './DayEditor'

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
  const byDay = useMemo(() => new Map(logs.map((l) => [l.day, l])), [logs])

  const predicted = useMemo(() => {
    const periods = detectPeriods(logs.filter((l) => l.day <= today))
    const p = predict(periods, defaultCycle)
    const set = new Set<string>()
    if (!p.nextStart) return set
    // Affiche les 3 prochains cycles prévus.
    for (let c = 0; c < 3; c++) {
      const start = addDays(p.nextStart, c * p.cycleLength)
      for (let i = 0; i < p.periodLength; i++) {
        const d = addDays(start, i)
        if (d > today) set.add(d)
      }
    }
    return set
  }, [logs, today, defaultCycle])

  const cells = useMemo(() => {
    const first = toDate(month)
    const offset = (first.getUTCDay() + 6) % 7
    const start = addDays(month, -offset)
    return Array.from({ length: 42 }, (_, i) => addDays(start, i))
  }, [month])

  const shift = (n: number) => {
    const d = toDate(month)
    d.setUTCMonth(d.getUTCMonth() + n)
    setMonth(d.toISOString().slice(0, 10))
  }

  return (
    <div className="screen">
      <div className="cal-head">
        <button className="icon" onClick={() => shift(-1)} aria-label="Mois précédent">‹</button>
        <h2>{formatMonth(month)}</h2>
        <button className="icon" onClick={() => shift(1)} aria-label="Mois suivant">›</button>
      </div>
      <div className="cal-grid">
        {WEEKDAYS.map((w, i) => (
          <div key={i} className="cal-wd">{w}</div>
        ))}
        {cells.map((d) => {
          const l = byDay.get(d)
          const out = d.slice(0, 7) !== month.slice(0, 7)
          const classes = [
            'cal-day',
            out && 'out',
            d === today && 'today',
            d === selected && 'selected',
            l?.flow != null && `flow-${l.flow}`,
            !l && predicted.has(d) && 'predicted',
            d > today && 'future',
          ]
            .filter(Boolean)
            .join(' ')
          return (
            <button key={d} className={classes} disabled={d > today} onClick={() => setSelected(d)}>
              {Number(d.slice(8))}
              {(l?.pain ?? 0) >= 2 && <span className="pain-mark" />}
            </button>
          )
        })}
      </div>
      <div className="legend">
        <span><i className="dot flow-1" /> Spotting</span>
        <span><i className="dot flow-3" /> Règles</span>
        <span><i className="dot predicted" /> Prévu</span>
        <span><i className="pain-mark inline" /> Douleur</span>
      </div>

      {selected && (
        <div className="sheet-backdrop" onClick={() => setSelected(null)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <div className="sheet-head">
              <h2>{formatLong(selected)}</h2>
              <button className="icon" onClick={() => setSelected(null)} aria-label="Fermer">✕</button>
            </div>
            <DayEditor
              key={selected}
              day={selected}
              log={byDay.get(selected)}
              onSave={onSave}
              onDelete={(d) => {
                onDelete(d)
                setSelected(null)
              }}
              authorName={byDay.get(selected)?.updated_by ? names[byDay.get(selected)!.updated_by!] : undefined}
            />
          </div>
        </div>
      )}
    </div>
  )
}
