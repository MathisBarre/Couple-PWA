import { useEffect, useState } from 'react'
import { FLOW_LABELS, PAIN_LABELS, type DayLog, type Flow } from '../../supabase/functions/_shared/cycles'

export const SYMPTOMS = ['Crampes', 'Mal de dos', 'Maux de tête', 'Fatigue', 'Ballonnements', 'Nausées', 'Caillots', 'Humeur', 'Seins sensibles']

interface Props {
  day: string
  log: DayLog | undefined
  onSave: (log: DayLog) => void
  onDelete: (day: string) => void
  authorName?: string
}

/** Saisie d'une journée : chaque appui enregistre immédiatement. */
export function DayEditor({ day, log, onSave, onDelete, authorName }: Props) {
  const [showMore, setShowMore] = useState(Boolean(log?.symptoms?.length || log?.note))
  const [note, setNote] = useState(log?.note ?? '')
  useEffect(() => setNote(log?.note ?? ''), [day, log?.note])

  const base: DayLog = log ?? { day, flow: null, pain: null, symptoms: [], note: null }
  const update = (patch: Partial<DayLog>) => onSave({ ...base, ...patch, day })

  return (
    <div className="editor">
      <section>
        <h3>Flux</h3>
        <div className="flow-grid">
          {FLOW_LABELS.map((label, i) => (
            <button
              key={label}
              className={`flow-btn flow-${i} ${base.flow === i ? 'selected' : ''}`}
              onClick={() => update({ flow: i as Flow })}
            >
              <span className="drops" aria-hidden>
                {i === 0 ? '—' : i === 1 ? '·' : '●'.repeat(i - 1)}
              </span>
              {label}
            </button>
          ))}
        </div>
      </section>

      <section>
        <h3>Douleur</h3>
        <div className="seg">
          {PAIN_LABELS.map((label, i) => (
            <button key={label} className={base.pain === i ? 'selected' : ''} onClick={() => update({ pain: i })}>
              {label}
            </button>
          ))}
        </div>
      </section>

      {showMore ? (
        <>
          <section>
            <h3>Symptômes</h3>
            <div className="chips">
              {SYMPTOMS.map((s) => {
                const on = base.symptoms?.includes(s)
                return (
                  <button
                    key={s}
                    className={`chip ${on ? 'selected' : ''}`}
                    onClick={() =>
                      update({ symptoms: on ? base.symptoms.filter((x) => x !== s) : [...(base.symptoms ?? []), s] })
                    }
                  >
                    {s}
                  </button>
                )
              })}
            </div>
          </section>
          <section>
            <h3>Note</h3>
            <textarea
              value={note}
              placeholder="Ex. caillots, médicament pris…"
              rows={2}
              onChange={(e) => setNote(e.target.value)}
              onBlur={() => note !== (base.note ?? '') && update({ note: note || null })}
            />
          </section>
        </>
      ) : (
        <button className="link" onClick={() => setShowMore(true)}>
          + Symptômes et note
        </button>
      )}

      {log && (
        <div className="editor-foot">
          <span>{authorName ? `Noté par ${authorName}` : 'Enregistré'} ✓</span>
          <button className="link danger" onClick={() => confirm('Effacer cette journée ?') && onDelete(day)}>
            Effacer
          </button>
        </div>
      )}
    </div>
  )
}
