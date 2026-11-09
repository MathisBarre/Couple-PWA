import { useState } from 'react'
import { FLOW_LABELS, PAIN_LABELS, type DayLog, type Flow } from '../../shared/cycles'
import { SYMPTOMS } from '../lib/symptoms'
import { Button, cx, inputClass, MultiChoice, SectionTitle, SingleChoice } from './ui'

interface Props {
  day: string
  log: DayLog | undefined
  onSave: (log: DayLog) => void
  onDelete: (day: string) => void
  authorName?: string
}

const flowPressed = [
  'data-pressed:bg-surface-2 data-pressed:ring-2 data-pressed:ring-ink-2',
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
          className="grid grid-cols-3 gap-2"
          itemClassName="flex min-h-16 flex-col items-center justify-center gap-0.5 rounded-2xl border border-line bg-surface px-1.5 py-3 text-[0.9rem] font-medium data-pressed:border-transparent data-pressed:font-bold"
          options={FLOW_LABELS.map((label, i) => ({
            value: i as Flow,
            className: flowPressed[i],
            label: (
              <>
                <span aria-hidden className="text-xs tracking-wide text-flow-3 in-data-pressed:text-current">
                  {i === 0 ? '—' : i === 1 ? '·' : '●'.repeat(i - 1)}
                </span>
                {label}
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
          className="grid grid-cols-4 gap-1 rounded-2xl border border-line bg-surface p-1"
          itemClassName="rounded-xl px-1 py-2.5 text-sm data-pressed:bg-accent data-pressed:font-semibold data-pressed:text-on-accent"
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
          <span>{authorName ? `Noté par ${authorName}` : 'Enregistré'} ✓</span>
          <Button variant="ghost" onClick={() => confirm('Effacer cette journée ?') && onDelete(day)}>
            Effacer
          </Button>
        </div>
      )}
    </div>
  )
}
