// POST  /api/couple { action: 'create' } | { action: 'join', code }
// PATCH /api/couple { default_cycle_length?, iud_inserted_on? }
import { randomBytes, randomUUID } from 'node:crypto'
import { requireCouple, requireUser } from './_lib/auth.js'
import { db } from './_lib/db.js'
import { body, error, json } from './_lib/http.js'

export async function POST(req: Request) {
  const user = await requireUser(req)
  if (user instanceof Response) return user
  const { action, code } = await body<{ action: string; code?: string }>(req)
  const conn = await db()

  if (action === 'create') {
    const id = randomUUID()
    const invite = randomBytes(3).toString('hex').toUpperCase()
    await conn.batch(
      [
        { sql: 'insert into couples (id, invite_code) values (?, ?)', args: [id, invite] },
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
  const patch = await body<{ default_cycle_length?: number; iud_inserted_on?: string | null }>(req)
  const conn = await db()
  if (patch.default_cycle_length !== undefined) {
    const n = Number(patch.default_cycle_length)
    if (!(n >= 15 && n <= 60)) return error('Durée de cycle invalide')
    await conn.execute({ sql: 'update couples set default_cycle_length = ? where id = ?', args: [n, user.couple_id] })
  }
  if (patch.iud_inserted_on !== undefined) {
    const d = patch.iud_inserted_on
    if (d !== null && !/^\d{4}-\d{2}-\d{2}$/.test(d)) return error('Date invalide')
    await conn.execute({ sql: 'update couples set iud_inserted_on = ? where id = ?', args: [d, user.couple_id] })
  }
  const { rows } = await conn.execute({ sql: 'select * from couples where id = ?', args: [user.couple_id] })
  return json(rows[0])
}
