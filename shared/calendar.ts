// Calendrier commun : format d'un événement, contrôle des saisies et export iCalendar (.ics).
// Partagé par l'app (affichage, saisie) et l'API (validation, flux d'abonnement).
//
// Les dates et heures sont celles de l'horloge murale à Paris (« 2026-11-21 », « 20:30 ») :
// c'est ce que les gens saisissent et lisent. L'export les convertit en UTC.

export const CAL_ZONE = 'Europe/Paris'

export interface CalEvent {
  id: string
  title: string
  /** Premier jour (YYYY-MM-DD). */
  start_day: string
  /** Dernier jour, inclus (= start_day pour un événement d'un jour). */
  end_day: string
  /** Heure de début (HH:MM) ; null = toute la journée. */
  start_time: string | null
  /** Heure de fin (HH:MM), le jour end_day ; null = toute la journée (ou sans heure de fin : 1 h). */
  end_time: string | null
  location: string | null
  note: string | null
}

export interface StoredEvent extends CalEvent {
  created_by: string | null
  updated_by: string | null
  updated_at: string
}

export const MAX_TITLE = 120
export const MAX_LOCATION = 200
export const MAX_NOTE = 2000
const DAY = /^\d{4}-\d{2}-\d{2}$/
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/
const ID = /^[\w-]{8,64}$/

const validDay = (d: unknown): d is string => typeof d === 'string' && DAY.test(d) && !Number.isNaN(Date.parse(`${d}T00:00:00Z`)) && new Date(`${d}T00:00:00Z`).toISOString().startsWith(d)
const clean = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/\p{Cc}/gu, (c) => (c === '\n' ? c : ' ')).trim().slice(0, max) : '')

/** Événement reçu de l'app, nettoyé ; ou un message d'erreur. */
export function cleanEvent(input: unknown): CalEvent | string {
  if (!input || typeof input !== 'object') return 'Événement invalide'
  const e = input as Record<string, unknown>
  if (typeof e.id !== 'string' || !ID.test(e.id)) return 'Événement invalide'
  const title = clean(e.title, MAX_TITLE).replace(/\s+/g, ' ')
  if (!title) return 'Donnez un titre à l’événement'
  if (!validDay(e.start_day)) return 'Date invalide'
  const end_day = e.end_day == null || e.end_day === '' ? e.start_day : e.end_day
  if (!validDay(end_day) || end_day < e.start_day) return 'La fin est avant le début'
  const start_time = e.start_time == null || e.start_time === '' ? null : e.start_time
  let end_time = start_time == null || e.end_time == null || e.end_time === '' ? null : e.end_time
  if (start_time !== null && (typeof start_time !== 'string' || !TIME.test(start_time))) return 'Heure invalide'
  if (end_time !== null && (typeof end_time !== 'string' || !TIME.test(end_time))) return 'Heure invalide'
  if (start_time && end_time && end_day === e.start_day && end_time < start_time) return 'La fin est avant le début'
  if (start_time && end_time === start_time && end_day === e.start_day) end_time = null
  const location = clean(e.location, MAX_LOCATION).replace(/\s+/g, ' ') || null
  const note = clean(e.note, MAX_NOTE) || null
  return { id: e.id, title, start_day: e.start_day, end_day, start_time: start_time as string | null, end_time: end_time as string | null, location, note }
}

export const sameEvent = (a: CalEvent, b: CalEvent) =>
  a.title === b.title &&
  a.start_day === b.start_day &&
  a.end_day === b.end_day &&
  a.start_time === b.start_time &&
  a.end_time === b.end_time &&
  a.location === b.location &&
  a.note === b.note

/** Ordre d'affichage : par jour, la journée entière d'abord, puis par heure. */
export const compareEvents = (a: CalEvent, b: CalEvent) =>
  a.start_day.localeCompare(b.start_day) || (a.start_time ?? '').localeCompare(b.start_time ?? '') || a.title.localeCompare(b.title, 'fr')

export function addDay(day: string, n: number) {
  const d = new Date(`${day}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

/** Instant UTC (ms) d'une heure de l'horloge murale dans ce fuseau (gère les changements d'heure). */
export function zonedToUtc(day: string, time: string, zone = CAL_ZONE): number {
  const guess = Date.parse(`${day}T${time}:00Z`)
  const offset = (ms: number) => {
    const parts = Object.fromEntries(
      new Intl.DateTimeFormat('en-US', { timeZone: zone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
        .formatToParts(ms)
        .map((p) => [p.type, p.value]),
    )
    return Date.parse(`${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}Z`) - ms
  }
  const first = guess - offset(guess)
  return guess - offset(first)
}

/** Début et fin (ms UTC) d'un événement à heure ; sans heure de fin : 1 h. */
export function eventSpan(e: CalEvent): { start: number; end: number } | null {
  if (!e.start_time) return null
  const start = zonedToUtc(e.start_day, e.start_time)
  const end = e.end_time ? zonedToUtc(e.end_day, e.end_time) : e.end_day !== e.start_day ? zonedToUtc(e.end_day, e.start_time) : start + 3600_000
  return { start, end: Math.max(end, start) }
}

// ───────── iCalendar (RFC 5545) ─────────
const utcStamp = (ms: number) => new Date(ms).toISOString().replace(/[-:]|\.\d{3}/g, '')
const dateValue = (day: string) => day.replace(/-/g, '')
const text = (v: string) => v.replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/[;,]/g, (c) => `\\${c}`)
const encoder = new TextEncoder()
function fold(line: string) {
  const out: string[] = []
  let current = ''
  let size = 0
  for (const char of line) {
    const bytes = encoder.encode(char).length
    if (size + bytes > 75) {
      out.push(current)
      current = ' '
      size = 1
    }
    current += char
    size += bytes
  }
  return [...out, current].join('\r\n')
}

function vevent(e: StoredEvent, host: string, appUrl: string) {
  const lines = ['BEGIN:VEVENT', `UID:${e.id}@${host}`, `DTSTAMP:${utcStamp(Date.parse(`${e.updated_at.replace(' ', 'T')}Z`) || Date.now())}`]
  const span = eventSpan(e)
  if (span) lines.push(`DTSTART:${utcStamp(span.start)}`, `DTEND:${utcStamp(span.end)}`)
  else lines.push(`DTSTART;VALUE=DATE:${dateValue(e.start_day)}`, `DTEND;VALUE=DATE:${dateValue(addDay(e.end_day, 1))}`)
  lines.push(`SUMMARY:${text(e.title)}`)
  if (e.location) lines.push(`LOCATION:${text(e.location)}`)
  if (e.note) lines.push(`DESCRIPTION:${text(e.note)}`)
  lines.push(`URL:${appUrl}`, 'END:VEVENT')
  return lines
}

/** Fichier .ics : tout le calendrier (abonnement) ou un seul événement. */
export function toICS(events: StoredEvent[], { host, appUrl, name }: { host: string; appUrl: string; name: string }) {
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//A deux//Calendrier commun//FR',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${text(name)}`,
    `X-WR-TIMEZONE:${CAL_ZONE}`,
    // Demande aux calendriers abonnés de revenir souvent (Apple le suit ; Google garde son rythme).
    'REFRESH-INTERVAL;VALUE=DURATION:PT15M',
    'X-PUBLISHED-TTL:PT15M',
    ...events.flatMap((e) => vevent(e, host, appUrl)),
    'END:VCALENDAR',
    '',
  ]
    .map(fold)
    .join('\r\n')
}
