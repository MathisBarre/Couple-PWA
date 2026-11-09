// Tâche planifiée Vercel (une fois par jour, voir vercel.json).
// Pour chaque couple, calcule s'il faut un rappel et l'envoie aux deux partenaires.
import { reminderFor, todayIn, type DayLog } from '../shared/cycles.js'
import { db } from './_lib/db.js'
import { error, json } from './_lib/http.js'
import { sendToUsers } from './_lib/push.js'

const TIME_ZONE = 'Europe/Paris'

export async function GET(req: Request) {
  // Vercel envoie "Authorization: Bearer <CRON_SECRET>" aux tâches planifiées.
  if (!process.env.CRON_SECRET || req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) return error('Non autorisé', 401)

  const conn = await db()
  const today = todayIn(TIME_ZONE)
  const since = new Date(Date.now() - 400 * 86_400_000).toISOString().slice(0, 10)
  const { rows: couples } = await conn.execute('select id, default_cycle_length from couples')
  const report: unknown[] = []

  for (const c of couples) {
    const done = await conn.execute({ sql: 'select 1 from reminder_log where couple_id = ? and day = ?', args: [c.id, today] })
    if (done.rows.length) continue

    const { rows } = await conn.execute({
      sql: 'select day, flow, pain, symptoms, note from day_logs where couple_id = ? and day >= ?',
      args: [c.id, since],
    })
    const logs = rows.map((r) => ({ ...r, symptoms: JSON.parse(String(r.symptoms ?? '[]')) })) as unknown as DayLog[]
    const reminder = reminderFor(logs, today, Number(c.default_cycle_length))
    if (!reminder) continue

    const members = await conn.execute({ sql: 'select id from users where couple_id = ?', args: [c.id] })
    const sent = await sendToUsers(members.rows.map((m) => String(m.id)), { ...reminder, url: '/?log=today' })
    await conn.execute({ sql: 'insert into reminder_log (couple_id, day, kind) values (?, ?, ?)', args: [c.id, today, reminder.kind] })
    report.push({ couple: c.id, kind: reminder.kind, sent })
  }
  return json({ ok: true, today, report })
}
