import { supabase } from './supabase'

const vapidKey = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined

export const pushSupported = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window

/** iOS n'autorise les notifications que si l'app est installée sur l'écran d'accueil. */
export const isStandalone =
  window.matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true

export const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent)

function urlBase64ToUint8Array(base64: string) {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(raw, (c) => c.charCodeAt(0))
}

export async function currentSubscription() {
  if (!pushSupported) return null
  const reg = await navigator.serviceWorker.getRegistration()
  return (await reg?.pushManager.getSubscription()) ?? null
}

export async function enablePush(userId: string) {
  if (!vapidKey) throw new Error('VITE_VAPID_PUBLIC_KEY manquante')
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') throw new Error('Notifications refusées dans les réglages du téléphone')
  const reg = await navigator.serviceWorker.ready
  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(vapidKey) }))
  const json = sub.toJSON()
  const { error } = await supabase.from('push_subscriptions').upsert({
    endpoint: sub.endpoint,
    user_id: userId,
    p256dh: json.keys!.p256dh,
    auth: json.keys!.auth,
  })
  if (error) throw error
}

export async function disablePush() {
  const sub = await currentSubscription()
  if (!sub) return
  await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint)
  await sub.unsubscribe()
}

export async function sendTestPush() {
  const { data, error } = await supabase.functions.invoke('send-reminders', { body: { test: true } })
  if (error) throw error
  return data as { sent: number }
}
