import webpush from 'web-push'
import type { Reminder } from '../../shared/cycles.js'
import { db } from './db.js'

let configured = false
function configure() {
  if (configured) return
  const pub = process.env.VAPID_PUBLIC_KEY ?? process.env.VITE_VAPID_PUBLIC_KEY
  const priv = process.env.VAPID_PRIVATE_KEY
  if (!pub || !priv) throw new Error('Clés VAPID manquantes (VITE_VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY)')
  webpush.setVapidDetails(process.env.VAPID_SUBJECT ?? 'mailto:admin@example.com', pub, priv)
  configured = true
}

/** Types de notifications que chacun peut couper dans Réglages. */
export const NOTIFICATION_KINDS = ['reminders', 'cycle', 'groceries'] as const
export type NotificationKind = (typeof NOTIFICATION_KINDS)[number]

export interface Payload extends Reminder {
  url?: string
  /** Notifications de même tag : la nouvelle remplace l'ancienne au lieu de s'empiler. */
  tag?: string
}

/**
 * Envoie une notification à tous les appareils de ces utilisateurs, sauf à ceux qui ont coupé
 * ce type de notification (`pref`). Retourne le nombre d'envois réussis.
 */
export async function sendToUsers(userIds: string[], payload: Payload, pref?: NotificationKind) {
  configure()
  if (!userIds.length) return 0
  const conn = await db()
  const { rows } = await conn.execute({
    sql: `select endpoint, p256dh, auth from push_subscriptions where user_id in (${userIds.map(() => '?').join(',')})
          and user_id not in (select user_id from notification_prefs where kind = ? and enabled = 0)`,
    args: [...userIds, pref ?? ''],
  })
  let sent = 0
  for (const s of rows) {
    try {
      await webpush.sendNotification(
        { endpoint: String(s.endpoint), keys: { p256dh: String(s.p256dh), auth: String(s.auth) } },
        JSON.stringify({ ...payload, url: payload.url ?? '/' }),
        { TTL: 60 * 60 * 12 },
      )
      sent++
    } catch (e) {
      const code = (e as { statusCode?: number }).statusCode
      // Abonnement expiré ou révoqué : on le supprime.
      if (code === 404 || code === 410) await conn.execute({ sql: 'delete from push_subscriptions where endpoint = ?', args: [s.endpoint] })
      else console.error('push error', code, e)
    }
  }
  return sent
}
