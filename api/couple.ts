// POST  /api/couple { action: 'create', modules? } | { action: 'join', code }
// PATCH /api/couple { modules? } (espaces activés)
//                   { default_cycle_length?, iud_inserted_on? } : réglages du premier cycle (app d'avant
//                   les cycles multiples ; désormais /api/cycles)
import { randomBytes, randomUUID } from 'node:crypto'
import { requireCouple, requireUser } from './_lib/auth.js'
import { db } from './_lib/db.js'
import { body, error, json } from './_lib/http.js'
import { cleanModules, parseModules } from '../shared/modules.js'
import { cyclesOf } from './_lib/cycles.js'

export async function POST(req: Request) {
  const user = await requireUser(req)
  if (user instanceof Response) return user
  const { action, code, modules } = await body<{ action: string; code?: string; modules?: unknown }>(req)
  const conn = await db()

  if (action === 'create') {
    const id = randomUUID()
    const invite = randomBytes(3).toString('hex').toUpperCase()
    await conn.batch(
      [
        // Espaces choisis à la création ; rien de précisé (ancienne app) = tous.
        { sql: 'insert into couples (id, invite_code, modules) values (?, ?, ?)', args: [id, invite, modules === undefined ? null : JSON.stringify(cleanModules(modules) ?? [])] },
        // Premier cycle suivi : même id que l'espace.
        { sql: 'insert into cycles (id, couple_id) values (?, ?)', args: [id, id] },
        { sql: 'update users set couple_id = ? where id = ?', args: [id, user.id] },
      ],
      'write',
    )
    return json({ ok: true })
  }

  if (action === 'join') {
    const { rows } = await conn.execute({ sql: 'select id from couples where invite_code = ?', args: [code?.trim().toUpperCase() ?? ''] })
    const couple = rows[0]
    if (!couple) return error('Code invalide')
    const count = await conn.execute({ sql: 'select count(*) as n from users where couple_id = ?', args: [couple.id] })
    if (Number(count.rows[0].n) >= 2) return error('Cet espace a déjà deux membres')
    await conn.execute({ sql: 'update users set couple_id = ? where id = ?', args: [couple.id, user.id] })
    return json({ ok: true })
  }

  return error('Action inconnue')
}

export async function PATCH(req: Request) {
  const user = await requireCouple(req)
  if (user instanceof Response) return user
  const patch = await body<{ default_cycle_length?: number; iud_inserted_on?: string | null; modules?: unknown }>(req)
  const conn = await db()
  if (patch.modules !== undefined) {
    const list = cleanModules(patch.modules)
    if (!list) return error('Gardez au moins un espace')
    await conn.execute({ sql: 'update couples set modules = ? where id = ?', args: [JSON.stringify(list), user.couple_id] })
  }
  const first = (await cyclesOf(conn, user.couple_id))[0]
  if (patch.default_cycle_length !== undefined) {
    const n = Number(patch.default_cycle_length)
    if (!(n >= 15 && n <= 60)) return error('Durée de cycle invalide')
    await conn.execute({ sql: 'update cycles set default_cycle_length = ? where id = ?', args: [n, first.id] })
  }
  if (patch.iud_inserted_on !== undefined) {
    const d = patch.iud_inserted_on
    if (d !== null && !/^\d{4}-\d{2}-\d{2}$/.test(d)) return error('Date invalide')
    await conn.execute({ sql: 'update cycles set iud_inserted_on = ? where id = ?', args: [d, first.id] })
  }
  const { rows } = await conn.execute({ sql: 'select * from couples where id = ?', args: [user.couple_id] })
  return json({ ...rows[0], modules: parseModules(rows[0].modules), cycles: await cyclesOf(conn, user.couple_id) })
}
