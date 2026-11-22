// Réinitialisation du mot de passe par un autre membre de l'espace, sur une base SQLite locale :
//   npm run test:password
import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

process.env.TURSO_DATABASE_URL = `file:${join(mkdtempSync(join(tmpdir(), 'pwd-')), 'test.db')}`

const { db } = await import('../api/_lib/db.ts')
const { hashPassword, sessionCookie } = await import('../api/_lib/auth.ts')
const auth = await import('../api/auth.ts')
const conn = await db()
await conn.batch(
  [
    `insert into couples (id, invite_code) values ('C1', 'ABC123'), ('C2', 'XYZ789')`,
    {
      sql: `insert into users (id, email, password_hash, display_name, couple_id) values ('U1', 'a@x.fr', ?, 'Mathis', 'C1'), ('U2', 'b@x.fr', ?, 'Léa', 'C1'), ('U3', 'c@x.fr', ?, 'Autre', 'C2')`,
      args: [hashPassword('motdepasse1'), hashPassword('ancienmdp2'), hashPassword('motdepasse3')],
    },
  ],
  'write',
)

const cookieOf = (user: string) => sessionCookie(user).split(';')[0]
const req = (method: 'GET' | 'POST', body?: unknown, cookie?: string) =>
  new Request('https://a-deux.test/api/auth', {
    method,
    headers: { ...(cookie ? { cookie } : {}), ...(body ? { 'content-type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  })
const call = async (r: Request) => {
  const res = await (r.method === 'GET' ? auth.GET(r) : auth.POST(r))
  return { status: res.status, data: await res.json(), cookie: res.headers.get('set-cookie')?.split(';')[0] }
}

test('un membre réinitialise le mot de passe de l’autre, qui en choisit un nouveau', async () => {
  // Session ouverte un peu avant (pas dans la même seconde que la réinitialisation).
  const realNow = Date.now
  Date.now = () => realNow() - 10_000
  const oldSession = cookieOf('U2')
  Date.now = realNow
  assert.equal((await call(req('GET', undefined, oldSession))).status, 200)

  // Personne d'un autre espace, ni soi-même.
  assert.equal((await call(req('POST', { action: 'reset_member', member_id: 'U2' }, cookieOf('U3')))).status, 404)
  assert.equal((await call(req('POST', { action: 'reset_member', member_id: 'U1' }, cookieOf('U1')))).status, 400)
  assert.equal((await call(req('POST', { action: 'reset_member', member_id: 'U2' }))).status, 401)

  assert.equal((await call(req('POST', { action: 'reset_member', member_id: 'U2' }, cookieOf('U1')))).status, 200)

  // Déconnectée partout, avec un code pour l'expliquer.
  const kicked = await call(req('GET', undefined, oldSession))
  assert.equal(kicked.status, 401)
  assert.equal(kicked.data.code, 'password_reset')

  // L'ancien mot de passe ne suffit plus : l'écran propose d'en choisir un nouveau.
  const login = await call(req('POST', { action: 'login', email: 'B@x.fr', password: 'ancienmdp2' }))
  assert.deepEqual(login.data, { reset: true, by: 'Mathis' })
  // Mot de passe oublié : l'e-mail seul suffit pour arriver à l'écran du nouveau mot de passe.
  assert.deepEqual((await call(req('POST', { action: 'login', email: 'b@x.fr' }))).data, { reset: true, by: 'Mathis' })
  assert.equal(login.cookie, undefined)

  assert.equal((await call(req('POST', { action: 'set_password', email: 'b@x.fr', password: 'court' }))).status, 400)
  const set = await call(req('POST', { action: 'set_password', email: 'b@x.fr', password: 'nouveaumdp' }))
  assert.equal(set.status, 200)
  assert.ok(set.cookie)
  assert.equal((await call(req('GET', undefined, set.cookie))).data.user.id, 'U2')

  // Une fois choisi : plus de réinitialisation possible sans l'autre, ancien mot de passe refusé, nouveau accepté.
  assert.equal((await call(req('POST', { action: 'set_password', email: 'b@x.fr', password: 'piratage1' }))).status, 403)
  assert.equal((await call(req('POST', { action: 'login', email: 'b@x.fr', password: 'ancienmdp2' }))).status, 401)
  assert.equal((await call(req('POST', { action: 'login', email: 'b@x.fr', password: 'nouveaumdp' }))).status, 200)
  // Les sessions d'avant la réinitialisation restent fermées.
  assert.equal((await call(req('GET', undefined, oldSession))).status, 401)
  // Celui qui a réinitialisé reste connecté.
  assert.equal((await call(req('GET', undefined, cookieOf('U1')))).status, 200)

  assert.equal((await call(req('POST', { action: 'login', email: 'a@x.fr' }))).status, 400)
  // Compte jamais réinitialisé : set_password refusé.
  assert.equal((await call(req('POST', { action: 'set_password', email: 'a@x.fr', password: 'piratage1' }))).status, 403)
})
