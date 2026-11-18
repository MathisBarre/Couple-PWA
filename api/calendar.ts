// Calendrier commun de l'espace.
// GET  /api/calendar                    -> { events, feed } : les événements et le jeton du flux d'abonnement
// POST /api/calendar { ops: [...] }     -> applique des modifications (ajout/modification, suppression), renvoie la même chose.
//      Rejouables sans risque : l'app les garde en file d'attente hors ligne.
// POST /api/calendar { action: 'reset-feed' } -> nouveau lien d'abonnement (l'ancien cesse de marcher)
// GET  /api/calendar?feed=<jeton>[&event=<id>] -> fichier iCalendar, sans session : c'est ce que lisent
//      Apple Calendrier / Google Agenda abonnés (/cal/<jeton>.ics, voir vercel.json), ou un seul événement.
import { randomBytes } from 'node:crypto'
import { cleanEvent, compareEvents, sameEvent, toICS, type CalEvent, type StoredEvent } from '../shared/calendar.js'
import { requireCouple } from './_lib/auth.js'
import { db } from './_lib/db.js'
import { body, error, json } from './_lib/http.js'
import { notifyActivity, type CalendarActivity, type CalendarItem } from './_lib/activity.js'

export type CalendarOp = { op: 'put'; event: CalEvent } | { op: 'delete'; id: string }

const ID = /^[\w-]{8,64}$/
const FIELDS = 'id, title, start_day, end_day, start_time, end_time, location, note, created_by, updated_by, updated_at'
/** Le flux garde un an d'historique : assez pour retrouver une date, sans grossir sans fin. */
const FEED_HISTORY_DAYS = 400

const row = (r: Record<string, unknown>): StoredEvent => ({
  id: String(r.id),
  title: String(r.title),
  start_day: String(r.start_day),
  end_day: String(r.end_day),
  start_time: r.start_time == null ? null : String(r.start_time),
  end_time: r.end_time == null ? null : String(r.end_time),
  location: r.location == null ? null : String(r.location),
  note: r.note == null ? null : String(r.note),
  created_by: r.created_by == null ? null : String(r.created_by),
  updated_by: r.updated_by == null ? null : String(r.updated_by),
  updated_at: String(r.updated_at),
})

async function events(coupleId: string) {
  const { rows } = await (await db()).execute({ sql: `select ${FIELDS} from calendar_events where couple_id = ?`, args: [coupleId] })
  return rows.map((r) => row(r as Record<string, unknown>)).sort(compareEvents)
}

async function feedToken(coupleId: string, reset = false) {
  const conn = await db()
  if (!reset) {
    const { rows } = await conn.execute({ sql: 'select calendar_token from couples where id = ?', args: [coupleId] })
    if (rows[0]?.calendar_token) return String(rows[0].calendar_token)
  }
  const token = randomBytes(18).toString('base64url')
  // Deux appareils qui le créent en même temps : le premier gagne, les deux lisent le même.
  await conn.execute({
    sql: reset ? 'update couples set calendar_token = ? where id = ?' : 'update couples set calendar_token = coalesce(calendar_token, ?) where id = ?',
    args: [token, coupleId],
  })
  const { rows } = await conn.execute({ sql: 'select calendar_token from couples where id = ?', args: [coupleId] })
  return String(rows[0].calendar_token)
}

const state = async (coupleId: string) => ({ events: await events(coupleId), feed: await feedToken(coupleId) })

const item = (e: CalEvent): CalendarItem => ({ id: e.id, title: e.title, start_day: e.start_day, end_day: e.end_day, start_time: e.start_time })

async function feed(req: Request, token: string, eventId: string | null) {
  token = token.replace(/\.ics$/i, '')
  if (!/^[\w-]{16,64}$/.test(token)) return new Response('Lien invalide', { status: 404 })
  const conn = await db()
  const { rows } = await conn.execute({ sql: 'select id from couples where calendar_token = ?', args: [token] })
  if (!rows[0]) return new Response('Ce lien de calendrier n’existe plus. Abonnez-vous de nouveau depuis l’app.', { status: 404 })
  const coupleId = String(rows[0].id)
  const since = new Date(Date.now() - FEED_HISTORY_DAYS * 86400_000).toISOString().slice(0, 10)
  let list = (await events(coupleId)).filter((e) => e.end_day >= since)
  if (eventId) {
    list = list.filter((e) => e.id === eventId)
    if (!list.length) return new Response('Cet événement n’existe plus.', { status: 404 })
  }
  const url = new URL(req.url)
  const ics = toICS(list, { host: url.host, appUrl: `${url.origin}/?open=calendar`, name: 'À deux' })
  return new Response(ics, {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      // En ligne : iOS propose « Ajouter au calendrier » ; une pièce jointe irait dans Fichiers.
      'Content-Disposition': `inline; filename="${eventId ? 'evenement' : 'a-deux'}.ics"`,
      'Cache-Control': 'no-cache',
    },
  })
}

export async function GET(req: Request) {
  const params = new URL(req.url).searchParams
  const token = params.get('feed')
  if (token) return feed(req, token, params.get('event'))
  const user = await requireCouple(req)
  if (user instanceof Response) return user
  return json(await state(user.couple_id))
}

export async function POST(req: Request) {
  const user = await requireCouple(req)
  if (user instanceof Response) return user
  const data = await body<{ ops?: CalendarOp[]; action?: string }>(req)
  if (data.action === 'reset-feed') {
    await feedToken(user.couple_id, true)
    return json(await state(user.couple_id))
  }
  const { ops } = data
  if (!Array.isArray(ops) || !ops.length || ops.length > 200) return error('Données invalides')

  const conn = await db()
  const ids = [...new Set(ops.map((o) => (o?.op === 'put' ? o.event?.id : o?.id)).filter((id): id is string => typeof id === 'string' && ID.test(id)))]
  // État avant les modifications : distingue un ajout d'une modification, et ce qui n'a pas changé.
  const before = new Map<string, StoredEvent>()
  if (ids.length) {
    const { rows } = await conn.execute({
      sql: `select ${FIELDS} from calendar_events where couple_id = ? and id in (${ids.map(() => '?').join(',')})`,
      args: [user.couple_id, ...ids],
    })
    for (const r of rows) before.set(String(r.id), row(r as Record<string, unknown>))
  }

  const statements = []
  const activity: Required<CalendarActivity> = { added: [], updated: [], deleted: [] }
  const current = new Map<string, CalEvent | null>(before)
  for (const o of ops) {
    if (o?.op === 'put') {
      const event = cleanEvent(o.event)
      if (typeof event === 'string') return error(event)
      const prev = current.get(event.id)
      if (prev && sameEvent(prev, event)) continue // opération rejouée
      if (prev === null) continue // supprimé juste avant dans le même envoi : on ne le recrée pas
      statements.push({
        // L'id d'un autre espace ne peut pas être repris (« where couple_id »).
        sql: `insert into calendar_events (id, couple_id, title, start_day, end_day, start_time, end_time, location, note, created_by, updated_by)
              values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
              on conflict (id) do update set title = excluded.title, start_day = excluded.start_day, end_day = excluded.end_day,
                start_time = excluded.start_time, end_time = excluded.end_time, location = excluded.location, note = excluded.note,
                updated_by = excluded.updated_by, updated_at = datetime('now')
              where calendar_events.couple_id = excluded.couple_id`,
        args: [event.id, user.couple_id, event.title, event.start_day, event.end_day, event.start_time, event.end_time, event.location, event.note, user.id, user.id],
      })
      ;(prev ? activity.updated : activity.added).push(item(event))
      current.set(event.id, event)
    } else if (o?.op === 'delete') {
      if (typeof o.id !== 'string' || !ID.test(o.id)) return error('Événement invalide')
      const prev = current.get(o.id)
      if (!prev) continue // déjà supprimé (ou jamais arrivé)
      statements.push({ sql: 'delete from calendar_events where id = ? and couple_id = ?', args: [o.id, user.couple_id] })
      activity.deleted.push(item(prev))
      current.set(o.id, null)
    } else return error('Opération inconnue')
  }
  if (statements.length) await conn.batch(statements, 'write')
  if (activity.added.length || activity.updated.length || activity.deleted.length) notifyActivity(user, { kind: 'calendar', data: activity })
  return json(await state(user.couple_id))
}
