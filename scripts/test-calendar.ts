// Calendrier commun, sur une base SQLite locale :
//   npm run test:calendar
// Ajout / modification / suppression (rejouables), notifications à l'autre, flux iCalendar d'abonnement.
import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { createClient } from '@libsql/client'
import webpush from 'web-push'

const url = `file:${join(mkdtempSync(join(tmpdir(), 'calendar-')), 'test.db')}`
process.env.TURSO_DATABASE_URL = url
process.env.ACTIVITY_DEBOUNCE_MS = '0'
const keys = webpush.generateVAPIDKeys()
process.env.VAPID_PUBLIC_KEY = keys.publicKey
process.env.VAPID_PRIVATE_KEY = keys.privateKey

const { db } = await import('../api/_lib/db.ts')
const conn = await db()
await conn.batch(
  [
    `insert into couples (id, invite_code) values ('C1', 'ABC123'), ('C2', 'XYZ789')`,
    `insert into users (id, email, password_hash, display_name, couple_id) values ('U1', 'a@x.fr', 'x:y', 'Mathis', 'C1'), ('U2', 'b@x.fr', 'x:y', 'Léa', 'C1'), ('U3', 'c@x.fr', 'x:y', 'Zoé', 'C2')`,
  ],
  'write',
)

const { sessionCookie } = await import('../api/_lib/auth.ts')
const calendar = await import('../api/calendar.ts')
const { calendarMessage } = await import('../api/_lib/activity.ts')
const { cleanEvent, toICS, zonedToUtc } = await import('../shared/calendar.ts')

const as = (user: string, method = 'GET', body?: unknown, query = '') =>
  new Request(`https://a-deux.test/api/calendar${query}`, {
    method,
    headers: { cookie: sessionCookie(user).split(';')[0], ...(body ? { 'content-type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  })
const read = async (res: Response) => ({ status: res.status, data: await res.json() })
const events = async () => (await createClient({ url }).execute("select * from activity_events where kind = 'calendar' order by id")).rows.map((r) => JSON.parse(String(r.payload)))

const dinner = { id: 'evt-dinner-1', title: '  Dîner chez Paul ', start_day: '2026-11-21', end_day: '2026-11-21', start_time: '20:30', end_time: '23:00', location: 'Paris 11e', note: null }
const trip = { id: 'evt-trip-0001', title: 'Vacances', start_day: '2026-12-24', end_day: '2026-12-28', start_time: null, end_time: null, location: null, note: 'Chez mes parents\nCode : 1234; porte B' }

test('ajout, modification, suppression : rejouables, et seule la vraie nouveauté est notifiée', async () => {
  let res = await read(await calendar.POST(as('U1', 'POST', { ops: [{ op: 'put', event: dinner }, { op: 'put', event: trip }] })))
  assert.equal(res.status, 200)
  assert.equal(res.data.events.length, 2)
  assert.equal(res.data.events[0].title, 'Dîner chez Paul')
  assert.equal(res.data.events[0].created_by, 'U1')
  assert.match(res.data.feed, /^[\w-]{20,}$/)
  await new Promise((r) => setTimeout(r, 30))
  let recorded = await events()
  assert.equal(recorded.length, 1)
  assert.deepEqual(recorded[0].added.map((e: { title: string }) => e.title), ['Dîner chez Paul', 'Vacances'])

  // Le même envoi rejoué (file d'attente hors ligne) : rien ne change, rien n'est notifié.
  await calendar.POST(as('U1', 'POST', { ops: [{ op: 'put', event: dinner }] }))
  await new Promise((r) => setTimeout(r, 30))
  assert.equal((await events()).length, 1)

  // L'autre modifie, puis supprime.
  res = await read(await calendar.POST(as('U2', 'POST', { ops: [{ op: 'put', event: { ...dinner, start_time: '21:00' } }] })))
  assert.equal(res.data.events.find((e: { id: string }) => e.id === dinner.id).updated_by, 'U2')
  res = await read(await calendar.POST(as('U2', 'POST', { ops: [{ op: 'delete', id: trip.id }, { op: 'delete', id: trip.id }] })))
  assert.equal(res.data.events.length, 1)
  await new Promise((r) => setTimeout(r, 30))
  recorded = await events()
  assert.equal(recorded.length, 3)
  assert.equal(recorded[1].updated[0].start_time, '21:00')
  assert.equal(recorded[2].deleted.length, 1)

  // Un autre espace ne voit rien et ne peut pas réécrire l'événement.
  const other = await read(await calendar.GET(as('U3')))
  assert.equal(other.data.events.length, 0)
  await calendar.POST(as('U3', 'POST', { ops: [{ op: 'put', event: { ...dinner, title: 'Piraté' } }] }))
  const mine = await read(await calendar.GET(as('U1')))
  assert.equal(mine.data.events[0].title, 'Dîner chez Paul')
})

test('saisies invalides refusées', async () => {
  for (const bad of [{ ...dinner, title: ' ' }, { ...dinner, start_day: '2026-02-30' }, { ...dinner, end_day: '2026-11-20' }, { ...dinner, start_time: '25:00' }, { ...dinner, end_time: '19:00' }]) {
    const res = await calendar.POST(as('U1', 'POST', { ops: [{ op: 'put', event: bad }] }))
    assert.equal(res.status, 400, JSON.stringify(bad))
  }
  assert.equal(typeof cleanEvent({ ...trip, start_time: null, end_time: '10:00' }), 'object')
  assert.equal((cleanEvent({ ...trip, end_time: '10:00' }) as { end_time: unknown }).end_time, null)
})

test('messages de notification', () => {
  const t = '2026-11-20'
  assert.deepEqual(calendarMessage('Léa', [{ added: [{ id: 'a', title: 'Ciné', start_day: '2026-11-21', end_day: '2026-11-21', start_time: '20:30' }] }], t), {
    title: '📆 Léa a ajouté « Ciné »',
    body: 'Demain · 20h30',
    url: '/?open=calendar',
  })
  // Ajouté puis modifié = ajouté ; ajouté puis supprimé = rien.
  const a = { id: 'a', title: 'Ciné', start_day: '2026-11-21', end_day: '2026-11-21', start_time: null }
  assert.equal(calendarMessage('Léa', [{ added: [a] }, { updated: [{ ...a, title: 'Cinéma' }] }], t)?.title, '📆 Léa a ajouté « Cinéma »')
  assert.equal(calendarMessage('Léa', [{ added: [a] }, { deleted: [a] }], t), null)
  assert.equal(calendarMessage('Léa', [{ deleted: [{ ...a, start_day: '2026-12-24', end_day: '2026-12-28' }] }], t)?.body, 'Du 24 déc. au 28 déc.')
  const many = calendarMessage('Léa', [{ added: [a, { ...a, id: 'b', title: 'Resto' }], deleted: [{ ...a, id: 'c', title: 'Sport' }] }], t)
  assert.equal(many?.title, '📆 Léa a mis à jour le calendrier')
  assert.equal(many?.body, '2 ajoutés et 1 supprimé : Ciné, Resto et Sport')
})

test('flux iCalendar : sans session, avec le jeton ; heure de Paris convertie en UTC', async () => {
  const { data } = await read(await calendar.GET(as('U1')))
  const res = await calendar.GET(new Request(`https://a-deux.test/api/calendar?feed=${data.feed}.ics`))
  assert.equal(res.status, 200)
  assert.match(res.headers.get('content-type')!, /text\/calendar/)
  const ics = await res.text()
  assert.match(ics, /^BEGIN:VCALENDAR\r\n/)
  assert.match(ics, /SUMMARY:Dîner chez Paul\r\n/)
  assert.match(ics, /DTSTART:20261121T200000Z\r\n/) // 21h à Paris en hiver = 20h UTC
  assert.match(ics, /LOCATION:Paris 11e/)
  assert.equal((await calendar.GET(new Request('https://a-deux.test/api/calendar?feed=mauvais-jeton-0000000'))).status, 404)

  // Nouveau lien : l'ancien ne marche plus.
  const reset = await read(await calendar.POST(as('U1', 'POST', { action: 'reset-feed' })))
  assert.notEqual(reset.data.feed, data.feed)
  assert.equal((await calendar.GET(new Request(`https://a-deux.test/api/calendar?feed=${data.feed}`))).status, 404)
  assert.equal((await calendar.GET(new Request(`https://a-deux.test/api/calendar?feed=${reset.data.feed}&event=${dinner.id}`))).status, 200)
})

test('iCalendar : journées entières, échappement, heure d’été', () => {
  assert.equal(new Date(zonedToUtc('2026-07-14', '22:00')).toISOString(), '2026-07-14T20:00:00.000Z')
  assert.equal(new Date(zonedToUtc('2026-03-29', '03:30')).toISOString(), '2026-03-29T01:30:00.000Z') // le jour du changement d'heure
  const ics = toICS([{ ...trip, created_by: 'U1', updated_by: 'U1', updated_at: '2026-11-18 10:00:00' }], { host: 'x', appUrl: 'https://x/', name: 'À deux' })
  assert.match(ics, /DTSTART;VALUE=DATE:20261224\r\nDTEND;VALUE=DATE:20261229\r\n/)
  assert.match(ics, /DESCRIPTION:Chez mes parents\\nCode : 1234\\; porte B/)
  for (const line of ics.split('\r\n')) assert.ok(new TextEncoder().encode(line).length <= 75, line)
})
