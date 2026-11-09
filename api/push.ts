// POST   /api/push { endpoint, keys: { p256dh, auth } } -> enregistre cet appareil
// POST   /api/push { test: true }                       -> notification de test
// DELETE /api/push { endpoint }                         -> désabonne cet appareil
// GET    /api/push                                      -> types de notifications reçus { reminders, cycle, groceries }
// PATCH  /api/push { kind, enabled }                    -> active ou coupe un type (pour tous mes appareils)
import { requireUser } from './_lib/auth.js'
import { db } from './_lib/db.js'
import { body, error, json } from './_lib/http.js'
import { NOTIFICATION_KINDS, sendToUsers, type NotificationKind } from './_lib/push.js'

async function prefs(userId: string) {
  const { rows } = await (await db()).execute({ sql: 'select kind, enabled from notification_prefs where user_id = ?', args: [userId] })
  const off = new Set(rows.filter((r) => !Number(r.enabled)).map((r) => String(r.kind)))
  return Object.fromEntries(NOTIFICATION_KINDS.map((k) => [k, !off.has(k)])) as Record<NotificationKind, boolean>
}

export async function GET(req: Request) {
  const user = await requireUser(req)
  if (user instanceof Response) return user
  return json(await prefs(user.id))
}

export async function PATCH(req: Request) {
  const user = await requireUser(req)
  if (user instanceof Response) return user
  const { kind, enabled } = await body<{ kind?: string; enabled?: boolean }>(req)
  if (!NOTIFICATION_KINDS.includes(kind as NotificationKind) || typeof enabled !== 'boolean') return error('Réglage invalide')
  await (await db()).execute({
    sql: `insert into notification_prefs (user_id, kind, enabled) values (?, ?, ?)
          on conflict (user_id, kind) do update set enabled = excluded.enabled`,
    args: [user.id, kind!, enabled ? 1 : 0],
  })
  return json(await prefs(user.id))
}

export async function POST(req: Request) {
  const user = await requireUser(req)
  if (user instanceof Response) return user
  const data = await body<{ test?: boolean; endpoint?: string; keys?: { p256dh?: string; auth?: string } }>(req)

  if (data.test) {
    try {
      const sent = await sendToUsers([user.id], { kind: 'test', title: 'Notifications activées', body: 'Vous recevrez ici les rappels et les nouveautés de votre espace.' })
      return json({ sent })
    } catch (e) {
      return error((e as Error).message, 500)
    }
  }

  if (!data.endpoint?.startsWith('https://') || !data.keys?.p256dh || !data.keys.auth) return error('Abonnement invalide')
  await (await db()).execute({
    sql: `insert into push_subscriptions (endpoint, user_id, p256dh, auth) values (?, ?, ?, ?)
          on conflict (endpoint) do update set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth`,
    args: [data.endpoint, user.id, data.keys.p256dh, data.keys.auth],
  })
  return json({ ok: true })
}

export async function DELETE(req: Request) {
  const user = await requireUser(req)
  if (user instanceof Response) return user
  const { endpoint } = await body<{ endpoint?: string }>(req)
  await (await db()).execute({ sql: 'delete from push_subscriptions where endpoint = ? and user_id = ?', args: [endpoint ?? '', user.id] })
  return json({ ok: true })
}
