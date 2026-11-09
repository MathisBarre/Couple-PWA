// Tests rapides de la logique de cycle : node --experimental-strip-types scripts/test-cycles.ts
import assert from 'node:assert/strict'
import { addDays, computeStats, computeStatus, detectPeriods, predict, reminderFor, type DayLog, type Flow } from '../shared/cycles.ts'

const mk = (start: string, flows: number[], pain = 0): DayLog[] =>
  flows.map((f, i) => ({ day: addDays(start, i), flow: f as Flow, pain, symptoms: [], note: null }))

// 3 cycles de 29, 30, 28 jours, avec spotting avant et un jour non noté au milieu.
const logs: DayLog[] = [
  ...mk('2026-08-01', [1, 3, 4, 5, 4, 2, 1]),
  ...mk('2026-08-31', [3, 4, 4]), // 08-30 spotting? non : début direct
  ...mk('2026-09-04', [2, 1]), // trou d'un jour (09-03) toléré
  ...mk('2026-09-15', [1]), // spotting isolé
  ...mk('2026-09-30', [4, 5, 5, 4, 3, 2, 2, 1, 1], 2),
  ...mk('2026-10-28', [3, 3, 2, 1]),
]
const periods = detectPeriods(logs)
assert.equal(periods.length, 4)
assert.equal(periods[0].start, '2026-08-02') // spotting initial exclu du début
assert.equal(periods[0].length, 7)
assert.equal(periods[1].end, '2026-09-05')
const p = predict(periods)
assert.equal(p.basedOn, 3)
assert.equal(p.cycleLength, 29)
assert.equal(p.nextStart, '2026-11-26')

// En cours de règles, journée pas notée -> rappel "continue"
assert.equal(computeStatus(logs, '2026-11-01').kind, 'in_period')
assert.equal(reminderFor(logs, '2026-11-01')?.kind, 'continue')
assert.equal(reminderFor(logs, '2026-10-31'), null) // déjà noté
// 2 jours sans rien -> "c'est fini ?"
assert.equal(computeStatus(logs, '2026-11-02').kind, 'maybe_ended')
assert.equal(reminderFor(logs, '2026-11-02')?.kind, 'ended')
// fin confirmée par un "rien"
const ended = [...logs, ...mk('2026-11-01', [0])]
assert.equal(computeStatus(ended, '2026-11-02').kind, 'waiting')
assert.equal(reminderFor(ended, '2026-11-24')?.kind, 'soon')
assert.equal(reminderFor(ended, '2026-11-26')?.kind, 'due')
assert.equal(reminderFor(ended, '2026-11-28')?.kind, 'late')
assert.equal(reminderFor(ended, '2026-11-29'), null)
const st = computeStats(ended, '2026-11-09')
assert.equal(st.spottingOutsidePeriods, 1)
assert.ok(st.flags.some((f) => f.includes('9 jours')))
console.log('OK', { prediction: p, flags: st.flags })
