import { useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { addDays, detectPeriods, predict, toDate, type DayLog } from '../../shared/cycles'
import { formatLong, formatMonth } from '../lib/dates'
import { haptic } from '../lib/haptics'
import { turnPage } from '../lib/motion'
import { DayEditor } from './DayEditor'
import { Chevron } from './icons'
import { DayInk, InkBolt, InkPredicted, InkFlow, InkToday } from './ink'
import { cx, flowText, Sheet } from './ui'

interface Props {
  today: string
  logs: DayLog[]
  defaultCycle: number
  names: Record<string, string>
  onSave: (log: DayLog) => void
  onDelete: (day: string) => void
  /** Affiché en tête de la saisie d'aujourd'hui (raccourcis « ça continue / c'est fini »). */
  todayExtra?: ReactNode
  /** Premier chargement, rien en cache : la feuille du mois est là, mais on ne sait pas encore ce qui y est noté. */
  loading?: boolean
}

const WEEKDAYS = ['L', 'M', 'M', 'J', 'V', 'S', 'D']

export function Calendar({ today, logs, defaultCycle, names, onSave, onDelete, todayExtra, loading }: Props) {
  const [month, setMonth] = useState(today.slice(0, 7) + '-01')
  const [selected, setSelected] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  // Jour dont le coloriage vient d'être posé : il se trace sous les yeux (et une fois la saisie refermée).
  const [drawn, setDrawn] = useState<{ day: string; n: number } | null>(null)
  // Page qu'on vient de quitter : elle reste le temps de tourner.
  const [flip, setFlip] = useState<{ from: string; dir: 1 | -1; id: number } | null>(null)
  const flipId = useRef(0)
  const pageRef = useRef<HTMLDivElement>(null)
  const ghostRef = useRef<HTMLDivElement>(null)
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

  const shift = (n: 1 | -1) => {
    const d = toDate(month)
    d.setUTCMonth(d.getUTCMonth() + n)
    haptic()
    // L'état change tout de suite ; un nouvel appui pendant que la page tourne la remplace.
    setFlip({ from: month, dir: n, id: ++flipId.current })
    setMonth(d.toISOString().slice(0, 10))
  }

  useLayoutEffect(() => {
    if (!flip || !pageRef.current || !ghostRef.current) return
    const id = flip.id
    return turnPage(pageRef.current, ghostRef.current, flip.dir, () => setFlip((f) => (f?.id === id ? null : f)))
  }, [flip])

  const sel = selected ? byDay.get(selected) : undefined
  const page = (m: string, ghost: boolean) => (
    <MonthPage
      month={m}
      today={today}
      byDay={byDay}
      predicted={predicted}
      picked={open && !ghost ? selected : null}
      drawn={ghost ? null : drawn}
      still={ghost || loading}
      onPick={(d) => {
        setSelected(d)
        setOpen(true)
      }}
    />
  )

  return (
    <div className="flex flex-col gap-5">
      <div className="sk-block" aria-busy={loading || undefined}>
        <div className="sk-pages">
          {flip && (
            <div key={flip.id} ref={ghostRef} aria-hidden inert className="sk-page sk-page-ghost" data-dir={flip.dir}>
              {page(flip.from, true)}
              <div data-shade className="sk-page-shade" />
            </div>
          )}
          <div ref={pageRef} className="sk-page">
            {page(month, false)}
            <div data-shade className="sk-page-shade" />
          </div>
        </div>
        <div className="absolute top-[26px] right-4 z-[4] flex gap-2">
          <button type="button" className="sk-round" onClick={() => shift(-1)} aria-label="Mois précédent">
            <Chevron dir="left" />
          </button>
          <button type="button" className="sk-round" onClick={() => shift(1)} aria-label="Mois suivant">
            <Chevron />
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 px-1 text-xs text-ink-2">
        <Legend label="Traces">
          <InkFlow day="legende-1" level={1} />
        </Legend>
        <Legend label="Règles">
          <InkFlow day="legende-3" level={3} />
        </Legend>
        <Legend label="Prévu">
          <InkPredicted day="legende-p" />
        </Legend>
        <Legend label="Douleur">
          <g transform="translate(22 22) scale(1.7) translate(-39.2 -5.7)">
            <InkBolt />
          </g>
        </Legend>
      </div>

      <Sheet
        open={open}
        onClose={() => {
          setOpen(false)
          // La feuille de saisie cachait le calendrier : on retrace ce qui vient d'y être noté.
          setDrawn((d) => (d && d.day === selected ? { day: d.day, n: d.n + 1 } : d))
        }}
        title={selected ? formatLong(selected) : ''}
      >
        {selected === today && todayExtra}
        {selected && (
          <DayEditor
            key={selected}
            day={selected}
            log={sel}
            onSave={(log) => {
              if (log.flow !== sel?.flow || (log.pain ?? 0) >= 2 !== (sel?.pain ?? 0) >= 2) setDrawn((d) => ({ day: log.day, n: (d?.n ?? 0) + 1 }))
              onSave(log)
            }}
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

function Legend({ label, children }: { label: string; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1">
      <svg aria-hidden viewBox="4 4 36 36" className="sk-ink-legend">
        {children}
      </svg>
      {label}
    </span>
  )
}

/** La feuille d'un mois : son nom, les jours de la semaine, six semaines de cases. */
function MonthPage({
  month,
  today,
  byDay,
  predicted,
  picked,
  drawn,
  still,
  onPick,
}: {
  month: string
  today: string
  byDay: Map<string, DayLog>
  predicted: Set<string>
  picked: string | null
  drawn: { day: string; n: number } | null
  /** Feuille qui s'en va (ou en attente des données) : rien ne s'y trace. */
  still?: boolean
  onPick: (day: string) => void
}) {
  const cells = useMemo(() => {
    const offset = (toDate(month).getUTCDay() + 6) % 7
    return Array.from({ length: 42 }, (_, i) => addDays(month, i - offset))
  }, [month])

  return (
    <>
      <div className="sk-cal-head">
        <h2 className="first-letter:uppercase">{formatMonth(month)}</h2>
      </div>
      <div className="sk-cal-grid">
        {WEEKDAYS.map((w, i) => (
          <div key={i} className="sk-cal-week">
            {w}
          </div>
        ))}
      </div>
      <div className="sk-cal-grid">
        {cells.map((d) => {
          const l = byDay.get(d)
          const flow = l?.flow
          const pain = (l?.pain ?? 0) >= 2
          const tracing = !still && drawn?.day === d
          return (
            <button
              key={d}
              disabled={d > today}
              onClick={() => onPick(d)}
              className={cx(
                'sk-day',
                flow != null && flow > 0 && flowText[flow],
                d.slice(0, 7) !== month.slice(0, 7) && 'opacity-35',
                d === today && 'sk-day-today',
                d === picked && 'sk-day-picked',
              )}
            >
              {/* Tout ce qui est noté sur la case : rectangle de couleur (flux), petit
                  trait (« rien »), pointillés (prévu), éclair (douleur), cercle d'encre (aujourd'hui). */}
              <DayInk key={tracing ? drawn.n : 0} tracing={tracing}>
                {flow != null && <InkFlow day={d} level={flow} />}
                {!l && predicted.has(d) && <InkPredicted day={d} />}
                {pain && <InkBolt />}
                {d === today && <InkToday still={still} />}
              </DayInk>
              <span className="relative">{Number(d.slice(8))}</span>
            </button>
          )
        })}
      </div>
    </>
  )
}
