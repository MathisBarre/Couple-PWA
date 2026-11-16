// Tâche planifiée Vercel (une fois par jour, voir vercel.json).
// Pour chaque cycle suivi, calcule s'il faut un rappel et l'envoie aux membres de l'espace.
import { reminderFor, todayIn, type DayLog } from '../shared/cycles.js'
import { isEnabled, parseModules } from '../shared/modules.js'
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
  const { rows: cycles } = await conn.execute(
    `select c.id, c.couple_id, c.name, c.default_cycle_length, p.modules,
       (select count(*) from cycles o where o.couple_id = c.couple_id) as siblings
     from cycles c join couples p on p.id = c.couple_id`,
  )
  const report: unknown[] = []

  for (const c of cycles) {
    // Espace qui a désactivé le suivi des règles : pas de rappel.
    if (!isEnabled(parseModules(c.modules), 'cycle')) continue
    const done = await conn.execute({ sql: 'select 1 from cycle_reminders where cycle_id = ? and day = ?', args: [c.id, today] })
    if (done.rows.length) continue

    const { rows } = await conn.execute({
      sql: 'select day, flow, pain, symptoms, note from cycle_logs where cycle_id = ? and day >= ?',
      args: [c.id, since],
    })
    const logs = rows.map((r) => ({ ...r, symptoms: JSON.parse(String(r.symptoms ?? '[]')) })) as unknown as DayLog[]
    const reminder = reminderFor(logs, today, Number(c.default_cycle_length))
    if (!reminder) continue

    // Plusieurs cycles dans l'espace : le rappel dit de qui il s'agit, et ne remplace pas celui d'une autre.
    const name = String(c.name ?? '').trim()
    const several = Number(c.siblings) > 1
    const payload = {
      ...reminder,
      title: several && name ? `${name} · ${reminder.title}` : reminder.title,
      url: `/?open=cycle&cycle=${encodeURIComponent(String(c.id))}`,
      ...(several ? { tag: `reminder-${c.id}` } : {}),
    }
    const members = await conn.execute({ sql: 'select id from users where couple_id = ?', args: [c.couple_id] })
    const sent = await sendToUsers(members.rows.map((m) => String(m.id)), payload, 'reminders')
    await conn.execute({ sql: 'insert or ignore into cycle_reminders (cycle_id, day, kind) values (?, ?, ?)', args: [c.id, today, reminder.kind] })
    report.push({ cycle: c.id, kind: reminder.kind, sent })
  }
  return json({ ok: true, today, report })
}
