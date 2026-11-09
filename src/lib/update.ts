import { registerSW } from 'virtual:pwa-register'

/*
 * Mises à jour de l'app installée.
 *
 * - Une nouvelle version est cherchée au lancement, à chaque retour sur l'app et toutes les heures.
 *   Sur iPhone, l'app installée revient souvent de l'arrière-plan sans recharger la page : sans ces
 *   vérifications, une mise à jour pourrait attendre des jours.
 * - Une fois téléchargée, elle s'applique (rechargement) tout de suite si l'écran n'a pas encore été
 *   touché depuis l'ouverture de l'app, sinon dès que l'app passe en arrière-plan : on ne recharge
 *   jamais la page en pleine saisie.
 * - « Forcer la mise à jour » (Réglages) repart de zéro : service worker et caches supprimés.
 *   Les saisies en attente de synchronisation (localStorage) sont conservées.
 */

const CHECK_EVERY_MS = 60 * 60 * 1000

let registration: ServiceWorkerRegistration | undefined
let updateReady = false
let touchedSinceShown = false
let applying = false
let activateUpdate: (() => Promise<void>) | undefined

function applyUpdate() {
  if (!updateReady || applying) return
  applying = true
  void activateUpdate?.()
}

export function startAutoUpdate() {
  if (!('serviceWorker' in navigator)) return
  activateUpdate = registerSW({
    immediate: true,
    // Nouvelle version installée, en attente d'activation.
    onNeedRefresh() {
      updateReady = true
      if (document.visibilityState === 'hidden' || !touchedSinceShown) applyUpdate()
    },
    // Le rechargement est fait ci-dessous : celui du plugin n'a pas lieu pendant la toute première
    // session (app pas encore contrôlée par un service worker au chargement).
    onNeedReload() {},
    onRegisteredSW(_url, reg) {
      registration = reg
      setInterval(() => document.visibilityState === 'visible' && checkForUpdate(), CHECK_EVERY_MS)
    },
  })
  // La nouvelle version a pris le contrôle de la page : on recharge pour l'afficher.
  navigator.serviceWorker.addEventListener('controllerchange', () => applying && location.reload())
  const touched = () => (touchedSinceShown = true)
  addEventListener('pointerdown', touched, { capture: true, passive: true })
  addEventListener('keydown', touched, { capture: true, passive: true })
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') return applyUpdate()
    touchedSinceShown = false
    void checkForUpdate()
  })
}

/** Demande au navigateur de vérifier s'il existe une nouvelle version (sans effet hors ligne). */
export async function checkForUpdate() {
  if (!registration || !navigator.onLine) return
  try {
    await registration.update()
  } catch {
    /* réseau indisponible : on réessaiera au prochain retour sur l'app */
  }
}

/** Supprime service worker et caches puis recharge : l'app est retéléchargée entièrement. */
export async function forceUpdate() {
  if (!navigator.onLine) throw new Error('Pas de connexion : impossible de télécharger la nouvelle version.')
  const regs = (await navigator.serviceWorker?.getRegistrations()) ?? []
  await Promise.all(regs.map((r) => r.unregister()))
  if ('caches' in window) await Promise.all((await caches.keys()).map((k) => caches.delete(k)))
  location.reload()
}

/** Version affichée dans les Réglages, fixée au build. */
export const appVersion = __APP_VERSION__
