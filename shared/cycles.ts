// Logique de cycle partagée entre l'app (Vite) et la fonction de rappels (Deno).
// Aucune dépendance : uniquement du TypeScript pur.

export type Flow = 0 | 1 | 2 | 3 | 4 | 5
// 0 rien · 1 spotting · 2 léger · 3 moyen · 4 abondant · 5 très abondant

export interface DayLog {
  day: string // YYYY-MM-DD (date locale)
  flow: Flow | null
  pain: number | null // 0 aucune · 1 légère · 2 modérée · 3 forte
  symptoms: string[]
  note: string | null
  updated_by?: string | null
  updated_at?: string
}

export interface Period {
  start: string // premier jour de flux >= léger
  end: string // dernier jour avec saignement (spotting inclus)
  days: DayLog[] // jours de la période (inclut le spotting en bordure)
  length: number // en jours, de start à end inclus
}

export interface Cycle {
  start: string
  length: number | null // null pour le cycle en cours
  period: Period
}

export const FLOW_LABELS = ['Rien', 'Spotting', 'Léger', 'Moyen', 'Abondant', 'Très abondant'] as const
export const PAIN_LABELS = ['Aucune', 'Légère', 'Modérée', 'Forte'] as const

const DAY_MS = 86_400_000

export function toDate(day: string): Date {
  const [y, m, d] = day.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d))
}

export function toDay(date: Date): string {
  return date.toISOString().slice(0, 10)
}

export function addDays(day: string, n: number): string {
  return toDay(new Date(toDate(day).getTime() + n * DAY_MS))
}

export function diffDays(a: string, b: string): number {
  return Math.round((toDate(a).getTime() - toDate(b).getTime()) / DAY_MS)
}

/** Date du jour dans un fuseau donné, au format YYYY-MM-DD. */
export function todayIn(timeZone: string, now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
}

/** 2026-09-30 -> 30/09 */
export const shortFr = (day: string) => `${day.slice(8, 10)}/${day.slice(5, 7)}`

export function median(values: number[]): number | null {
  if (!values.length) return null
  const s = [...values].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2)
}

const isBleeding = (l: DayLog) => (l.flow ?? 0) >= 1
const isRealFlow = (l: DayLog) => (l.flow ?? 0) >= 2

/**
 * Regroupe les jours en périodes de règles.
 * Une période = suite de jours avec saignement (on tolère 1 jour de trou non noté
 * ou noté "rien"), contenant au moins un jour de flux >= léger.
 * Le spotting isolé n'est pas une période (c'est du spotting intermenstruel,
 * fréquent avec un stérilet au cuivre).
 */
export function detectPeriods(logs: DayLog[]): Period[] {
  const bleeding = logs.filter(isBleeding).sort((a, b) => a.day.localeCompare(b.day))
  const groups: DayLog[][] = []
  for (const log of bleeding) {
    const last = groups[groups.length - 1]
    if (last && diffDays(log.day, last[last.length - 1].day) <= 2) last.push(log)
    else groups.push([log])
  }
  return groups
    .filter((g) => g.some(isRealFlow))
    .map((g) => {
      // Le début est le premier jour de vrai flux : le spotting qui précède
      // fait partie de la période mais ne décale pas le début du cycle.
      const start = g.find(isRealFlow)!.day
      const end = g[g.length - 1].day
      const days = g
      return { start, end, days, length: diffDays(end, g[0].day) + 1 }
    })
}

export function buildCycles(periods: Period[]): Cycle[] {
  return periods.map((p, i) => ({
    start: p.start,
    period: p,
    length: periods[i + 1] ? diffDays(periods[i + 1].start, p.start) : null,
  }))
}

export interface Prediction {
  cycleLength: number // longueur de cycle utilisée pour la prévision
  periodLength: number
  nextStart: string | null
  basedOn: number // nombre de cycles complets utilisés
}

/** Prévision : médiane des 6 derniers cycles (robuste aux cycles atypiques). */
export function predict(periods: Period[], defaultCycle = 28, defaultPeriod = 5): Prediction {
  const cycles = buildCycles(periods)
    .map((c) => c.length)
    .filter((l): l is number => l !== null && l >= 15 && l <= 60)
    .slice(-6)
  const cycleLength = median(cycles) ?? defaultCycle
  const periodLength = median(periods.slice(-6).map((p) => p.length)) ?? defaultPeriod
  const last = periods[periods.length - 1]
  return {
    cycleLength,
    periodLength,
    nextStart: last ? addDays(last.start, cycleLength) : null,
    basedOn: cycles.length,
  }
}

export type Status =
  | { kind: 'empty' }
  | { kind: 'in_period'; dayNumber: number; period: Period; loggedToday: boolean }
  | { kind: 'maybe_ended'; period: Period; daysSinceBleeding: number }
  | { kind: 'waiting'; daysUntil: number; nextStart: string; cycleDay: number }
  | { kind: 'late'; daysLate: number; nextStart: string; cycleDay: number }

/** Où en est-on aujourd'hui ? Sert à l'écran d'accueil et aux notifications. */
export function computeStatus(logs: DayLog[], today: string, defaultCycle = 28): Status {
  const past = logs.filter((l) => l.day <= today)
  const periods = detectPeriods(past)
  const last = periods[periods.length - 1]
  if (!last) return { kind: 'empty' }

  const byDay = new Map(past.map((l) => [l.day, l]))
  const sinceEnd = diffDays(today, last.end)
  // Un "rien" noté après le dernier saignement = fin confirmée.
  const confirmedEnd = past.some((l) => l.day > last.end && l.flow === 0)

  if (!confirmedEnd && sinceEnd <= 1) {
    return {
      kind: 'in_period',
      dayNumber: diffDays(today, last.start) + 1,
      period: last,
      loggedToday: byDay.has(today),
    }
  }
  if (!confirmedEnd && sinceEnd <= 4) {
    return { kind: 'maybe_ended', period: last, daysSinceBleeding: sinceEnd }
  }

  const { nextStart } = predict(periods, defaultCycle)
  const cycleDay = diffDays(today, last.start) + 1
  const daysUntil = diffDays(nextStart!, today)
  if (daysUntil < 0) return { kind: 'late', daysLate: -daysUntil, nextStart: nextStart!, cycleDay }
  return { kind: 'waiting', daysUntil, nextStart: nextStart!, cycleDay }
}

export interface Reminder {
  kind: string
  title: string
  body: string
}

/**
 * Quel rappel envoyer aujourd'hui (au plus un par jour) ?
 * Pendant les règles : rappel quotidien si la journée n'est pas notée.
 * Juste après : demande si c'est fini.
 * Avant / au moment prévu / en retard : prévenir pour ne pas oublier le début.
 */
export function reminderFor(logs: DayLog[], today: string, defaultCycle = 28): Reminder | null {
  const status = computeStatus(logs, today, defaultCycle)
  const loggedToday = logs.some((l) => l.day === today)
  switch (status.kind) {
    case 'in_period':
      if (loggedToday) return null
      return {
        kind: 'continue',
        title: `Jour ${status.dayNumber} des règles`,
        body: 'Ça continue ? Note le flux du jour (ou indique que c’est fini).',
      }
    case 'maybe_ended':
      if (loggedToday) return null
      return {
        kind: 'ended',
        title: 'Les règles sont terminées ?',
        body: 'Rien n’a été noté depuis quelques jours. Confirme la fin en un geste.',
      }
    case 'waiting':
      if (status.daysUntil === 2)
        return {
          kind: 'soon',
          title: 'Règles prévues dans ~2 jours',
          body: 'Pense à noter le premier jour dès que ça commence.',
        }
      if (status.daysUntil === 0)
        return {
          kind: 'due',
          title: 'Règles prévues aujourd’hui',
          body: 'Si elles ont commencé, note-le maintenant (même si c’est léger).',
        }
      return null
    case 'late':
      if (loggedToday) return null
      if ([2, 5, 8].includes(status.daysLate))
        return {
          kind: 'late',
          title: `Règles en retard de ${status.daysLate} jours`,
          body:
            status.daysLate >= 8
              ? 'Toujours rien ? Un test de grossesse peut lever le doute, même avec un stérilet.'
              : 'Elles ont peut-être commencé sans être notées ? Vérifie en un geste.',
        }
      return null
    default:
      return null
  }
}

export interface Stats {
  cycles: Cycle[]
  periods: Period[]
  prediction: Prediction
  medianCycle: number | null
  minCycle: number | null
  maxCycle: number | null
  medianPeriod: number | null
  heavyDaysPerPeriod: number | null
  painfulDaysShare: number | null // part des jours de règles avec douleur >= modérée
  spottingOutsidePeriods: number // jours de spotting hors règles (12 derniers mois)
  symptomCounts: [string, number][]
  flags: string[]
}

export function computeStats(logs: DayLog[], today: string, defaultCycle = 28): Stats {
  const past = logs.filter((l) => l.day <= today)
  const periods = detectPeriods(past)
  const cycles = buildCycles(periods)
  const lengths = cycles.map((c) => c.length).filter((l): l is number => l !== null)
  const recentLengths = lengths.slice(-12)
  const recentPeriods = periods.slice(-12)

  const periodDays = recentPeriods.flatMap((p) => p.days)
  const inPeriod = new Set(periods.flatMap((p) => p.days.map((d) => d.day)))
  const yearAgo = addDays(today, -365)

  const symptomMap = new Map<string, number>()
  for (const l of past.filter((l) => l.day >= yearAgo))
    for (const s of l.symptoms ?? []) symptomMap.set(s, (symptomMap.get(s) ?? 0) + 1)

  const flags: string[] = []
  for (const p of recentPeriods.slice(-3)) {
    if (p.length > 8) flags.push(`Règles de ${p.length} jours (début le ${shortFr(p.start)}) : au-delà de 7–8 jours, à signaler.`)
    const veryHeavy = p.days.filter((d) => d.flow === 5).length
    if (veryHeavy >= 3) flags.push(`${veryHeavy} jours « très abondant » (début le ${shortFr(p.start)}) : surveiller la fatigue (risque d’anémie).`)
  }
  for (const l of recentLengths.slice(-3)) {
    if (l < 21) flags.push(`Cycle court de ${l} jours.`)
    if (l > 38) flags.push(`Cycle long de ${l} jours.`)
  }

  return {
    cycles,
    periods,
    prediction: predict(periods, defaultCycle),
    medianCycle: median(recentLengths),
    minCycle: recentLengths.length ? Math.min(...recentLengths) : null,
    maxCycle: recentLengths.length ? Math.max(...recentLengths) : null,
    medianPeriod: median(recentPeriods.map((p) => p.length)),
    heavyDaysPerPeriod: recentPeriods.length
      ? Math.round((periodDays.filter((d) => (d.flow ?? 0) >= 4).length / recentPeriods.length) * 10) / 10
      : null,
    painfulDaysShare: periodDays.length
      ? Math.round((periodDays.filter((d) => (d.pain ?? 0) >= 2).length / periodDays.length) * 100)
      : null,
    spottingOutsidePeriods: past.filter((l) => l.day >= yearAgo && l.flow === 1 && !inPeriod.has(l.day)).length,
    symptomCounts: [...symptomMap.entries()].sort((a, b) => b[1] - a[1]),
    flags,
  }
}
