import { useMemo } from 'react'
import { addDays, computeStats, diffDays, FLOW_LABELS, PAIN_LABELS, type DayLog } from '../../shared/cycles'
import { formatDM, formatLong } from '../lib/dates'
import { Button, Card, cx, flowBg, SectionTitle } from './ui'

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
      <div className="flex flex-col gap-3.5 pt-5">
        <h2 className="titre">Analyse</h2>
        <p className="text-ink-2 italic">Les analyses apparaîtront après quelques jours de règles notés.</p>
      </div>
    )

  return (
    <div className="flex flex-col gap-6 pt-5">
      <div>
        <h2 className="titre">Analyse</h2>
        {/* Tableau d'almanach : deux colonnes séparées par un filet, un chiffre par case. */}
        <div className="mt-3 grid grid-cols-2 border-t border-ink">
          <Tile label="Cycle (médiane)" value={s.medianCycle ? `${s.medianCycle} j` : '—'} hint={s.minCycle ? `de ${s.minCycle} à ${s.maxCycle} j` : 'il faut 2 cycles'} />
          <Tile label="Durée des règles" value={s.medianPeriod ? `${s.medianPeriod} j` : '—'} hint="médiane" />
          <Tile
            accent
            label="Prochaines règles"
            value={s.prediction.nextStart ? formatDM(s.prediction.nextStart) : '—'}
            hint={s.prediction.basedOn ? `sur ${s.prediction.basedOn} cycle${s.prediction.basedOn > 1 ? 's' : ''}` : `estimation ${s.prediction.cycleLength} j`}
          />
          <Tile label="Jours abondants" value={s.heavyDaysPerPeriod != null ? s.heavyDaysPerPeriod.toLocaleString('fr-FR') : '—'} hint="par période" />
          <Tile label="Jours douloureux" value={s.painfulDaysShare != null ? `${s.painfulDaysShare} %` : '—'} hint="douleur ≥ modérée" />
          <Tile label="Traces hors règles" value={`${s.spottingOutsidePeriods} j`} hint="petites pertes, sur 12 mois" />
        </div>
      </div>

      {s.flags.length > 0 && (
        <div className="border-2 border-accent px-3.5 pt-3 pb-3.5">
          <SectionTitle>À surveiller</SectionTitle>
          <ul className="space-y-1.5">
            {s.flags.map((f) => (
              <li key={f} className="grid grid-cols-[1.25rem_1fr]">
                <span aria-hidden className="text-accent">
                  —
                </span>
                <span>{f}</span>
              </li>
            ))}
          </ul>
          <p className="mt-2.5 text-sm text-ink-2 italic">À mentionner au ou à la gynéco si ça se répète. Ce n’est pas un avis médical.</p>
        </div>
      )}

      <Card>
        <SectionTitle>Derniers cycles</SectionTitle>
        <p className="text-sm leading-snug text-ink-2 italic">Chaque ligne = un cycle. Les cases colorées = jours de règles, du plus clair (traces) au plus foncé (très abondant).</p>
        <div className="mt-3 flex flex-col">
          {recent.map((c) => {
            const len = c.length ?? diffDays(today, c.start) + 1
            const firstDay = c.period.days[0].day
            const byDay = new Map(c.period.days.map((d) => [d.day, d]))
            return (
              <div key={c.start} className="grid grid-cols-[56px_1fr_62px] items-center gap-2 border-t border-line py-2 text-[0.95rem]">
                <div className="text-ink-2">{formatDM(c.start)}</div>
                {/* La durée du cycle : un filet terminé par un cran ; les jours de règles posés dessus. */}
                <div className={cx('flex h-4 border-b border-ink', c.length != null && 'border-r')} style={{ width: `${(len / maxLen) * 100}%` }}>
                  {Array.from({ length: c.period.length }, (_, i) => {
                    const d = byDay.get(addDays(firstDay, i))
                    return (
                      <span
                        key={i}
                        className={cx('h-full min-w-1', d?.flow ? flowBg[d.flow] : 'bg-line')}
                        title={`${formatLong(addDays(firstDay, i))} : ${d?.flow != null ? FLOW_LABELS[d.flow] : 'non noté'}${d?.pain ? ` · douleur ${PAIN_LABELS[d.pain].toLowerCase()}` : ''}`}
                        style={{ width: `${(1 / len) * 100}%` }}
                      />
                    )
                  })}
                </div>
                <div className={cx('text-right', c.length ? 'font-semibold' : 'text-accent italic')}>{c.length ? `${c.length} j` : 'en cours'}</div>
              </div>
            )
          })}
        </div>
      </Card>

      {s.symptomCounts.length > 0 && (
        <Card>
          <SectionTitle>Symptômes fréquents (12 mois)</SectionTitle>
          <ul className="flex flex-col">
            {s.symptomCounts.slice(0, 6).map(([name, n]) => (
              <li key={name} className="grid grid-cols-[112px_1fr_40px] items-center gap-2 border-t border-line py-2 text-[0.95rem] first:border-t-0 first:pt-0">
                <span>{name}</span>
                <span className="h-2 bg-accent" style={{ width: `${(n / s.symptomCounts[0][1]) * 100}%` }} />
                <span className="text-right text-ink-2">{n} j</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card>
        <SectionTitle>Stérilet au cuivre</SectionTitle>
        {iudMonths != null && (
          <p className="text-[1.15rem] leading-snug">
            Posé il y a <strong>{iudMonths} mois</strong>.{' '}
            {iudMonths < 12 ? 'Pendant la première année, des règles plus longues, plus abondantes et des traces (petites pertes) entre les règles sont fréquentes.' : 'Après un an, les règles se stabilisent en général.'}
          </p>
        )}
        <p className="mt-2.5 text-[0.95rem] leading-relaxed text-ink-2">
          Le stérilet au cuivre ne bloque pas l’ovulation : le cycle reste naturel et prévisible. Il rend souvent les règles plus abondantes,
          plus longues et plus douloureuses, surtout les 3 à 12 premiers mois, avec des traces (petites pertes de sang) entre les règles. Signes à signaler : une
          protection traversée en moins d’une heure, de gros caillots, des règles de plus de 7–8 jours, une fatigue ou un essoufflement
          inhabituels (anémie), une douleur persistante, ou un retard de règles.
        </p>
      </Card>

      <Button variant="secondary" onClick={exportCsv}>
        Exporter en CSV (pour un rendez-vous)
      </Button>
    </div>
  )
}

/** Case du tableau d'analyse : étiquette, chiffre en grand, précision en italique. */
function Tile({ label, value, hint, accent }: { label: string; value: string; hint?: string; accent?: boolean }) {
  return (
    <div className="border-b border-ink py-3 odd:border-r odd:pr-3 even:pl-3">
      <div className="etiquette text-ink-2">{label}</div>
      <div className={cx('mt-1.5 text-[2.6rem] leading-none font-light tracking-[-0.03em] whitespace-nowrap', accent && 'text-accent')}>{value}</div>
      {hint && <div className="mt-1 text-sm text-ink-2 italic">{hint}</div>}
    </div>
  )
}
