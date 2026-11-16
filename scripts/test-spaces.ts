// Espaces au choix et cycles multiples, sur une base SQLite locale :
//   npm run test:spaces
// Part d'une base « d'avant » (un seul cycle par espace, table day_logs) et vérifie que la migration
// ne perd rien, puis les nouveaux appels (cycles, espaces activés, rappels).
import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { createClient } from '@libsql/client'
import webpush from 'web-push'

const url = `file:${join(mkdtempSync(join(tmpdir(), 'spaces-')), 'test.db')}`
process.env.TURSO_DATABASE_URL = url
process.env.ACTIVITY_DEBOUNCE_MS = '0'
process.env.CRON_SECRET = 'cron'
const keys = webpush.generateVAPIDKeys()
process.env.VAPID_PUBLIC_KEY = keys.publicKey
process.env.VAPID_PRIVATE_KEY = keys.privateKey
process.env.VAPID_SUBJECT = 'mailto:test@example.com'

const errors: unknown[] = []
const consoleError = console.error
console.error = (...args: unknown[]) => {
  errors.push(args)
  consoleError(...args)
}

// Base telle qu'elle était avant cette version.
const old = createClient({ url })
await old.batch(
  [
    `create table couples (id text primary key, invite_code text not null unique, default_cycle_length integer not null default 28,
      iud_inserted_on text, created_at text not null default (datetime('now')))`,
    `create table users (id text primary key, email text not null unique collate nocase, password_hash text not null,
      display_name text not null default '', couple_id text references couples(id) on delete set null, created_at text not null default (datetime('now')))`,
    `create table day_logs (couple_id text not null references couples(id) on delete cascade, day text not null,
      flow integer check (flow between 0 and 5), pain integer check (pain between 0 and 3), symptoms text not null default '[]', note text,
      updated_by text, updated_at text not null default (datetime('now')), primary key (couple_id, day))`,
    `create table reminder_log (couple_id text not null, day text not null, kind text not null, primary key (couple_id, day))`,
    `insert into couples (id, invite_code, default_cycle_length, iud_inserted_on) values ('C1', 'ABC123', 30, '2026-03-01')`,
    `insert into users (id, email, password_hash, display_name, couple_id) values ('U1', 'a@x.fr', 'x:y', 'Mathis', 'C1'), ('U2', 'b@x.fr', 'x:y', 'Léa', 'C1'), ('U3', 'c@x.fr', 'x:y', 'Zoé', null)`,
    `insert into day_logs (couple_id, day, flow, pain, symptoms, note, updated_by) values
      ('C1', '2026-10-01', 4, 2, '["Crampes"]', 'dur', 'U2'), ('C1', '2026-10-02', 3, null, '[]', null, 'U2'), ('C1', '2026-10-03', 1, 0, '[]', null, 'U1')`,
    `insert into reminder_log (couple_id, day, kind) values ('C1', '2026-10-04', 'ended')`,
  ],
  'write',
)

const { sessionCookie } = await import('../api/_lib/auth.ts')
const auth = await import('../api/auth.ts')
const couple = await import('../api/couple.ts')
const logs = await import('../api/logs.ts')
const cycles = await import('../api/cycles.ts')
const cron = await import('../api/cron.ts')

const as = (user: string, path: string, method = 'GET', body?: unknown) =>
  new Request(`http://localhost/api/${path}`, {
    method,
    headers: { cookie: sessionCookie(user).split(';')[0], ...(body ? { 'content-type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  })
const read = async (res: Response) => ({ status: res.status, data: await res.json() })

test('migration : le cycle et les journées existants sont repris tels quels', async () => {
  const me = await read(await auth.GET(as('U1', 'auth')))
  assert.equal(me.status, 200)
  assert.equal(me.data.couple.modules, null) // espace d'avant : tous les espaces
  assert.deepEqual(me.data.couple.cycles, [{ id: 'C1', name: '', default_cycle_length: 30, iud_inserted_on: '2026-03-01' }])
  // Ancienne app (sans ?cycle) et nouvelle app voient les mêmes journées.
  const legacy = await read(await logs.GET(as('U1', 'logs')))
  const byCycle = await read(await logs.GET(as('U1', 'logs?cycle=C1')))
  assert.equal(legacy.data.length, 3)
  assert.deepEqual(byCycle.data, legacy.data)
  assert.deepEqual(legacy.data[0].symptoms, ['Crampes'])
  assert.equal(legacy.data[0].note, 'dur')
  // La table d'origine est gardée intacte, et la migration ne se rejoue pas.
  const conn = createClient({ url })
  assert.equal(Number((await conn.execute('select count(*) as n from day_logs')).rows[0].n), 3)
  assert.equal(Number((await conn.execute("select count(*) as n from cycle_reminders where cycle_id = 'C1'")).rows[0].n), 1)
  assert.equal((await conn.execute("select name from migrations")).rows.length, 1)
})

test("ancienne app : une saisie sans ?cycle va dans le premier cycle, les réglages aussi", async () => {
  assert.equal((await logs.PUT(as('U2', 'logs', 'PUT', [{ day: '2026-10-28', flow: 3, pain: 1 }]))).status, 200)
  const r = await read(await logs.GET(as('U1', 'logs?cycle=C1')))
  assert.equal(r.data.length, 4)
  const patched = await read(await couple.PATCH(as('U1', 'couple', 'PATCH', { default_cycle_length: 27 })))
  assert.equal(patched.data.cycles[0].default_cycle_length, 27)
})

let second = ''
test('ajouter, nommer et retirer un cycle', async () => {
  assert.equal((await cycles.POST(as('U1', 'cycles', 'POST', { name: '  ' }))).status, 400)
  const added = await read(await cycles.POST(as('U1', 'cycles', 'POST', { name: 'Camille' })))
  assert.equal(added.data.length, 2)
  assert.equal(added.data[0].id, 'C1') // le premier reste en tête
  second = added.data[1].id
  assert.equal(added.data[1].default_cycle_length, 27)
  assert.equal(added.data[1].iud_inserted_on, null)
  // Plusieurs cycles : chacun doit avoir un prénom.
  assert.equal((await cycles.PATCH(as('U1', 'cycles', 'PATCH', { id: 'C1', name: '' }))).status, 400)
  const named = await read(await cycles.PATCH(as('U1', 'cycles', 'PATCH', { id: 'C1', name: 'Léa' })))
  assert.equal(named.data[0].name, 'Léa')

  // Journées séparées par cycle.
  assert.equal((await logs.PUT(as('U1', `logs?cycle=${second}`, 'PUT', [{ day: '2026-10-28', flow: 2, pain: 0 }]))).status, 200)
  assert.equal((await read(await logs.GET(as('U1', `logs?cycle=${second}`)))).data.length, 1)
  assert.equal((await read(await logs.GET(as('U1', 'logs?cycle=C1')))).data.length, 4)
  assert.equal((await logs.DELETE(as('U1', `logs?cycle=${second}&day=2026-10-28`, 'DELETE'))).status, 200)
  assert.equal((await read(await logs.GET(as('U1', `logs?cycle=${second}`)))).data.length, 0)
  assert.equal((await read(await logs.GET(as('U1', 'logs?cycle=C1')))).data.length, 4)
})

test("on ne touche pas au cycle d'un autre espace", async () => {
  const other = await read(await couple.POST(as('U3', 'couple', 'POST', { action: 'create', modules: ['groceries', 'inconnu'] })))
  assert.equal(other.status, 200)
  const me = await read(await auth.GET(as('U3', 'auth')))
  assert.deepEqual(me.data.couple.modules, ['groceries'])
  assert.equal(me.data.couple.cycles.length, 1)
  assert.equal(me.data.couple.cycles[0].id, me.data.couple.id)
  assert.equal((await logs.GET(as('U3', 'logs?cycle=C1'))).status, 404)
  assert.equal((await cycles.PATCH(as('U3', 'cycles', 'PATCH', { id: second, name: 'X' }))).status, 404)
  assert.equal((await cycles.DELETE(as('U3', `cycles?id=${second}`, 'DELETE'))).status, 404)
})

test('espaces activés', async () => {
  assert.equal((await couple.PATCH(as('U1', 'couple', 'PATCH', { modules: [] }))).status, 400)
  const r = await read(await couple.PATCH(as('U1', 'couple', 'PATCH', { modules: ['sport', 'cycle'] })))
  assert.deepEqual(r.data.modules, ['cycle', 'sport'])
})

test('rappels : un par cycle, avec le prénom', async () => {
  const res = await read(await cron.GET(new Request('http://localhost/api/cron', { headers: { authorization: 'Bearer cron' } })))
  assert.equal(res.status, 200)
  // L'espace sans le suivi des règles (U3) n'a pas de rappel ; les deux cycles de C1 sont évalués.
  for (const r of res.data.report) assert.ok(['C1', second].includes(r.cycle))
})

test('retirer un cycle efface ses journées ; le dernier reste', async () => {
  const left = await read(await cycles.DELETE(as('U1', `cycles?id=${second}`, 'DELETE')))
  assert.equal(left.data.length, 1)
  assert.equal((await cycles.DELETE(as('U1', 'cycles?id=C1', 'DELETE'))).status, 400)
  assert.equal((await logs.GET(as('U1', `logs?cycle=${second}`))).status, 404)
  await new Promise((r) => setTimeout(r, 300)) // notifications d'activité (sans attente ici)
  assert.deepEqual(errors, [])
})
