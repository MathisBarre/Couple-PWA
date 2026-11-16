// Espace UCPA : QR d'accès, planning et réservations UCPA Sport Station Paris 19, et les
// séances de l'autre. Protocole repris de « UCPA simplifié » (voir _lib/ucpa/).
//
// GET  /api/ucpa                                  -> { account, partner } : mon compte UCPA (relié ou non),
//                                                    les séances à venir de l'autre
// GET  /api/ucpa?view=tickets                     -> { tickets } : mes billets et leur QR
// GET  /api/ucpa?view=upcoming&contractId=…       -> planning complet des 14 prochains jours
// GET  /api/ucpa?view=planning&date=…&contractId=… -> planning d'un jour
// GET  /api/ucpa?view=calendar&id&name&start&end  -> la séance en fichier iCalendar (sans session)
// POST /api/ucpa { action: 'login', email, password }  -> relie mon compte UCPA (mot de passe jamais gardé)
// POST /api/ucpa { action: 'logout' }                  -> délie mon compte (révocation côté UCPA)
// POST /api/ucpa { action: 'reserve' | 'cancel', contractId, sessionId, date, expectedSession? }
//
// Erreurs : { error, code }. Une session UCPA expirée répond 424 (et non 401, réservé à la
// session de l'app) avec code UCPA_SESSION_EXPIRED.
import { requireCouple, type User } from './_lib/auth.js'
import { db } from './_lib/db.js'
import { body, json } from './_lib/http.js'
import { recordMutation, syncDays, upcomingOf } from './_lib/ucpa/bookings.js'
import { calendarEvent, calendarHeaders } from './_lib/ucpa/calendar.js'
import { UcpaClient, UcpaError } from './_lib/ucpa/client.js'
import { cancel, planning, reserve, upcomingPlanning, type MutationInput } from './_lib/ucpa/reservations.js'
import { createAccount, forget, loadAccount, saveAccount, type Account } from './_lib/ucpa/session.js'

type Member = User & { couple_id: string }

const fail = (error: unknown) => {
  if (error instanceof UcpaError) {
    // 401 d'UCPA ≠ 401 de l'app : l'app renverrait à son propre écran de connexion.
    const status = error.status === 401 ? (error.code === 'INVALID_CREDENTIALS' ? 400 : 424) : error.status
    return json({ error: error.message, code: error.code === 'SESSION_EXPIRED' ? 'UCPA_SESSION_EXPIRED' : error.code }, status)
  }
  console.error('ucpa', error)
  return json({ error: 'UCPA est momentanément inaccessible. Réessayez.', code: 'UCPA_UNAVAILABLE' }, 502)
}
const noStore = { 'Cache-Control': 'no-store' }

/** Fait un appel UCPA avec la session gardée du compte, puis garde la session (renouvelée ou non). */
async function withAccount<T>(user: Member, run: (account: Account) => Promise<T>): Promise<Response> {
  const account = await loadAccount(user.id)
  if (!account) return json({ error: 'Reliez votre compte UCPA pour continuer.', code: 'UCPA_NOT_CONNECTED' }, 424)
  try {
    const result = await run(account)
    await saveAccount(user.id, account)
    return json(result, 200, noStore)
  } catch (error) {
    if (error instanceof UcpaError && error.code === 'SESSION_EXPIRED') await forget(user.id)
    // Un refresh token renouvelé avant l'échec doit survivre.
    else await saveAccount(user.id, account).catch(() => {})
    return fail(error)
  }
}

async function overview(user: Member) {
  const conn = await db()
  const [mine, others] = await Promise.all([
    conn.execute({ sql: 'select holder, expires_at, synced_at from ucpa_accounts where user_id = ?', args: [user.id] }),
    conn.execute({
      sql: `select u.id, u.display_name, a.synced_at, a.user_id is not null as connected
            from users u left join ucpa_accounts a on a.user_id = u.id where u.couple_id = ? and u.id != ?`,
      args: [user.couple_id, user.id],
    }),
  ])
  const me = mine.rows[0]
  const partner = others.rows[0]
  return {
    account: me && Number(me.expires_at) > Date.now() ? { holder: String(me.holder), expiresAt: Number(me.expires_at) } : null,
    partner: partner
      ? {
          id: String(partner.id),
          name: String(partner.display_name),
          connected: Boolean(Number(partner.connected)),
          syncedAt: partner.synced_at == null ? null : Number(partner.synced_at),
          bookings: await upcomingOf(String(partner.id)),
        }
      : null,
  }
}

export async function GET(req: Request) {
  const url = new URL(req.url)
  const view = url.searchParams.get('view')
  if (view === 'calendar') {
    // Sans session : iOS ouvre ce fichier dans Safari, hors de l'app.
    try {
      const ics = calendarEvent(Object.fromEntries(url.searchParams))
      return new Response(ics, { headers: { ...calendarHeaders, ...noStore } })
    } catch (error) {
      return fail(error)
    }
  }
  const user = await requireCouple(req)
  if (user instanceof Response) return user
  if (!view) return json(await overview(user), 200, noStore)
  if (view === 'tickets') return withAccount(user, async ({ client }) => ({ tickets: await client.tickets() }))
  if (view === 'upcoming')
    return withAccount(user, async (account) => {
      const result = await upcomingPlanning(account.client, { contractId: url.searchParams.get('contractId') ?? '' })
      await syncDays(user, result.days, { firstSync: account.syncedAt === null })
      return result
    })
  if (view === 'planning')
    return withAccount(user, async (account) => {
      const result = await planning(account.client, {
        date: url.searchParams.get('date') ?? undefined,
        contractId: url.searchParams.get('contractId') ?? '',
      })
      await syncDays(user, [result], { firstSync: account.syncedAt === null })
      return result
    })
  return json({ error: 'Vue inconnue' }, 404)
}

// Connexions en cours et tentatives récentes par compte (protection simple, par instance).
const attempts = new Map<string, { count: number; until: number }>()
let activeLogins = 0

export async function POST(req: Request) {
  const user = await requireCouple(req)
  if (user instanceof Response) return user
  // Écritures : seulement depuis l'app elle-même.
  const origin = req.headers.get('origin')
  if (origin && origin !== new URL(req.url).origin) return json({ error: 'Origine non autorisée.' }, 403)
  const input = await body<{ action?: string; email?: unknown; password?: unknown } & Partial<MutationInput>>(req)

  if (input.action === 'login') {
    const entry = attempts.get(user.id)
    if (activeLogins >= 3 || (entry && entry.until > Date.now() && entry.count >= 6))
      return json({ error: 'Trop de tentatives. Réessayez dans quelques minutes.', code: 'RATE_LIMITED' }, 429, { 'Retry-After': '300' })
    const email = typeof input.email === 'string' ? input.email.trim() : ''
    let password = typeof input.password === 'string' ? input.password : ''
    if (!email || email.length > 254 || !password || password.length > 1024)
      return json({ error: 'Renseignez l’e-mail et le mot de passe de votre compte UCPA.', code: 'BAD_REQUEST' }, 400)
    attempts.set(user.id, { count: entry && entry.until > Date.now() ? entry.count + 1 : 1, until: Date.now() + 300_000 })
    activeLogins++
    try {
      const client = await UcpaClient.create()
      const holder = await client.login(email, password)
      if (!Number.isFinite(client.expiresAt) || client.expiresAt <= Date.now()) throw new UcpaError('La session UCPA a expiré.', 401, 'SESSION_EXPIRED')
      // Reconnexion : les séances gardées viennent peut-être d'un autre compte UCPA.
      await forget(user.id)
      await createAccount(user.id, client, holder)
      attempts.delete(user.id)
      return json(await overview(user), 200, noStore)
    } catch (error) {
      return fail(error)
    } finally {
      activeLogins--
      password = ''
      input.password = ''
    }
  }

  if (input.action === 'logout') {
    const account = await loadAccount(user.id)
    let upstreamConfirmed = !account
    if (account) {
      try {
        upstreamConfirmed = await account.client.logout()
      } catch {
        upstreamConfirmed = false
      }
    }
    await forget(user.id)
    return json({ ...(await overview(user)), upstreamConfirmed }, 200, noStore)
  }

  if (input.action === 'reserve' || input.action === 'cancel') {
    const cancelling = input.action === 'cancel'
    return withAccount(user, async ({ client }) => {
      const result = await (cancelling ? cancel : reserve)(client, input as MutationInput)
      if (result.session) {
        const already = cancelling ? result.alreadyCancelled : result.alreadyReserved
        await recordMutation(user, result.session, cancelling ? 'cancelled' : 'booked', { notify: !already })
      }
      return result
    })
  }
  return json({ error: 'Action inconnue' }, 400)
}
