// Cycles suivis dans l'espace (un par personne : couple de femmes, sœurs…).
// POST   /api/cycles { name }                                            -> ajoute un cycle
// PATCH  /api/cycles { id, name?, default_cycle_length?, iud_inserted_on? } -> le modifie
// DELETE /api/cycles?id=…                                                -> le retire, avec ses journées
// Chaque réponse renvoie la liste à jour.
import { randomUUID } from 'node:crypto'
import { requireCouple } from './_lib/auth.js'
import { cycleFor, cyclesOf } from './_lib/cycles.js'
import { db } from './_lib/db.js'
import { body, error, json } from './_lib/http.js'

const MAX = 12
const cleanName = (v: unknown) => (typeof v === 'string' ? v.trim().slice(0, 40) : '')

export async function POST(req: Request) {
  const user = await requireCouple(req)
  if (user instanceof Response) return user
  const { name } = await body<{ name?: string }>(req)
  const n = cleanName(name)
  if (!n) return error('Prénom requis')
  const conn = await db()
  const cycles = await cyclesOf(conn, user.couple_id)
  if (cycles.length >= MAX) return error(`${MAX} cycles au maximum`)
  // Mêmes réglages de départ que le premier cycle, sauf le stérilet (propre à chacune).
  await conn.execute({
    sql: 'insert into cycles (id, couple_id, name, default_cycle_length) values (?, ?, ?, ?)',
    args: [randomUUID(), user.couple_id, n, cycles[0]?.default_cycle_length ?? 28],
  })
  return json(await cyclesOf(conn, user.couple_id))
}

export async function PATCH(req: Request) {
  const user = await requireCouple(req)
  if (user instanceof Response) return user
  const patch = await body<{ id?: string; name?: string; default_cycle_length?: number; iud_inserted_on?: string | null }>(req)
  const conn = await db()
  const id = await cycleFor(conn, user.couple_id, patch.id ?? '')
  if (!id) return error('Cycle introuvable', 404)
  if (patch.name !== undefined) {
    const n = cleanName(patch.name)
    // Sans prénom, seulement s'il est seul (l'app affiche alors simplement « Cycle »).
    if (!n && (await cyclesOf(conn, user.couple_id)).length > 1) return error('Prénom requis')
    await conn.execute({ sql: 'update cycles set name = ? where id = ?', args: [n, id] })
  }
  if (patch.default_cycle_length !== undefined) {
    const n = Number(patch.default_cycle_length)
    if (!(n >= 15 && n <= 60)) return error('Durée de cycle invalide')
    await conn.execute({ sql: 'update cycles set default_cycle_length = ? where id = ?', args: [n, id] })
  }
  if (patch.iud_inserted_on !== undefined) {
    const d = patch.iud_inserted_on
    if (d !== null && !/^\d{4}-\d{2}-\d{2}$/.test(d)) return error('Date invalide')
    await conn.execute({ sql: 'update cycles set iud_inserted_on = ? where id = ?', args: [d, id] })
  }
  return json(await cyclesOf(conn, user.couple_id))
}

export async function DELETE(req: Request) {
  const user = await requireCouple(req)
  if (user instanceof Response) return user
  const conn = await db()
  const id = await cycleFor(conn, user.couple_id, new URL(req.url).searchParams.get('id') ?? '')
  if (!id) return error('Cycle introuvable', 404)
  if ((await cyclesOf(conn, user.couple_id)).length <= 1) return error('Il faut garder au moins un cycle')
  await conn.batch(
    [
      { sql: 'delete from cycle_logs where cycle_id = ?', args: [id] },
      { sql: 'delete from cycle_reminders where cycle_id = ?', args: [id] },
      { sql: 'delete from cycles where id = ?', args: [id] },
    ],
    'write',
  )
  return json(await cyclesOf(conn, user.couple_id))
}
