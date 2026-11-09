// POST /api/auth  { action: 'signup' | 'login' | 'logout', email, password, name }
// GET  /api/auth  -> { user, couple, members } (ou 401)
import { randomUUID } from 'node:crypto'
import { checkPassword, clearCookie, hashPassword, requireUser, sessionCookie } from './_lib/auth.js'
import { db } from './_lib/db.js'
import { body, error, json } from './_lib/http.js'

export async function GET(req: Request) {
  const user = await requireUser(req)
  if (user instanceof Response) return user
  const conn = await db()
  let couple = null
  let members: unknown[] = []
  if (user.couple_id) {
    couple = (await conn.execute({ sql: 'select * from couples where id = ?', args: [user.couple_id] })).rows[0] ?? null
    members = (await conn.execute({ sql: 'select id, display_name from users where couple_id = ?', args: [user.couple_id] })).rows
  }
  return json({ user, couple, members })
}

export async function POST(req: Request) {
  const { action, email, password, name } = await body<{ action: string; email?: string; password?: string; name?: string }>(req)
  if (action === 'logout') return json({ ok: true }, 200, { 'Set-Cookie': clearCookie })

  const mail = email?.trim().toLowerCase()
  if (!mail || !password) return error('E-mail et mot de passe requis')
  const conn = await db()

  if (action === 'signup') {
    if (password.length < 8) return error('Mot de passe : 8 caractères minimum')
    const exists = await conn.execute({ sql: 'select 1 from users where email = ?', args: [mail] })
    if (exists.rows.length) return error('Un compte existe déjà avec cet e-mail')
    const id = randomUUID()
    await conn.execute({
      sql: 'insert into users (id, email, password_hash, display_name) values (?, ?, ?, ?)',
      args: [id, mail, hashPassword(password), name?.trim() || mail.split('@')[0]],
    })
    return json({ ok: true }, 200, { 'Set-Cookie': sessionCookie(id) })
  }

  if (action === 'login') {
    const { rows } = await conn.execute({ sql: 'select id, password_hash from users where email = ?', args: [mail] })
    const row = rows[0]
    if (!row || !checkPassword(password, String(row.password_hash))) return error('E-mail ou mot de passe incorrect', 401)
    return json({ ok: true }, 200, { 'Set-Cookie': sessionCookie(String(row.id)) })
  }

  return error('Action inconnue')
}

// Modifier son prénom.
export async function PATCH(req: Request) {
  const user = await requireUser(req)
  if (user instanceof Response) return user
  const { display_name } = await body<{ display_name?: string }>(req)
  if (!display_name?.trim()) return error('Prénom requis')
  await (await db()).execute({ sql: 'update users set display_name = ? where id = ?', args: [display_name.trim(), user.id] })
  return json({ ok: true })
}
