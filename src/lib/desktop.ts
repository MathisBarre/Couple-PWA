import { useSyncExternalStore } from 'react'

/**
 * Ordinateur : souris ou trackpad, sur un écran assez large pour une barre latérale.
 * Même règle que la variante CSS `desk:` (src/index.css). Un téléphone ou une tablette au doigt
 * n'y passent jamais : leur affichage reste celui de l'app mobile.
 */
export const DESKTOP_QUERY = '(hover: hover) and (pointer: fine) and (min-width: 1024px)'

const media = typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(DESKTOP_QUERY) : null

function subscribe(cb: () => void) {
  media?.addEventListener('change', cb)
  return () => media?.removeEventListener('change', cb)
}

export function useDesktop() {
  return useSyncExternalStore(subscribe, () => media?.matches ?? false, () => false)
}
