// GET    /api/logs           -> toutes les journées du couple
// PUT    /api/logs  [DayLog] -> enregistre (ou remplace) une ou plusieurs journées
// DELETE /api/logs?day=…     -> efface une journée
import { requireCouple } from './_lib/auth.js'
import { db } from './_lib/db.js'
import { body, error, json } from './_lib/http.js'

interface Incoming {
  day: string
  flow: number | null
  pain: number | null
  symptoms?: string[]
  note?: string | null
}

const DAY = /^\d{4}-\d{2}-\d{2}$/
const inRange = (v: unknown, max: number) => v === null || v === undefined || (Number.isInteger(v) && (v as number) >= 0 && (v as number) <= max)

export async function GET(req: Request) {
  const user = await requireCouple(req)
  if (user instanceof Response) return user
  const { rows } = await (await db()).execute({
    sql: 'select day, flow, pain, symptoms, note, updated_by, updated_at from day_logs where couple_id = ? order by day',
    args: [user.couple_id],
  })
  return json(rows.map((r) => ({ ...r, symptoms: JSON.parse(String(r.symptoms ?? '[]')) })))
}

export async function PUT(req: Request) {
  const user = await requireCouple(req)
  if (user instanceof Response) return user
  const items = await body<Incoming[]>(req)
  if (!Array.isArray(items) || !items.length || items.length > 400) return error('Données invalides')
  for (const l of items) if (!DAY.test(l.day) || !inRange(l.flow, 5) || !inRange(l.pain, 3)) return error(`Journée invalide : ${l.day}`)
  await (await db()).batch(
    items.map((l) => ({
      sql: `insert into day_logs (couple_id, day, flow, pain, symptoms, note, updated_by, updated_at)
            values (?, ?, ?, ?, ?, ?, ?, datetime('now'))
            on conflict (couple_id, day) do update set flow = excluded.flow, pain = excluded.pain,
              symptoms = excluded.symptoms, note = excluded.note, updated_by = excluded.updated_by, updated_at = excluded.updated_at`,
      args: [user.couple_id, l.day, l.flow ?? null, l.pain ?? null, JSON.stringify(l.symptoms ?? []), l.note ?? null, user.id],
    })),
    'write',
  )
  return json({ ok: true })
}

export async function DELETE(req: Request) {
  const user = await requireCouple(req)
  if (user instanceof Response) return user
  const day = new URL(req.url).searchParams.get('day') ?? ''
  if (!DAY.test(day)) return error('Jour invalide')
  await (await db()).execute({ sql: 'delete from day_logs where couple_id = ? and day = ?', args: [user.couple_id, day] })
  return json({ ok: true })
}
