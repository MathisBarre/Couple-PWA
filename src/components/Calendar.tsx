import { useMemo, useState, type ReactNode } from 'react'
import { addDays, detectPeriods, predict, toDate, type DayLog } from '../../shared/cycles'
import { formatLong, formatMonth } from '../lib/dates'
import { DayEditor } from './DayEditor'
import { Icon } from './icons'
import { cx, IconButton, Sheet } from './ui'

interface Props {
  today: string
  logs: DayLog[]
  defaultCycle: number
  names: Record<string, string>
  onSave: (log: DayLog) => void
  onDelete: (day: string) => void
  /** Proposé en tête de la saisie d'aujourd'hui (ex. « Ça continue » pendant les règles). */
  todayActions?: ReactNode
}

const WEEKDAYS = ['L', 'M', 'M', 'J', 'V', 'S', 'D']
/** Diamètre (px) de la pastille d'encre selon le flux : du point (traces) au gros rond (très abondant). */
const DOT = [0, 6, 11, 16, 21, 27]

/**
 * Le mois comme une page d'almanach : une grille à filets, le quantième en haut de chaque case,
 * et dessous une pastille d'encre dont la taille suit le flux. Les jours prévus sont tramés
 * (hachures), une douleur marquée d'un petit carré noir. Aujourd'hui est la seule case en
 * réserve (encre pleine, chiffre en papier) : c'est elle qu'on touche pour noter la journée.
 */
export function Calendar({ today, logs, defaultCycle, names, onSave, onDelete, todayActions }: Props) {
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
    <div className="flex flex-col">
      <div className="flex items-center justify-between border-t-2 border-ink pt-1">
        <h2 className="text-[2.1rem] leading-tight font-normal tracking-[-0.02em] first-letter:uppercase">{formatMonth(month)}</h2>
        <div className="-mr-2.5 flex">
          <IconButton onClick={() => shift(-1)} aria-label="Mois précédent">
            <Icon name="prev" />
          </IconButton>
          <IconButton onClick={() => shift(1)} aria-label="Mois suivant">
            <Icon name="next" />
          </IconButton>
        </div>
      </div>

      <div className="mt-1 grid grid-cols-7 border-l border-ink">
        {WEEKDAYS.map((w, i) => (
          <div key={i} className="etiquette border-y border-r border-ink py-1.5 text-center">
            {w}
          </div>
        ))}
        {cells.map((d) => {
          const l = byDay.get(d)
          const flow = l?.flow
          const future = d > today
          const outside = d.slice(0, 7) !== month.slice(0, 7)
          const isToday = d === today
          return (
            <button
              key={d}
              disabled={future}
              aria-current={isToday ? 'date' : undefined}
              aria-label={isToday ? `Aujourd’hui, ${formatLong(d)}` : formatLong(d)}
              onClick={() => {
                setSelected(d)
                setOpen(true)
              }}
              className={cx(
                'relative flex h-[3.7rem] flex-col items-center border-r border-b border-ink text-[1.05rem] outline-none',
                isToday ? 'bg-ink text-bg active:opacity-80' : 'focus-visible:bg-surface-2 active:bg-surface-2',
                future && 'text-ink-2',
                open && d === selected && !isToday && 'bg-surface-2',
              )}
            >
              <span className={cx('flex w-full items-start justify-between pt-0.5 pl-1', outside && 'opacity-35')}>
                <span className={cx('min-w-5 px-0.5 text-left leading-6', isToday && 'font-semibold')}>{Number(d.slice(8))}</span>
                {/* Douleur modérée ou forte : un petit carré d'encre noire dans le coin. */}
                {(l?.pain ?? 0) >= 2 && <span className={cx('mt-1.5 mr-1.5 size-1.5', isToday ? 'bg-bg' : 'bg-ink')} />}
              </span>
              <span className={cx('grid flex-1 place-items-center pb-0.5 text-accent', outside && 'opacity-35')}>
                {flow ? (
                  <span className="rounded-full bg-current" style={{ width: DOT[flow], height: DOT[flow] }} />
                ) : flow === 0 ? (
                  <span className={cx('h-px w-3', isToday ? 'bg-bg' : 'bg-ink-2')} />
                ) : (
                  predicted.has(d) && <span className="trame size-4.5 rounded-full border border-current" />
                )}
              </span>
            </button>
          )
        })}
      </div>

      <div className="etiquette mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-ink-2">
        <span className="inline-flex items-center gap-1.5 text-accent">
          <i className="size-1.5 rounded-full bg-current" /> <span className="text-ink-2">Traces</span>
        </span>
        <span className="inline-flex items-center gap-1.5 text-accent">
          <i className="size-3 rounded-full bg-current" /> <span className="text-ink-2">Règles</span>
        </span>
        <span className="inline-flex items-center gap-1.5 text-accent">
          <i className="trame size-3 rounded-full border border-current" /> <span className="text-ink-2">Prévu</span>
        </span>
        <span className="inline-flex items-center gap-1.5">
          <i className="size-1.5 bg-ink" /> Douleur
        </span>
      </div>

      <Sheet open={open} onClose={() => setOpen(false)} title={selected ? (selected === today ? 'Aujourd’hui' : formatLong(selected)) : ''}>
        {selected === today && todayActions && <div className="mb-5">{todayActions}</div>}
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
