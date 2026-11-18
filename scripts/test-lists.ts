// Espace « Listes » (courses + choses à faire), sur une base SQLite locale :
//   npm run test:lists
// Les deux listes partagent la table et la fonction, mais restent séparées ; chacune a sa notification.
import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { createClient } from '@libsql/client'

const url = `file:${join(mkdtempSync(join(tmpdir(), 'lists-')), 'test.db')}`
process.env.TURSO_DATABASE_URL = url
process.env.ACTIVITY_DEBOUNCE_MS = '0'

const { db } = await import('../api/_lib/db.ts')
const conn = await db()
await conn.batch(
  [
    `insert into couples (id, invite_code) values ('C1', 'ABC123')`,
    `insert into users (id, email, password_hash, display_name, couple_id) values ('U1', 'a@x.fr', 'x:y', 'Mathis', 'C1'), ('U2', 'b@x.fr', 'x:y', 'Léa', 'C1')`,
  ],
  'write',
)
const { sessionCookie } = await import('../api/_lib/auth.ts')
const groceries = await import('../api/groceries.ts')
const { todoMessage } = await import('../api/_lib/activity.ts')

const as = (user: string, method: 'GET' | 'POST', query = '', body?: unknown) =>
  new Request(`https://a-deux.test/api/groceries${query}`, {
    method,
    headers: { cookie: sessionCookie(user).split(';')[0], ...(body ? { 'content-type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  })
const call = async (req: Request) => {
  const res = await (req.method === 'GET' ? groceries.GET(req) : groceries.POST(req))
  return { status: res.status, data: await res.json() }
}
const kinds = async () => (await createClient({ url }).execute('select kind from activity_events order by id')).rows.map((r) => r.kind)

test('courses et choses à faire : deux listes séparées, chacune sa notification', async () => {
  await call(as('U1', 'POST', '', { ops: [{ op: 'add', id: 'item-lait-01', name: 'Lait' }] }))
  const todo = await call(as('U1', 'POST', '?list=todo', { ops: [{ op: 'add', id: 'todo-garage-1', name: 'Appeler le garage, pour le pneu' }] }))
  assert.equal(todo.status, 200)
  assert.deepEqual(todo.data.map((i: { name: string }) => i.name), ['Appeler le garage, pour le pneu'])

  // Sans paramètre (anciennes versions de l'app) : seulement les courses.
  assert.deepEqual((await call(as('U2', 'GET'))).data.map((i: { name: string }) => i.name), ['Lait'])
  assert.deepEqual((await call(as('U2', 'GET', '?list=todo'))).data.map((i: { id: string }) => i.id), ['todo-garage-1'])

  // Une coche envoyée sur l'autre liste ne touche à rien.
  await call(as('U2', 'POST', '?list=todo', { ops: [{ op: 'check', id: 'item-lait-01', done: true }] }))
  assert.equal((await call(as('U2', 'GET'))).data[0].done, false)
  await call(as('U2', 'POST', '?list=todo', { ops: [{ op: 'check', id: 'todo-garage-1', done: true }] }))
  assert.equal((await call(as('U1', 'GET', '?list=todo'))).data[0].done, true)

  await new Promise((r) => setTimeout(r, 30))
  assert.deepEqual(await kinds(), ['groceries', 'todo', 'todo'])
  assert.equal((await call(as('U1', 'GET', '?list=nope'))).status, 400)
})

test('notification des choses à faire', () => {
  const added = todoMessage('Léa', [{ added: ['Appeler le garage'] }])
  assert.equal(added?.title, '✅ Léa a ajouté une chose à faire')
  assert.equal(added?.body, 'Appeler le garage')
  assert.equal(added?.url, '/?open=groceries&list=todo')
  assert.equal(todoMessage('Léa', [{ checked: 2 }])?.title, '✅ Léa a fait 2 choses de la liste')
  assert.equal(todoMessage('Léa', [{}]), null)
})
