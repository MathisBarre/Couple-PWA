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

// « Rien » se coche à l'encre noire ; un flux, en aplat de l'encre de couleur.
const flowPressed = (i: number) => (i === 0 ? 'data-pressed:bg-ink data-pressed:text-bg' : 'data-pressed:bg-accent data-pressed:text-on-accent')
/** Diamètre (px) de la pastille d'encre de chaque niveau de flux : la même échelle que le calendrier. */
const FLOW_DOT = [0, 5, 9, 13, 17, 22]

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
          className="grid grid-cols-3 border-t border-l border-ink"
          itemClassName="flex min-h-[4.75rem] flex-col items-center justify-center gap-1 border-r border-b border-ink px-1.5 py-2.5 text-[0.98rem] leading-tight data-pressed:font-semibold"
          options={FLOW_LABELS.map((label, i) => ({
            value: i as Flow,
            className: flowPressed(i),
            label: (
              <>
                <span aria-hidden className="grid h-6 place-items-center text-accent in-data-pressed:text-current">
                  {i === 0 ? (
                    <span className="h-px w-3.5 bg-ink in-data-pressed:bg-current" />
                  ) : (
                    <span className="rounded-full bg-current" style={{ width: FLOW_DOT[i], height: FLOW_DOT[i] }} />
                  )}
                </span>
                {label}
                {i === 1 && <span className="text-[0.78rem] leading-none font-normal italic opacity-80">quelques gouttes</span>}
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
          className="grid grid-cols-4 border-t border-l border-ink"
          itemClassName="min-h-12 border-r border-b border-ink px-1 py-2.5 text-[0.98rem] data-pressed:bg-ink data-pressed:font-semibold data-pressed:text-bg"
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
        <div className="flex items-center justify-between border-t border-line text-sm text-ink-2">
          <span className="inline-flex items-center gap-1.5 italic">
            {authorName ? `Noté par ${authorName}` : 'Enregistré'} <Icon name="check" className="size-3.5" strokeWidth={2} />
          </span>
          <Button variant="ghost" onClick={() => confirm('Effacer cette journée ?') && onDelete(day)}>
            Effacer
          </Button>
        </div>
      )}
    </div>
  )
}
