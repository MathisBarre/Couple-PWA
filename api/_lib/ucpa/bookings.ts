// Séances réservées de chacun, gardées dans la base (nom et horaires seulement) pour que l'autre
// les voie, même quand on n'a pas l'app ouverte.
//
// La liste est remise à jour à chaque lecture du planning UCPA (ouverture de l'espace, au plus
// toutes les 10 minutes) et à chaque réservation ou annulation faite dans l'app. Une séance
// réservée ou annulée ailleurs (site UCPA, accueil) est repérée à la lecture suivante, et l'autre
// est prévenu comme pour une réservation faite dans l'app. La toute première lecture après la
// connexion sert de point de départ : elle ne prévient personne.
import type { User } from '../auth.js'
import { notifyActivity, type SportSlot } from '../activity.js'
import { db } from '../db.js'
import { parisDate, type DayPlanning } from './reservations.js'

type Member = User & { couple_id: string }

export interface Booking extends SportSlot {
  day: string
}

/** Après une lecture du planning de ces jours-là : la liste gardée suit ce qu'UCPA a renvoyé. */
export async function syncDays(user: Member, days: DayPlanning[], { firstSync }: { firstSync: boolean }) {
  if (!days.length) return
  const conn = await db()
  const dates = days.map((d) => d.date)
  const now = Date.now()
  const { rows } = await conn.execute({
    sql: `select session_id, name, start_ms, end_ms from ucpa_bookings where user_id = ? and day in (${dates.map(() => '?').join(',')})`,
    args: [user.id, ...dates],
  })
  const before = new Map(rows.map((r) => [String(r.session_id), { id: String(r.session_id), name: String(r.name), start: Number(r.start_ms), end: Number(r.end_ms) }]))
  const after = days.flatMap((d) =>
    d.sessions.filter((s) => s.reserved === true && s.end > now).map((s) => ({ id: s.id, name: s.name, start: s.start, end: s.end, day: d.date })),
  )
  const booked = after.filter((s) => !before.has(s.id))
  const afterIds = new Set(after.map((s) => s.id))
  const cancelled = [...before.values()].filter((s) => !afterIds.has(s.id) && s.start > now)

  await conn.batch(
    [
      { sql: `delete from ucpa_bookings where user_id = ? and day in (${dates.map(() => '?').join(',')})`, args: [user.id, ...dates] },
      ...after.map((s) => ({
        sql: 'insert or replace into ucpa_bookings (user_id, session_id, day, name, start_ms, end_ms) values (?, ?, ?, ?, ?, ?)',
        args: [user.id, s.id, s.day, s.name.slice(0, 120), s.start, s.end],
      })),
      { sql: 'update ucpa_accounts set synced_at = ? where user_id = ?', args: [now, user.id] },
      // Le passé ne sert plus à personne.
      { sql: 'delete from ucpa_bookings where end_ms < ?', args: [now - 86400_000] },
    ],
    'write',
  )
  if (!firstSync && (booked.length || cancelled.length)) notifyActivity(user, { kind: 'sport', data: { booked, cancelled } })
}

/** Réservation ou annulation confirmée par UCPA depuis l'app : la liste suit tout de suite. */
export async function recordMutation(user: Member, slot: SportSlot, action: 'booked' | 'cancelled', { notify }: { notify: boolean }) {
  const conn = await db()
  if (action === 'booked') {
    await conn.execute({
      sql: 'insert or replace into ucpa_bookings (user_id, session_id, day, name, start_ms, end_ms) values (?, ?, ?, ?, ?, ?)',
      args: [user.id, slot.id, parisDate(new Date(slot.start)), slot.name.slice(0, 120), slot.start, slot.end],
    })
  } else {
    await conn.execute({ sql: 'delete from ucpa_bookings where user_id = ? and session_id = ?', args: [user.id, slot.id] })
  }
  if (notify) notifyActivity(user, { kind: 'sport', data: action === 'booked' ? { booked: [slot] } : { cancelled: [slot] } })
}

/** Séances à venir d'un membre. */
export async function upcomingOf(userId: string): Promise<Booking[]> {
  const { rows } = await (await db()).execute({
    sql: 'select session_id, day, name, start_ms, end_ms from ucpa_bookings where user_id = ? and end_ms > ? order by start_ms',
    args: [userId, Date.now()],
  })
  return rows.map((r) => ({ id: String(r.session_id), day: String(r.day), name: String(r.name), start: Number(r.start_ms), end: Number(r.end_ms) }))
}
