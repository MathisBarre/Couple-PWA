// GET    /api/logs?cycle=…           -> toutes les journées d'un cycle de l'espace
// PUT    /api/logs?cycle=…  [DayLog] -> enregistre (ou remplace) une ou plusieurs journées
// DELETE /api/logs?cycle=…&day=…     -> efface une journée
// Sans `cycle` (app d'avant les cycles multiples) : le premier cycle de l'espace.
import { requireCouple, type User } from './_lib/auth.js'
import { cycleFor } from './_lib/cycles.js'
import { db } from './_lib/db.js'
import { body, error, json } from './_lib/http.js'
import { notifyActivity } from './_lib/activity.js'

interface Incoming {
  day: string
  flow: number | null
  pain: number | null
  symptoms?: string[]
  note?: string | null
}

const DAY = /^\d{4}-\d{2}-\d{2}$/
const inRange = (v: unknown, max: number) => v === null || v === undefined || (Number.isInteger(v) && (v as number) >= 0 && (v as number) <= max)

/** Utilisateur et cycle visé, ou la réponse d'erreur à renvoyer. */
async function target(req: Request): Promise<{ user: User & { couple_id: string }; cycle: string } | Response> {
  const user = await requireCouple(req)
  if (user instanceof Response) return user
  const cycle = await cycleFor(await db(), user.couple_id, new URL(req.url).searchParams.get('cycle'))
  if (!cycle) return error('Ce cycle n’est plus suivi', 404)
  return { user, cycle }
}

export async function GET(req: Request) {
  const t = await target(req)
  if (t instanceof Response) return t
  const { rows } = await (await db()).execute({
    sql: 'select day, flow, pain, symptoms, note, updated_by, updated_at from cycle_logs where cycle_id = ? order by day',
    args: [t.cycle],
  })
  return json(rows.map((r) => ({ ...r, symptoms: JSON.parse(String(r.symptoms ?? '[]')) })))
}

export async function PUT(req: Request) {
  const t = await target(req)
  if (t instanceof Response) return t
  const { user, cycle } = t
  const items = await body<Incoming[]>(req)
  if (!Array.isArray(items) || !items.length || items.length > 400) return error('Données invalides')
  for (const l of items) if (!DAY.test(l.day) || !inRange(l.flow, 5) || !inRange(l.pain, 3)) return error(`Journée invalide : ${l.day}`)
  await (await db()).batch(
    items.map((l) => ({
      sql: `insert into cycle_logs (cycle_id, day, flow, pain, symptoms, note, updated_by, updated_at)
            values (?, ?, ?, ?, ?, ?, ?, datetime('now'))
            on conflict (cycle_id, day) do update set flow = excluded.flow, pain = excluded.pain,
              symptoms = excluded.symptoms, note = excluded.note, updated_by = excluded.updated_by, updated_at = excluded.updated_at`,
      args: [cycle, l.day, l.flow ?? null, l.pain ?? null, JSON.stringify(l.symptoms ?? []), l.note ?? null, user.id],
    })),
    'write',
  )
  notifyActivity(user, { kind: 'cycle', data: { cycle, saved: [...new Set(items.map((l) => l.day))] } })
  return json({ ok: true })
}

export async function DELETE(req: Request) {
  const t = await target(req)
  if (t instanceof Response) return t
  const { user, cycle } = t
  const day = new URL(req.url).searchParams.get('day') ?? ''
  if (!DAY.test(day)) return error('Jour invalide')
  const res = await (await db()).execute({ sql: 'delete from cycle_logs where cycle_id = ? and day = ?', args: [cycle, day] })
  if (res.rowsAffected) notifyActivity(user, { kind: 'cycle', data: { cycle, deleted: [day] } })
  return json({ ok: true })
}
