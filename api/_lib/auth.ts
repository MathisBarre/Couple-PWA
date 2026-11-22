// Authentification minimale : mot de passe haché (scrypt) + cookie de session signé (HMAC).
import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import { db } from './db.js'
import { error, json } from './http.js'

const COOKIE = 'session'
const MAX_AGE = 60 * 60 * 24 * 365 // 1 an : on reste connecté sur son téléphone

function secret() {
  const s = process.env.AUTH_SECRET
  if (!s && process.env.VERCEL) throw new Error('AUTH_SECRET manquant')
  return s ?? 'dev-secret'
}

export function hashPassword(password: string) {
  const salt = randomBytes(16).toString('hex')
  return `${salt}:${scryptSync(password, salt, 64).toString('hex')}`
}

export function checkPassword(password: string, stored: string) {
  const [salt, hash] = stored.split(':')
  const a = Buffer.from(hash, 'hex')
  const b = scryptSync(password, salt, 64)
  return a.length === b.length && timingSafeEqual(a, b)
}

const sign = (v: string) => createHmac('sha256', secret()).update(v).digest('base64url')

export function sessionCookie(userId: string) {
  const exp = Math.floor(Date.now() / 1000) + MAX_AGE
  const value = `${userId}.${exp}`
  return `${COOKIE}=${value}.${sign(value)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${MAX_AGE}`
}

export const clearCookie = `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`

/** Code d'erreur (401) quand le mot de passe du compte a été réinitialisé par un autre membre. */
export const PASSWORD_RESET = 'password_reset'

function sessionFrom(req: Request): { id: string; issued: number } | null {
  const raw = req.headers
    .get('cookie')
    ?.split(/;\s*/)
    .find((c) => c.startsWith(`${COOKIE}=`))
    ?.slice(COOKIE.length + 1)
  if (!raw) return null
  const [id, exp, sig] = raw.split('.')
  if (!id || !exp || !sig) return null
  const expected = sign(`${id}.${exp}`)
  if (sig.length !== expected.length || !timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null
  if (Number(exp) < Date.now() / 1000) return null
  // Le cookie dure MAX_AGE : son heure de création s'en déduit (pas besoin de changer son format).
  return { id, issued: Number(exp) - MAX_AGE }
}

export interface User {
  id: string
  email: string
  display_name: string
  couple_id: string | null
}

/** Utilisateur connecté, ou une réponse 401 à renvoyer telle quelle. */
export async function requireUser(req: Request): Promise<User | Response> {
  const session = sessionFrom(req)
  if (!session) return error('Non connecté', 401)
  const { rows } = await (await db()).execute({
    sql: 'select id, email, display_name, couple_id, password_reset, sessions_since from users where id = ?',
    args: [session.id],
  })
  const row = rows[0]
  if (!row) return error('Non connecté', 401)
  if (Number(row.password_reset)) return json({ error: 'Votre mot de passe a été réinitialisé', code: PASSWORD_RESET }, 401)
  if (row.sessions_since != null && session.issued < Number(row.sessions_since)) return error('Non connecté', 401)
  return { id: String(row.id), email: String(row.email), display_name: String(row.display_name), couple_id: (row.couple_id as string | null) ?? null }
}

/** Même chose, mais exige aussi d'appartenir à un couple. */
export async function requireCouple(req: Request): Promise<(User & { couple_id: string }) | Response> {
  const user = await requireUser(req)
  if (user instanceof Response) return user
  if (!user.couple_id) return error('Aucun espace de couple', 403)
  return user as User & { couple_id: string }
}
