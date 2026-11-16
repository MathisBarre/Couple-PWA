import { useState } from 'react'
import { FLOW_LABELS, PAIN_LABELS, type DayLog, type Flow } from '../../shared/cycles'
import { SYMPTOMS } from '../lib/symptoms'
import { Icon } from './icons'
import { Button, cx, inputClass, MultiChoice, SectionTitle, SingleChoice } from './ui'

interface Props {
  day: string
  log: DayLog | undefined
  onSave: (log: DayLog) => void
  onDelete: (day: string) => void
  authorName?: string
}

const flowPressed = [
  'data-pressed:bg-well data-pressed:bg-none data-pressed:shadow-[inset_0_0_0_2px_var(--color-ink)]',
  'data-pressed:bg-flow-1',
  'data-pressed:bg-flow-2',
  'data-pressed:bg-flow-3 data-pressed:text-on-flow',
  'data-pressed:bg-flow-4 data-pressed:text-on-flow',
  'data-pressed:bg-flow-5 data-pressed:text-on-flow',
]

/** Saisie d'une journée : chaque appui enregistre immédiatement. Monter avec key={day}. */
export function DayEditor({ day, log, onSave, onDelete, authorName }: Props) {
  const [showMore, setShowMore] = useState(Boolean(log?.symptoms?.length || log?.note))
  const [note, setNote] = useState(log?.note ?? '')

  const base: DayLog = log ?? { day, flow: null, pain: null, symptoms: [], note: null }
  const update = (patch: Partial<DayLog>) => onSave({ ...base, ...patch, day })

  return (
    <div className="flex flex-col gap-4">
      <section>
        <SectionTitle>Flux</SectionTitle>
        <SingleChoice<Flow>
          label="Flux"
          value={base.flow}
          onChange={(flow) => update({ flow })}
          className="grid grid-cols-3 gap-2.5"
          itemClassName="raised flow-tile flex min-h-[5.25rem] flex-col items-center justify-center gap-1 rounded-[1.125rem] px-1.5 py-2.5 text-[0.875rem] leading-tight font-semibold transition-[box-shadow,background-color,transform] duration-150 active:scale-[0.97] data-pressed:font-bold"
          options={FLOW_LABELS.map((label, i) => ({
            value: i as Flow,
            className: flowPressed[i],
            label: (
              <>
                <FlowGlyph level={i} />
                <span>
                  {label}
                  {i === 1 && <span className="block text-[0.6875rem] font-medium opacity-70">quelques gouttes</span>}
                </span>
              </>
            ),
          }))}
        />
      </section>

      <section>
        <SectionTitle>Douleur</SectionTitle>
        <SingleChoice<number>
          label="Douleur"
          value={base.pain}
          onChange={(pain) => update({ pain })}
          className="well grid grid-cols-4 gap-1 rounded-[0.9375rem] p-1"
          itemClassName="pain-item min-h-10 rounded-[0.6875rem] px-1 py-2 text-sm font-medium text-ink-2 transition-colors data-pressed:font-bold data-pressed:text-on-accent"
          options={PAIN_LABELS.map((label, i) => ({ value: i, label }))}
        />
      </section>

      {showMore ? (
        <>
          <section>
            <SectionTitle>Symptômes</SectionTitle>
            <MultiChoice label="Symptômes" options={SYMPTOMS} value={base.symptoms ?? []} onChange={(symptoms) => update({ symptoms })} />
          </section>
          <section>
            <SectionTitle>Note</SectionTitle>
            <textarea
              className={cx(inputClass, 'resize-y')}
              value={note}
              placeholder="Ex. caillots, médicament pris…"
              rows={2}
              onChange={(e) => setNote(e.target.value)}
              onBlur={() => note !== (base.note ?? '') && update({ note: note || null })}
            />
          </section>
        </>
      ) : (
        <Button variant="link" onClick={() => setShowMore(true)}>
          + Symptômes et note
        </Button>
      )}

      {log && (
        <div className="flex items-center justify-between text-sm text-ink-2">
          <span className="inline-flex items-center gap-1.5">
            {authorName ? `Noté par ${authorName}` : 'Enregistré'}
            <Icon name="check" className="size-4 text-accent" strokeWidth={2.2} />
          </span>
          <Button variant="ghost" onClick={() => confirm('Effacer cette journée ?') && onDelete(day)}>
            Effacer
          </Button>
        </div>
      )}
    </div>
  )
}

const DROP = 'M12 2.6c3.4 4 6.6 7.5 6.6 11.4a6.6 6.6 0 0 1-13.2 0c0-3.9 3.2-7.4 6.6-11.4Z'
/** Part de la goutte remplie pour chaque niveau de flux (0 = vide, 5 = pleine). */
const DROP_FILL = [0, 0.16, 0.36, 0.56, 0.78, 1]

/** Goutte qui se remplit avec l'intensité du flux. */
function FlowGlyph({ level }: { level: number }) {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className="size-6 text-flow-4 in-data-pressed:text-current">
      {level > 0 && (
        <path d={DROP} fill="currentColor" style={{ clipPath: `inset(${Math.round((1 - DROP_FILL[level]) * 100)}% 0 0 0)`, transformBox: 'fill-box' }} />
      )}
      <path
        d={DROP}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.6}
        strokeLinejoin="round"
        strokeDasharray={level === 0 ? '2.2 2.6' : undefined}
        strokeLinecap="round"
        opacity={level === 0 ? 0.55 : 1}
      />
    </svg>
  )
}
