// Icônes dessinées dans le style des barres d'onglets d'avant iOS 7 : formes pleines, remplies d'un
// dégradé clair → foncé (variables --tab-hi / --tab-lo, voir .sk-glyph dans src/skeuo.css).
// Les espaces et rubriques (src/modules.ts) gardent leur emoji comme identifiant : `Glyph` le
// remplace par le dessin correspondant, et retombe sur l'emoji s'il n'en connaît pas.
import { useId, type ReactNode } from 'react'
import { cx } from './ui'

/** Roue dentée : couronne + 8 dents, calculées une fois. */
const gear = (() => {
  const p = (r: number, a: number) => `${(12 + r * Math.cos(a)).toFixed(2)} ${(12 + r * Math.sin(a)).toFixed(2)}`
  let d = ''
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4
    d += `${i ? 'L' : 'M'}${p(7.6, a - 0.3)}L${p(10.6, a - 0.17)}L${p(10.6, a + 0.17)}L${p(7.6, a + 0.3)}`
  }
  return `${d}ZM12 8.6a3.4 3.4 0 1 0 0 6.8 3.4 3.4 0 0 0 0-6.8Z`
})()

const heart = 'M12 21C6.5 16.6 3 13.4 3 9.4 3 6.6 5.1 4.5 7.8 4.5c1.7 0 3.2.9 4.2 2.3 1-1.4 2.5-2.3 4.2-2.3 2.7 0 4.8 2.1 4.8 4.9 0 4-3.5 7.2-9 11.6Z'

/** Dessins 24 × 24, en `fill-rule: evenodd`. */
const PATHS: Record<string, ReactNode> = {
  // Goutte
  '💧': <path d="M12 2.2c3.9 4.6 6.8 8.3 6.8 12a6.8 6.8 0 0 1-13.6 0c0-3.7 2.9-7.4 6.8-12ZM8.3 14.3a.9.9 0 0 0-.9 1c.2 2 1.7 3.5 3.7 3.8a.9.9 0 1 0 .2-1.8 2.5 2.5 0 0 1-2.1-2.2.9.9 0 0 0-.9-.8Z" />,
  // Chariot
  '🛒': (
    <>
      <path d="M1.5 3.2h3.1c.5 0 .9.3 1 .8l.5 2h15.4c.7 0 1.1.6 1 1.2l-1.7 7.1c-.2.9-1 1.5-1.9 1.5H9.2c-.9 0-1.7-.6-1.9-1.5L4.9 5H1.5a.9.9 0 1 1 0-1.8ZM8.4 9.3h11.9l.3-1.4H8Zm.5 2 .3 1.5h10.3l.4-1.5Z" />
      <circle cx="9.6" cy="19.3" r="1.8" />
      <circle cx="18" cy="19.3" r="1.8" />
    </>
  ),
  // Roue dentée
  '⚙️': <path d={gear} />,
  // Trois barres
  '☰': <path d="M4 5.5h16a1.3 1.3 0 0 1 0 2.6H4a1.3 1.3 0 0 1 0-2.6Zm0 5.2h16a1.3 1.3 0 0 1 0 2.6H4a1.3 1.3 0 0 1 0-2.6Zm0 5.2h16a1.3 1.3 0 0 1 0 2.6H4a1.3 1.3 0 0 1 0-2.6Z" />,
  // Calendrier
  '📅': <path d="M7 2.5a1 1 0 0 1 2 0V4h6V2.5a1 1 0 0 1 2 0V4h1.5A2.5 2.5 0 0 1 21 6.5v12a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 18.5v-12A2.5 2.5 0 0 1 5.5 4H7ZM5 9.5v9c0 .3.2.5.5.5h13c.3 0 .5-.2.5-.5v-9Zm2 2h3v3H7Z" />,
  // Graphique en barres
  '📊': <path d="M4 12.5h3.5c.3 0 .5.2.5.5V20c0 .3-.2.5-.5.5H4a.5.5 0 0 1-.5-.5v-7c0-.3.2-.5.5-.5Zm6.3-9h3.4c.3 0 .5.2.5.5v16c0 .3-.2.5-.5.5h-3.4a.5.5 0 0 1-.5-.5V4c0-.3.2-.5.5-.5Zm6.2 5H20c.3 0 .5.2.5.5v11c0 .3-.2.5-.5.5h-3.5a.5.5 0 0 1-.5-.5V9c0-.3.2-.5.5-.5Z" />,
  // Feuille de notes
  '📝': <path d="M6.5 2.5h11A2.5 2.5 0 0 1 20 5v14a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 19V5a2.5 2.5 0 0 1 2.5-2.5Zm1.5 5v1.6h8V7.5Zm0 3.7v1.6h8v-1.6Zm0 3.7v1.6h5v-1.6Z" />,
  // Quatre cases (espaces)
  '🧩': <path d="M4.5 3h5c.8 0 1.5.7 1.5 1.5v5c0 .8-.7 1.5-1.5 1.5h-5C3.7 11 3 10.3 3 9.5v-5C3 3.7 3.7 3 4.5 3Zm10 0h5c.8 0 1.5.7 1.5 1.5v5c0 .8-.7 1.5-1.5 1.5h-5c-.8 0-1.5-.7-1.5-1.5v-5c0-.8.7-1.5 1.5-1.5Zm-10 10h5c.8 0 1.5.7 1.5 1.5v5c0 .8-.7 1.5-1.5 1.5h-5c-.8 0-1.5-.7-1.5-1.5v-5c0-.8.7-1.5 1.5-1.5Zm10 0h5c.8 0 1.5.7 1.5 1.5v5c0 .8-.7 1.5-1.5 1.5h-5c-.8 0-1.5-.7-1.5-1.5v-5c0-.8.7-1.5 1.5-1.5Z" />,
  // Disque mi-clair mi-sombre (apparence)
  '🎨': <path d="M12 2.5a9.5 9.5 0 1 1 0 19 9.5 9.5 0 0 1 0-19Zm0 2.2v14.6a7.3 7.3 0 0 0 0-14.6Z" />,
  // Cloche
  '🔔': <path d="M12 2.2c.8 0 1.4.6 1.4 1.4v.5c2.7.6 4.6 3 4.6 5.9v3.8l1.7 2.5c.4.7 0 1.5-.8 1.5H5.1c-.8 0-1.2-.8-.8-1.5L6 13.8V10c0-2.9 1.9-5.3 4.6-5.9v-.5c0-.8.6-1.4 1.4-1.4ZM9.7 19.3h4.6a2.3 2.3 0 0 1-4.6 0Z" />,
  // Cœur
  '💞': <path d={heart} />,
  // Téléphone
  '📲': <path d="M8 1.8h8A2.2 2.2 0 0 1 18.2 4v16a2.2 2.2 0 0 1-2.2 2.2H8A2.2 2.2 0 0 1 5.8 20V4A2.2 2.2 0 0 1 8 1.8Zm-.2 3.2v12.5h8.4V5Zm4.2 14a1.1 1.1 0 1 0 0 2.2 1.1 1.1 0 0 0 0-2.2Z" />,
  // Soleil
  '☀️': (
    <>
      <circle cx="12" cy="12" r="4.6" />
      <path d="M12 1.8c.6 0 1 .4 1 1v2a1 1 0 0 1-2 0v-2c0-.6.4-1 1-1Zm0 16.4c.6 0 1 .4 1 1v2a1 1 0 0 1-2 0v-2c0-.6.4-1 1-1ZM1.8 12c0-.6.4-1 1-1h2a1 1 0 0 1 0 2h-2a1 1 0 0 1-1-1Zm16.4 0c0-.6.4-1 1-1h2a1 1 0 0 1 0 2h-2a1 1 0 0 1-1-1ZM4.8 4.8a1 1 0 0 1 1.4 0l1.4 1.4a1 1 0 0 1-1.4 1.4L4.8 6.2a1 1 0 0 1 0-1.4Zm11.6 11.6a1 1 0 0 1 1.4 0l1.4 1.4a1 1 0 0 1-1.4 1.4l-1.4-1.4a1 1 0 0 1 0-1.4Zm2.8-11.6a1 1 0 0 1 0 1.4l-1.4 1.4a1 1 0 0 1-1.4-1.4l1.4-1.4a1 1 0 0 1 1.4 0ZM7.6 16.4a1 1 0 0 1 0 1.4l-1.4 1.4a1 1 0 0 1-1.4-1.4l1.4-1.4a1 1 0 0 1 1.4 0Z" />
    </>
  ),
  // Lune
  '🌙': <path d="M10.2 2.6a.8.8 0 0 1 .9 1.1 7.7 7.7 0 0 0 9.5 10.4.8.8 0 0 1 1 1A10 10 0 1 1 10.2 2.6Z" />,
}
PATHS['📱'] = PATHS['📲']

/** Icône en relief pour un emoji connu ; l'emoji lui-même sinon. */
export function Glyph({ icon, className }: { icon: string; className?: string }) {
  const id = useId()
  const shape = PATHS[icon]
  if (!shape) return <span className={className}>{icon}</span>
  return (
    <svg aria-hidden viewBox="0 0 24 24" className={cx('sk-glyph', className)} fill={`url(#${id})`} fillRule="evenodd">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" className="hi" />
          <stop offset="1" className="lo" />
        </linearGradient>
      </defs>
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

/** Chevron des lignes de tableau groupé. */
export function Chevron({ className }: { className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 9 14" className={cx('h-3.5 w-2.5 shrink-0', className)} fill="none" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round">
      <path d="M1.8 1.8 7 7l-5.2 5.2" />
    </svg>
  )
}

/** Flèche des boutons « mois précédent / suivant ». */
export function Arrow({ dir }: { dir: 'left' | 'right' }) {
  return (
    <svg aria-hidden viewBox="0 0 12 14" className="h-3.5 w-3" fill="currentColor">
      <path d={dir === 'left' ? 'M10.5 1.2v11.6L1.5 7Z' : 'M1.5 1.2v11.6L10.5 7Z'} />
    </svg>
  )
}

/** Croix (fermer, retirer). */
export function Cross({ className }: { className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 12 12" className={cx('size-3', className)} fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round">
      <path d="M2 2l8 8M10 2l-8 8" />
    </svg>
  )
}
