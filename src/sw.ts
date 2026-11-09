/// <reference lib="webworker" />
import { clientsClaim } from 'workbox-core'
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching'
import { NavigationRoute, registerRoute } from 'workbox-routing'

declare const self: ServiceWorkerGlobalScope

// Cache hors ligne de l'app (HTML, JS, CSS, icônes).
precacheAndRoute(self.__WB_MANIFEST)
cleanupOutdatedCaches()
// Toute navigation sert l'app en cache (hors ligne compris), sauf les routes de l'API.
registerRoute(new NavigationRoute(createHandlerBoundToURL('/index.html'), { denylist: [/^\/api\//] }))

// Une nouvelle version attend que la page l'active (voir src/lib/update.ts), pour ne jamais
// recharger l'app en pleine saisie. Elle prend ensuite le contrôle de la page tout de suite.
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') void self.skipWaiting()
})
clientsClaim()

// Réception d'un rappel (api/cron) ou d'une nouveauté saisie par l'autre (api/_lib/activity.ts).
self.addEventListener('push', (event) => {
  const data = (() => {
    try {
      return event.data?.json() ?? {}
    } catch {
      return { title: 'Cycle à deux', body: event.data?.text() }
    }
  })()
  event.waitUntil(
    self.registration.showNotification(data.title ?? 'Cycle à deux', {
      body: data.body,
      icon: '/pwa-192x192.png',
      // Android n'affiche que la silhouette du badge (barre d'état) : il doit être monochrome.
      badge: '/badge-96x96.png',
      tag: data.tag ?? data.kind ?? 'reminder',
      // Une nouveauté qui remplace la précédente (même tag) fait quand même sonner.
      renotify: Boolean(data.tag),
      data: { url: data.url ?? '/' },
    } as NotificationOptions),
  )
})

// Toucher la notification ouvre l'app au bon endroit (saisie du jour, courses…).
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = new URL(event.notification.data?.url ?? '/', self.location.origin).href
  event.waitUntil(
    (async () => {
      const list = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      const client = list.find((c) => c.visibilityState === 'visible') ?? list[0]
      if (!client) return void (await self.clients.openWindow(url))
      // focus() d'abord : il doit être appelé tant que le clic sur la notification compte
      // comme une action de l'utilisateur. navigate() échoue sur une page non contrôlée.
      const focused = await client.focus()
      if (focused.url !== url) await focused.navigate(url).catch(() => undefined)
    })(),
  )
})
