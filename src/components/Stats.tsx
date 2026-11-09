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
      <div className="flex flex-col gap-3.5">
        <h2 className="text-xl font-bold">Analyse</h2>
        <p className="text-ink-2">Les analyses apparaîtront après quelques jours de règles notés.</p>
      </div>
    )

  return (
    <div className="flex flex-col gap-3.5">
      <h2 className="text-xl font-bold">Analyse</h2>
      <div className="grid grid-cols-2 gap-2.5">
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
        <Card className="border-transparent bg-warn">
          <SectionTitle>À surveiller</SectionTitle>
          <ul className="list-disc space-y-1 pl-5">
            {s.flags.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
          <p className="mt-2 text-sm text-ink-2">À mentionner au ou à la gynéco si ça se répète. Ce n’est pas un avis médical.</p>
        </Card>
      )}

      <Card>
        <SectionTitle>Derniers cycles</SectionTitle>
        <p className="mt-2 text-sm text-ink-2">Chaque ligne = un cycle. Les cases colorées = jours de règles, du plus clair (spotting) au plus foncé (très abondant).</p>
        <div className="mt-3 flex flex-col gap-2">
          {recent.map((c) => {
            const len = c.length ?? diffDays(today, c.start) + 1
            const firstDay = c.period.days[0].day
            const byDay = new Map(c.period.days.map((d) => [d.day, d]))
            return (
              <div key={c.start} className="grid grid-cols-[52px_1fr_58px] items-center gap-2 text-[0.82rem]">
                <div className="text-ink-2">{formatDM(c.start)}</div>
                <div className="flex h-4.5 gap-0.5 overflow-hidden rounded bg-surface-2" style={{ width: `${(len / maxLen) * 100}%` }}>
                  {Array.from({ length: c.period.length }, (_, i) => {
                    const d = byDay.get(addDays(firstDay, i))
                    return (
                      <span
                        key={i}
                        className={cx('h-full min-w-1 first:rounded-l', d?.flow ? flowBg[d.flow] : 'bg-line')}
                        title={`${formatLong(addDays(firstDay, i))} : ${d?.flow != null ? FLOW_LABELS[d.flow] : 'non noté'}${d?.pain ? ` · douleur ${PAIN_LABELS[d.pain].toLowerCase()}` : ''}`}
                        style={{ width: `${(1 / len) * 100}%` }}
                      />
                    )
                  })}
                </div>
                <div className="text-right font-semibold">{c.length ? `${c.length} j` : 'en cours'}</div>
              </div>
            )
          })}
        </div>
      </Card>

      {s.symptomCounts.length > 0 && (
        <Card>
          <SectionTitle>Symptômes fréquents (12 mois)</SectionTitle>
          <ul className="flex flex-col gap-1.5">
            {s.symptomCounts.slice(0, 6).map(([name, n]) => (
              <li key={name} className="grid grid-cols-[110px_1fr_40px] items-center gap-2 text-sm">
                <span>{name}</span>
                <span className="h-2.5 rounded-r bg-flow-3" style={{ width: `${(n / s.symptomCounts[0][1]) * 100}%` }} />
                <span className="text-right text-ink-2">{n} j</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card>
        <SectionTitle>Stérilet au cuivre</SectionTitle>
        {iudMonths != null && (
          <p>
            Posé il y a <strong>{iudMonths} mois</strong>.{' '}
            {iudMonths < 12 ? 'Pendant la première année, des règles plus longues, plus abondantes et du spotting sont fréquents.' : 'Après un an, les règles se stabilisent en général.'}
          </p>
        )}
        <p className="mt-2 text-sm leading-relaxed">
          Le stérilet au cuivre ne bloque pas l’ovulation : le cycle reste naturel et prévisible. Il rend souvent les règles plus abondantes,
          plus longues et plus douloureuses, surtout les 3 à 12 premiers mois, avec du spotting entre les règles. Signes à signaler : une
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

function Tile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card className="p-3.5">
      <div className="text-xs text-ink-2">{label}</div>
      <div className="mt-0.5 text-2xl font-bold">{value}</div>
      {hint && <div className="text-xs text-ink-2">{hint}</div>}
    </Card>
  )
}
