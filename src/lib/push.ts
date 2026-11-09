import { api } from './api'

const vapidKey = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined

export const pushSupported = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window

/** iOS n'autorise les notifications que si l'app est installée sur l'écran d'accueil. */
export const isStandalone =
  window.matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true

// Les iPad récents se présentent comme un Mac : on les repère à l'écran tactile.
export const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) || (/macintosh/i.test(navigator.userAgent) && navigator.maxTouchPoints > 1)

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

export async function enablePush() {
  if (!vapidKey) throw new Error('VITE_VAPID_PUBLIC_KEY manquante')
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') throw new Error('Notifications refusées dans les réglages du téléphone')
  const reg = await navigator.serviceWorker.ready
  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(vapidKey) }))
  await api('push', { method: 'POST', body: sub.toJSON() })
}

export async function disablePush() {
  const sub = await currentSubscription()
  if (!sub) return
  await api('push', { method: 'DELETE', body: { endpoint: sub.endpoint } })
  await sub.unsubscribe()
}

export async function sendTestPush() {
  return api<{ sent: number }>('push', { method: 'POST', body: { test: true } })
}
