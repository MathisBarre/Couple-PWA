import { useMemo } from 'react'
import { addDays, computeStats, diffDays, FLOW_LABELS, PAIN_LABELS, type DayLog } from '../../supabase/functions/_shared/cycles'
import { formatDM, formatLong } from '../lib/dates'

interface Props {
  today: string
  logs: DayLog[]
  defaultCycle: number
  iudInsertedOn: string | null
}

export function Stats({ today, logs, defaultCycle, iudInsertedOn }: Props) {
  const s = useMemo(() => computeStats(logs, today, defaultCycle), [logs, today, defaultCycle])
  const recent = s.cycles.slice(-8).reverse()
  const maxLen = Math.max(35, ...recent.map((c) => c.length ?? diffDays(today, c.start) + 1))
  const iudMonths = iudInsertedOn ? Math.floor(diffDays(today, iudInsertedOn) / 30.4) : null

  const exportCsv = () => {
    const rows = [['date', 'flux', 'douleur', 'symptomes', 'note']]
    for (const l of logs)
      rows.push([
        l.day,
        l.flow != null ? FLOW_LABELS[l.flow] : '',
        l.pain != null ? PAIN_LABELS[l.pain] : '',
        (l.symptoms ?? []).join(' / '),
        (l.note ?? '').replace(/\n/g, ' '),
      ])
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(';')).join('\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv' }))
    a.download = `cycle-${today}.csv`
    a.click()
  }

  if (!s.periods.length)
    return (
      <div className="screen">
        <h2>Analyse</h2>
        <p className="muted">Les analyses apparaîtront après quelques jours de règles notés.</p>
      </div>
    )

  return (
    <div className="screen">
      <h2>Analyse</h2>
      <div className="tiles">
        <Tile label="Cycle (médiane)" value={s.medianCycle ? `${s.medianCycle} j` : '—'} hint={s.minCycle ? `de ${s.minCycle} à ${s.maxCycle} j` : 'il faut 2 cycles'} />
        <Tile label="Durée des règles" value={s.medianPeriod ? `${s.medianPeriod} j` : '—'} hint="médiane" />
        <Tile
          label="Prochaines règles"
          value={s.prediction.nextStart ? formatDM(s.prediction.nextStart) : '—'}
          hint={s.prediction.basedOn ? `sur ${s.prediction.basedOn} cycle${s.prediction.basedOn > 1 ? 's' : ''}` : `estimation ${s.prediction.cycleLength} j`}
        />
        <Tile label="Jours abondants" value={s.heavyDaysPerPeriod != null ? `${s.heavyDaysPerPeriod}` : '—'} hint="par période" />
        <Tile label="Jours douloureux" value={s.painfulDaysShare != null ? `${s.painfulDaysShare} %` : '—'} hint="douleur ≥ modérée" />
        <Tile label="Spotting hors règles" value={`${s.spottingOutsidePeriods} j`} hint="sur 12 mois" />
      </div>

      {s.flags.length > 0 && (
        <div className="card warn">
          <h3>À surveiller</h3>
          <ul>
            {s.flags.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
          <p className="muted small">À mentionner au ou à la gynéco si ça se répète. Ce n’est pas un avis médical.</p>
        </div>
      )}

      <div className="card">
        <h3>Derniers cycles</h3>
        <p className="muted small">Chaque ligne = un cycle. Les cases colorées = jours de règles, du plus clair (spotting) au plus foncé (très abondant).</p>
        <div className="cycles">
          {recent.map((c) => {
            const len = c.length ?? diffDays(today, c.start) + 1
            const firstDay = c.period.days[0].day
            const byDay = new Map(c.period.days.map((d) => [d.day, d]))
            return (
              <div key={c.start} className="cycle-row">
                <div className="cycle-label">{formatDM(c.start)}</div>
                <div className="cycle-bar" style={{ width: `${(len / maxLen) * 100}%` }}>
                  {Array.from({ length: c.period.length }, (_, i) => {
                    const d = byDay.get(addDays(firstDay, i))
                    return (
                      <span
                        key={i}
                        className={`cycle-day flow-${d?.flow ?? 0}`}
                        title={`${formatLong(addDays(firstDay, i))} : ${d?.flow != null ? FLOW_LABELS[d.flow] : 'non noté'}${d?.pain ? ` · douleur ${PAIN_LABELS[d.pain].toLowerCase()}` : ''}`}
                        style={{ width: `${(1 / len) * 100}%` }}
                      />
                    )
                  })}
                </div>
                <div className="cycle-len">{c.length ? `${c.length} j` : 'en cours'}</div>
              </div>
            )
          })}
        </div>
      </div>

      {s.symptomCounts.length > 0 && (
        <div className="card">
          <h3>Symptômes fréquents (12 mois)</h3>
          <ul className="bars">
            {s.symptomCounts.slice(0, 6).map(([name, n]) => (
              <li key={name}>
                <span>{name}</span>
                <span className="bar" style={{ width: `${(n / s.symptomCounts[0][1]) * 100}%` }} />
                <span className="num">{n} j</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="card">
        <h3>Stérilet au cuivre</h3>
        {iudMonths != null && (
          <p>
            Posé il y a <strong>{iudMonths} mois</strong>.{' '}
            {iudMonths < 12 ? 'Pendant la première année, des règles plus longues, plus abondantes et du spotting sont fréquents.' : 'Après un an, les règles se stabilisent en général.'}
          </p>
        )}
        <p className="small">
          Le stérilet au cuivre ne bloque pas l’ovulation : le cycle reste naturel et prévisible. Il rend souvent les règles plus abondantes,
          plus longues et plus douloureuses, surtout les 3 à 12 premiers mois, avec du spotting entre les règles. Signes à signaler : une
          protection traversée en moins d’une heure, de gros caillots, des règles de plus de 7–8 jours, une fatigue ou un essoufflement
          inhabituels (anémie), une douleur persistante, ou un retard de règles.
        </p>
      </div>

      <button className="secondary wide" onClick={exportCsv}>
        Exporter en CSV (pour un rendez-vous)
      </button>
    </div>
  )
}

function Tile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="tile">
      <div className="tile-label">{label}</div>
      <div className="tile-value">{value}</div>
      {hint && <div className="tile-hint">{hint}</div>}
    </div>
  )
}
