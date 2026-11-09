// POST   /api/push { endpoint, keys: { p256dh, auth } } -> enregistre cet appareil
// POST   /api/push { test: true }                       -> notification de test
// DELETE /api/push { endpoint }                         -> désabonne cet appareil
import { requireUser } from './_lib/auth.js'
import { db } from './_lib/db.js'
import { body, error, json } from './_lib/http.js'
import { sendToUsers } from './_lib/push.js'

export async function POST(req: Request) {
  const user = await requireUser(req)
  if (user instanceof Response) return user
  const data = await body<{ test?: boolean; endpoint?: string; keys?: { p256dh?: string; auth?: string } }>(req)

  if (data.test) {
    try {
      const sent = await sendToUsers([user.id], { kind: 'test', title: 'Notifications activées', body: 'Vous recevrez ici les rappels de cycle.' })
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
