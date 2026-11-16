// Tests de l'espace UCPA, sans réseau ni compte réel (réponses UCPA simulées) :
//   npm run test:ucpa
// Couvre le protocole repris de « UCPA simplifié » (billets, planning, écritures jamais rejouées),
// le chiffrement de la session en base, et le côté couple (séances partagées, notification).
import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

process.env.TURSO_DATABASE_URL = `file:${join(mkdtempSync(join(tmpdir(), 'ucpa-')), 'test.db')}`
process.env.ACTIVITY_DEBOUNCE_MS = '0'
process.env.UCPA_SESSION_SECRET = 'test-secret'

const { UcpaClient, normalizeTickets } = await import('../api/_lib/ucpa/client.ts')
const { reserve, cancel, parisDate, planning } = await import('../api/_lib/ucpa/reservations.ts')
const { seal, unseal, createAccount, loadAccount } = await import('../api/_lib/ucpa/session.ts')
const { sportMessage } = await import('../api/_lib/activity.ts')
const { calendarEvent } = await import('../api/_lib/ucpa/calendar.ts')
const { db } = await import('../api/_lib/db.ts')
const { sessionCookie } = await import('../api/_lib/auth.ts')
const api = await import('../api/ucpa.ts')

// ───────── Faux UCPA ─────────
const customer = { uuid: 'person-fixture', horanet_id: 'fixture-100', firstname: 'Camille', lastname: 'Exemple' }
const contract = {
  contractNumber: 'contract-fixture',
  qrcode: '000000000001',
  horanetId: customer.horanet_id,
  contratReservable: true,
  contractStock: 10,
  salesNumber: ['sale-fixture'],
  productReference: 'FIT',
  productLabel: 'Fitness',
  modeAccess: 4,
}
const H = 3600_000
const yoga = { code: 'yoga-1', type: 'Yoga', startTimestamp: Date.now() + 6 * H, endTimestamp: Date.now() + 7 * H - 1000, isReservable: true, isReserved: false, isFull: false, stock: 3, isCancelable: true }
const contractId = 'sale-fixture-000000000001'

interface Fake {
  sessions: Record<string, unknown>[]
  mutate?: () => Response | Promise<Response>
  expired?: boolean
  calls: { path: string; body?: Record<string, unknown> }[]
}
function fakeUcpa(fake: Fake): typeof fetch {
  return (async (input: string | URL | Request, options: RequestInit = {}) => {
    const url = String(input)
    const path = new URL(url).pathname.split('/paris-19/')[1] ?? new URL(url).pathname
    const body = options.body ? JSON.parse(String(options.body)) : undefined
    fake.calls.push({ path, body })
    if (fake.expired && url.includes('cognito-idp')) return Response.json({ __type: 'NotAuthorizedException' }, { status: 400 })
    if (fake.expired) return Response.json({ success: false, loginUrl: 'https://authent.ucpa.com/login' })
    if (path === 'user') return Response.json({ success: true, data: { uuid: 'owner', contacts: [customer], orders: [] } })
    if (path === 'site')
      return Response.json({
        success: true,
        data: { workspace: 'alpha_hp', apiSource: 'postgres', horanetSource: 'postgres', is_internal_session: false, code_site_comptage: 12, timezone: 'Europe/Paris' },
      })
    if (path === 'amplify/reservableEbillets') return Response.json([contract])
    if (path === 'amplify/ebillets') return Response.json([{ ...contract, startDate: Date.now() / 1000 - 60, endDate: Date.now() / 1000 + 3600 }])
    if (path === 'amplify/contractActivities') {
      // Chaque séance n'existe que le jour où elle a lieu.
      const items = fake.sessions.filter((s) => parisDate(new Date(Number(s.startTimestamp))) === body.start)
      return Response.json({ success: true, data: { canReserve: true, activities: [{ name: 'Fitness', days: [{ items }] }] } })
    }
    if (['reserver/alpha_hp', 'cancel/alpha_hp'].includes(path)) return fake.mutate ? fake.mutate() : Response.json({ success: true, data: { success: true } })
    throw new Error(`Route inattendue ${path}`)
  }) as typeof fetch
}
async function fixtureClient(fake: Fake) {
  const client = await UcpaClient.create({ fetchImpl: fakeUcpa(fake) })
  client.expiresAt = Date.now() + 3600_000
  return client
}
const today = parisDate()

// ───────── Protocole ─────────
test('billets : zéros initiaux gardés, billets expirés ou bloqués écartés, QR encodé ici', async () => {
  const now = Date.now()
  const record = { qrcode: '001234567890', productLabel: 'Fitness', horanetId: '100', startDate: now / 1000 - 60, endDate: now / 1000 + 60 }
  const contact = { uuid: 'a', horanet_id: '100', firstname: 'Camille', lastname: 'Exemple' }
  const tickets = await normalizeTickets(
    [record, record, { ...record, qrcode: '000000000001', blocked: true }, { ...record, qrcode: '000000000002', endDate: now / 1000 - 1 }, { ...record, qrcode: '0000000000005' }],
    { orders: [] },
    [contact],
    now,
  )
  assert.equal(tickets.length, 1)
  assert.equal(tickets[0].code, '001234567890')
  assert.equal(tickets[0].holder, 'Camille Exemple')
  assert.match(tickets[0].qr, /^data:image\/png;base64,/)
})

test('connexion : nouveau code SSO, cookies gardés côté serveur, identité vérifiée', async () => {
  const calls: string[] = []
  const client = await UcpaClient.create({
    fetchImpl: (async (input: string, options: RequestInit & { headers?: Record<string, string> }) => {
      const url = String(input)
      calls.push(new URL(url).pathname)
      if (url.includes('/af/sso/login'))
        return new Response(null, {
          status: 302,
          headers: { Location: 'https://authent.ucpa.com/login?context=alpha&authorization_code=fresh&redirect_uri=https%3A%2F%2Fwww.ucpa.com%2Faf%2Fsso%2Fauthorize&state=s' },
        })
      if (url.includes('/login?')) return new Response('<html></html>')
      if (url.includes('/cognito-contexts/')) return Response.json({ userPool: 'eu-west-1_Example', clientId: 'client' })
      if (url.endsWith('/idp/storage')) return Response.json({ success: true })
      if (url.includes('/af/sso/authorize'))
        return new Response(null, { status: 302, headers: { Location: '/espacepersonnel/', 'Set-Cookie': 'ucpa_auth=fixture; Path=/; Secure; HttpOnly' } })
      if (url.endsWith('/espacepersonnel/')) return new Response('ok')
      if (url.endsWith('/user')) {
        assert.match(String(options.headers?.Cookie), /ucpa_auth=fixture/)
        return Response.json({ success: true, data: { uuid: 'x', firstname: 'Camille', lastname: 'Exemple' } })
      }
      throw new Error(url)
    }) as typeof fetch,
  })
  const holder = await client.login('a@example.test', 'mot-de-passe', async () => ({
    idToken: 'id',
    accessToken: 'access',
    refreshToken: 'refresh',
    expiresAt: Date.now() + 60_000,
  }))
  assert.equal(holder, 'Camille Exemple')
  assert.equal(client.auth?.tokens.refreshToken, 'refresh')
  assert.ok(client.expiresAt > Date.now() + 29 * 86400_000)
  assert.ok(calls.includes('/idp/storage'))
})

test('une séance inventée ou un billet d’un autre ne déclenchent aucune écriture UCPA', async () => {
  const fake: Fake = { sessions: [yoga], calls: [] }
  const client = await fixtureClient(fake)
  await assert.rejects(reserve(client, { contractId: 'quelqu-un-d-autre', sessionId: yoga.code, date: today }), (e: { code: string }) => e.code === 'CONTRACT_UNAVAILABLE')
  await assert.rejects(reserve(client, { contractId, sessionId: 'inventee', date: today }), (e: { code: string }) => e.code === 'SESSION_UNAVAILABLE')
  assert.equal(fake.calls.some((c) => c.path.startsWith('reserver/')), false)
})

test('réservation : participant reconstruit par le serveur, réponse perdue = relecture, jamais de second envoi', async () => {
  const fake: Fake = { sessions: [yoga], calls: [], mutate: () => Promise.reject(new Error('coupure')) }
  const client = await fixtureClient(fake)
  await assert.rejects(reserve(client, { contractId, sessionId: yoga.code, date: today }), (e: { code: string }) => e.code === 'BOOKING_UNCERTAIN')
  assert.equal(fake.calls.filter((c) => c.path.startsWith('reserver/')).length, 1)
  const sent = fake.calls.find((c) => c.path.startsWith('reserver/'))!.body!
  assert.equal((sent.participant as { uuid: string }).uuid, customer.uuid)
  assert.equal(sent.sessionCode, yoga.code)
  // UCPA a bien enregistré malgré la coupure : la relecture le confirme.
  fake.mutate = () => {
    fake.sessions = [{ ...yoga, isReserved: true }]
    return Promise.reject(new Error('coupure'))
  }
  assert.equal((await reserve(client, { contractId, sessionId: yoga.code, date: today })).confirmed, true)
})

test('un refus explicite d’UCPA est rapporté tel quel', async () => {
  const fake: Fake = { sessions: [yoga], calls: [], mutate: () => Response.json({ success: true, data: { success: false } }) }
  await assert.rejects(reserve(await fixtureClient(fake), { contractId, sessionId: yoga.code, date: today }), (e: { code: string }) => e.code === 'BOOKING_REJECTED')
})

test('annulation : seulement une séance réservée et encore annulable', async () => {
  const fake: Fake = { sessions: [{ ...yoga, isReserved: true }], calls: [] }
  const client = await fixtureClient(fake)
  const res = await cancel(client, { contractId, sessionId: yoga.code, date: today })
  assert.equal(res.confirmed, true)
  assert.equal(res.session?.name, 'Yoga')
  const p = await planning(client, { date: today })
  assert.equal(p.sessions[0].cancellable, true)
})

// ───────── Session chiffrée ─────────
test('session chiffrée : illisible sans la clé, liée au compte de l’app', () => {
  const sealed = seal({ secret: 'refresh-token-value' }, 'user-a')
  assert.equal(sealed.includes('refresh-token-value'), false)
  assert.deepEqual(unseal(sealed, 'user-a'), { secret: 'refresh-token-value' })
  assert.equal(unseal(sealed, 'user-b'), null)
  assert.equal(unseal(sealed.slice(0, -2) + 'AA', 'user-a'), null)
})

// ───────── Couple : séances partagées et notification ─────────
test('notification : un message lisible, le dernier geste l’emporte', () => {
  const slot = { id: 'y', name: 'Yoga', start: Date.now() + 26 * H, end: Date.now() + 27 * H - 1000 }
  const one = sportMessage('Léa', [{ booked: [slot] }])!
  assert.equal(one.title, '🏸 Léa a réservé Yoga')
  assert.match(one.body, /^(Demain|Aujourd’hui|[A-Z][a-zé]+ \d+) · \d\d:\d\d – \d\d:\d\d$/)
  assert.match(sportMessage('Léa', [{ booked: [slot] }, { cancelled: [slot] }])!.title, /a annulé Yoga/)
  assert.match(sportMessage('Léa', [{ booked: [slot, { ...slot, id: 'z', name: 'Pilates' }] }])!.title, /a réservé 2 séances/)
})

async function setupCouple() {
  const conn = await db()
  await conn.batch(
    [
      "insert into couples (id, invite_code) values ('c1', 'INV1')",
      "insert into users (id, email, password_hash, display_name, couple_id) values ('ua', 'a@x.test', 'x', 'Mathis', 'c1')",
      "insert into users (id, email, password_hash, display_name, couple_id) values ('ub', 'b@x.test', 'x', 'Léa', 'c1')",
    ],
    'write',
  )
}
const asUser = (id: string, path: string, init: RequestInit = {}) =>
  new Request(`http://localhost/api/ucpa${path}`, {
    ...init,
    headers: { cookie: sessionCookie(id).split(';')[0], ...(init.body ? { 'Content-Type': 'application/json', origin: 'http://localhost' } : {}) },
  })
const realFetch = globalThis.fetch

test('de bout en bout : lecture, réservation, séances visibles par l’autre, réservation faite ailleurs repérée', async () => {
  await setupCouple()
  const fake: Fake = { sessions: [yoga], calls: [] }
  globalThis.fetch = fakeUcpa(fake)
  try {
    // Le compte de Mathis est relié (connexion testée plus haut).
    const client = await UcpaClient.create()
    client.expiresAt = Date.now() + 86400_000
    client.auth = { config: { userPool: 'eu-west-1_X', clientId: 'c' }, tokens: { idToken: 'i', accessToken: 'a', refreshToken: 'secret-refresh', expiresAt: Date.now() + H }, needsSso: false }
    await createAccount('ua', client, 'Camille Exemple')
    const { rows } = await (await db()).execute("select sealed from ucpa_accounts where user_id = 'ua'")
    assert.equal(String(rows[0].sealed).includes('secret-refresh'), false)

    // Léa ne voit pas encore de séance de Mathis.
    let overview = await (await api.GET(asUser('ub', ''))).json()
    assert.equal(overview.partner.name, 'Mathis')
    assert.equal(overview.partner.connected, true)
    assert.deepEqual(overview.partner.bookings, [])
    assert.equal(overview.account, null)

    // Première lecture des 14 jours : point de départ, personne n'est prévenu.
    const upcoming = await api.GET(asUser('ua', `?view=upcoming&contractId=${contractId}`))
    assert.equal(upcoming.status, 200)
    const text = await upcoming.text()
    assert.equal(text.includes('secret-refresh'), false)
    assert.equal(text.includes('horanet'), false)
    assert.equal(JSON.parse(text).days.length, 14)

    // Mathis réserve depuis l'app.
    const res = await api.POST(
      asUser('ua', '', {
        method: 'POST',
        body: JSON.stringify({ action: 'reserve', contractId, sessionId: yoga.code, date: today, expectedSession: { name: 'Yoga', start: yoga.startTimestamp, end: yoga.endTimestamp } }),
      }),
    )
    assert.equal(res.status, 200)
    assert.equal((await res.json()).confirmed, true)
    await new Promise((r) => setTimeout(r, 50))
    const events = await (await db()).execute("select payload from activity_events where kind = 'sport' and author_id = 'ua'")
    assert.equal(events.rows.length, 1)
    assert.equal(JSON.parse(String(events.rows[0].payload)).booked[0].name, 'Yoga')

    // Léa voit la séance.
    overview = await (await api.GET(asUser('ub', ''))).json()
    assert.equal(overview.partner.bookings.length, 1)
    assert.equal(overview.partner.bookings[0].name, 'Yoga')

    // Mathis réserve ensuite du Pilates sur le site UCPA : repéré à la lecture suivante, Léa prévenue.
    const pilates = { ...yoga, code: 'pilates-1', type: 'Pilates', startTimestamp: yoga.startTimestamp + 86400_000, endTimestamp: yoga.endTimestamp + 86400_000, isReserved: true }
    fake.sessions = [{ ...yoga, isReserved: true }, pilates]
    assert.equal((await api.GET(asUser('ua', `?view=upcoming&contractId=${contractId}`))).status, 200)
    await new Promise((r) => setTimeout(r, 50))
    const all = await (await db()).execute("select payload from activity_events where kind = 'sport' and author_id = 'ua' order by id")
    assert.equal(all.rows.length, 2)
    assert.deepEqual(
      JSON.parse(String(all.rows[1].payload)).booked.map((s: { name: string }) => s.name),
      ['Pilates'],
    )
    overview = await (await api.GET(asUser('ub', ''))).json()
    assert.deepEqual(
      overview.partner.bookings.map((b: { name: string }) => b.name),
      ['Yoga', 'Pilates'],
    )

    // Session UCPA expirée (refresh token refusé) : 424, pas 401 qui déconnecterait de l'app ; session oubliée.
    client.auth.tokens.expiresAt = Date.now() - 1
    await createAccount('ua', client, 'Camille Exemple')
    fake.expired = true
    const expired = await api.GET(asUser('ua', '?view=tickets'))
    assert.equal(expired.status, 424)
    assert.equal((await expired.json()).code, 'UCPA_SESSION_EXPIRED')
    assert.equal(await loadAccount('ua'), null)
    overview = await (await api.GET(asUser('ub', ''))).json()
    assert.equal(overview.partner.connected, false)
  } finally {
    globalThis.fetch = realFetch
  }
})

test('calendrier : fichier iCalendar d’une séance, paramètres vérifiés', () => {
  const ics = calendarEvent({ id: 'yoga-1', name: 'Yoga; doux', start: String(yoga.startTimestamp), end: String(yoga.endTimestamp + 1000) })
  assert.match(ics, /SUMMARY:Yoga\\; doux · UCPA/)
  assert.throws(() => calendarEvent({ id: 'x', name: 'Yoga', start: '1', end: '2' }))
})
