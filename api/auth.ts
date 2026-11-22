// POST /api/auth  { action: 'signup' | 'login' | 'logout', email, password, name }
//                 { action: 'set_password', email, password }  nouveau mot de passe après une réinitialisation
//                 { action: 'reset_member', member_id }         réinitialiser le mot de passe d'un autre membre
// GET  /api/auth  -> { user, couple (avec ses espaces activés et ses cycles), members } (ou 401)
import { randomUUID } from 'node:crypto'
import { checkPassword, clearCookie, hashPassword, requireCouple, requireUser, sessionCookie } from './_lib/auth.js'
import { cyclesOf } from './_lib/cycles.js'
import { db } from './_lib/db.js'
import { parseModules } from '../shared/modules.js'
import { body, error, json } from './_lib/http.js'

export async function GET(req: Request) {
  const user = await requireUser(req)
  if (user instanceof Response) return user
  const conn = await db()
  let couple: Record<string, unknown> | null = null
  let members: unknown[] = []
  if (user.couple_id) {
    // Un seul aller-retour vers la base pour les deux lectures.
    const [c, m] = await conn.batch(
      [
        { sql: 'select * from couples where id = ?', args: [user.couple_id] },
        { sql: 'select id, display_name from users where couple_id = ?', args: [user.couple_id] },
      ],
      'read',
    )
    const row = c.rows[0]
    if (row) couple = { ...row, modules: parseModules(row.modules), cycles: await cyclesOf(conn, user.couple_id) }
    members = m.rows
  }
  return json({ user, couple, members })
}

export async function POST(req: Request) {
  const { action, email, password, name, member_id } = await body<{ action: string; email?: string; password?: string; name?: string; member_id?: string }>(req)
  if (action === 'logout') return json({ ok: true }, 200, { 'Set-Cookie': clearCookie })
  if (action === 'reset_member') return resetMember(req, member_id)

  const mail = email?.trim().toLowerCase()
  if (!mail) return error('E-mail et mot de passe requis')
  const conn = await db()

  if (action === 'signup') {
    if (!password) return error('E-mail et mot de passe requis')
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
    const { rows } = await conn.execute({ sql: 'select id, password_hash, password_reset, password_reset_by from users where email = ?', args: [mail] })
    const row = rows[0]
    // Mot de passe réinitialisé par l'autre : l'ancien ne compte plus, on en choisit un nouveau.
    if (row && Number(row.password_reset)) return json({ reset: true, by: row.password_reset_by ?? null })
    if (!password) return error('E-mail et mot de passe requis')
    if (!row || !checkPassword(password, String(row.password_hash))) return error('E-mail ou mot de passe incorrect', 401)
    return json({ ok: true }, 200, { 'Set-Cookie': sessionCookie(String(row.id)) })
  }

  if (action === 'set_password') {
    if (!password || password.length < 8) return error('Mot de passe : 8 caractères minimum')
    const { rows } = await conn.execute({ sql: 'select id from users where email = ? and password_reset = 1', args: [mail] })
    const row = rows[0]
    if (!row) return error('Ce compte n’attend pas de nouveau mot de passe. Connectez-vous normalement.', 403)
    // Les sessions d'avant restent fermées ; la nouvelle (créée dans la même seconde) est acceptée.
    await conn.execute({
      sql: 'update users set password_hash = ?, password_reset = 0, password_reset_by = null, sessions_since = ? where id = ?',
      args: [hashPassword(password), now(), String(row.id)],
    })
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

const now = () => Math.floor(Date.now() / 1000)

// Un membre de l'espace réinitialise le mot de passe d'un autre (oublié) : l'autre est déconnecté de
// partout et choisira lui-même son nouveau mot de passe à sa prochaine connexion.
async function resetMember(req: Request, memberId: string | undefined) {
  const user = await requireCouple(req)
  if (user instanceof Response) return user
  if (!memberId) return error('Membre requis')
  if (memberId === user.id) return error('Pour votre propre compte, utilisez votre mot de passe actuel')
  const res = await (await db()).execute({
    sql: 'update users set password_reset = 1, password_reset_by = ?, sessions_since = ? where id = ? and couple_id = ?',
    args: [user.display_name, now(), memberId, user.couple_id],
  })
  if (!res.rowsAffected) return error('Ce membre ne fait pas partie de votre espace', 404)
  return json({ ok: true })
}
