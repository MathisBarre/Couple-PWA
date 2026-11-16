// Icônes au trait, simples (voir .sk-glyph dans src/skeuo.css : trait rond, couleur du texte).
// Les espaces et rubriques (src/modules.ts) gardent leur emoji comme identifiant : `Glyph` le
// remplace par le dessin correspondant, et retombe sur l'emoji s'il n'en connaît pas.
import type { ReactNode } from 'react'
import { cx } from './ui'

/** Dessins 24 × 24, au trait. */
const PATHS: Record<string, ReactNode> = {
  // Goutte
  '💧': <path d="M12 3.2c3.5 4 5.9 7.2 5.9 10.4a5.9 5.9 0 0 1-11.8 0c0-3.2 2.4-6.4 5.9-10.4Z" />,
  // Cabas
  '🛒': (
    <>
      <path d="M5.6 8.5h12.8l-.9 10.2a2 2 0 0 1-2 1.8h-7a2 2 0 0 1-2-1.8Z" />
      <path d="M9 11V7.5a3 3 0 0 1 6 0V11" />
    </>
  ),
  // Curseurs de réglage
  '⚙️': (
    <>
      <path d="M4 7.5h9m4 0h3M4 16.5h3m4 0h9" />
      <circle cx="15" cy="7.5" r="2" />
      <circle cx="9" cy="16.5" r="2" />
    </>
  ),
  // Trois points
  '☰': <path d="M5.5 12h.01M12 12h.01M18.5 12h.01" strokeWidth={2.6} />,
  // Calendrier
  '📅': (
    <>
      <rect x="4" y="5.5" width="16" height="14.5" rx="3" />
      <path d="M4 10h16M8.5 3.5v3.5m7-3.5v3.5" />
    </>
  ),
  // Graphique en barres
  '📊': <path d="M6 20v-6m6 6V5m6 15v-9.5" strokeWidth={2.2} />,
  // Liste
  '📝': <path d="M9.5 7h10m-10 5h10m-10 5h10M4.8 7h.01m-.01 5h.01m-.01 5h.01" />,
  // Quatre cases (espaces)
  '🧩': (
    <>
      <rect x="4" y="4" width="6.5" height="6.5" rx="1.8" />
      <rect x="13.5" y="4" width="6.5" height="6.5" rx="1.8" />
      <rect x="4" y="13.5" width="6.5" height="6.5" rx="1.8" />
      <rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.8" />
    </>
  ),
  // Disque mi-clair mi-sombre (apparence)
  '🎨': (
    <>
      <circle cx="12" cy="12" r="8.2" />
      <path d="M12 3.8a8.2 8.2 0 0 1 0 16.4Z" fill="currentColor" />
    </>
  ),
  // Cloche
  '🔔': <path d="M6.5 16.5V11a5.5 5.5 0 0 1 11 0v5.5l1.5 2H5Zm3.7 4.3a2.3 2.3 0 0 0 3.6 0" />,
  // Cœur
  '💞': <path d="M12 20c-4.8-3.8-8-6.7-8-10.3A4.3 4.3 0 0 1 12 7.3a4.3 4.3 0 0 1 8 2.4c0 3.6-3.2 6.5-8 10.3Z" />,
  // Téléphone
  '📲': (
    <>
      <rect x="7" y="3" width="10" height="18" rx="2.6" />
      <path d="M11 17.8h2" />
    </>
  ),
  // Soleil
  '☀️': (
    <>
      <circle cx="12" cy="12" r="3.8" />
      <path d="M12 3v1.8m0 14.4V21M3 12h1.8m14.4 0H21M5.6 5.6l1.3 1.3m10.2 10.2 1.3 1.3m0-12.8-1.3 1.3M6.9 17.1l-1.3 1.3" />
    </>
  ),
  // Lune
  '🌙': <path d="M19.5 14.2A7.8 7.8 0 0 1 9.8 4.5a7.8 7.8 0 1 0 9.7 9.7Z" />,
}
PATHS['📱'] = PATHS['📲']

/** Icône au trait pour un emoji connu ; l'emoji lui-même sinon. */
export function Glyph({ icon, className }: { icon: string; className?: string }) {
  const shape = PATHS[icon]
  if (!shape) return <span className={className}>{icon}</span>
  return (
    <svg aria-hidden viewBox="0 0 24 24" className={cx('sk-glyph', className)}>
      {shape}
    </svg>
  )
}

/** Petite goutte d'encre (intensité du flux). */
export function Drop({ className }: { className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 10 14" className={cx('inline-block h-[0.85rem] w-[0.6rem]', className)} fill="currentColor">
      <path d="M5 .6C7.4 3.9 9 6.3 9 8.6a4 4 0 0 1-8 0C1 6.3 2.6 3.9 5 .6Z" />
    </svg>
  )
}

/** Chevron (lignes de liste, mois précédent / suivant, retour). */
export function Chevron({ className, dir = 'right' }: { className?: string; dir?: 'left' | 'right' }) {
  return (
    <svg aria-hidden viewBox="0 0 9 14" className={cx('h-3.5 w-2.5 shrink-0', dir === 'left' && '-scale-x-100', className)} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M1.8 1.8 7 7l-5.2 5.2" />
    </svg>
  )
}

/** Croix (fermer, retirer). */
export function Cross({ className }: { className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 12 12" className={cx('size-3', className)} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round">
      <path d="M2 2l8 8M10 2l-8 8" />
    </svg>
  )
}
