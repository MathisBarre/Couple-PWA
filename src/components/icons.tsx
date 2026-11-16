// Pictogrammes au trait, dessinés comme des vignettes d'imprimerie : un seul trait fin,
// extrémités droites, aucune couleur propre (ils prennent l'encre du texte).
import type { ReactNode } from 'react'

const rays = (n: number, r1: number, r2: number, offset = 0) =>
  Array.from({ length: n }, (_, i) => {
    const a = offset + (i * 2 * Math.PI) / n
    const p = (r: number) => `${(12 + r * Math.cos(a)).toFixed(2)} ${(12 + r * Math.sin(a)).toFixed(2)}`
    return `M${p(r1)}L${p(r2)}`
  }).join('')

const ICONS = {
  /** Cycle : une goutte. */
  drop: <path d="M12 3.5c3.4 4.2 5.5 7.2 5.5 10.2a5.5 5.5 0 0 1-11 0c0-3 2.1-6 5.5-10.200z" />,
  /** Courses : un panier. */
  basket: <path d="M3.5 9.500h17l-1.700 10H5.200zM8 9.500l3-5.500M16 9.500l-3-5.500M9.500 13v3.500M12 13v3.500M14.500 13v3.500" />,
  calendar: <path d="M4 5.500h16v14H4zM4 9.500h16M8 3.500v4M16 3.500v4" />,
  chart: <path d="M3.500 20h17M7 20v-6M12 20V5M17 20v-10" />,
  /** Réglages : un cadran à crans. */
  gear: (
    <>
      <circle cx="12" cy="12" r="6" />
      <circle cx="12" cy="12" r="2" />
      <path d={rays(8, 6, 9.500, Math.PI / 8)} />
    </>
  ),
  list: <path d="M9 6.500h11.500M9 12h11.500M9 17.500h11.500M3.500 5.500h2v2h-2zM3.500 11h2v2h-2zM3.500 16.500h2v2h-2z" />,
  grid: <path d="M4 4h6.500v6.500H4zM13.500 4H20v6.500h-6.500zM4 13.500h6.500V20H4zM13.500 13.500H20V20h-6.500z" />,
  /** Apparence : un disque mi-encre, mi-papier. */
  contrast: (
    <>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 4a8 8 0 0 1 0 16z" fill="currentColor" stroke="none" />
    </>
  ),
  bell: <path d="M6.500 17v-6a5.500 5.500 0 0 1 11 0v6M4 17h16M10.500 20h3M12 3.500v2" />,
  /** Couple : deux anneaux qui se rejoignent (le logo de l'app). */
  rings: (
    <>
      <circle cx="9" cy="12" r="5.500" />
      <circle cx="15" cy="12" r="5.500" />
    </>
  ),
  phone: <path d="M7 3h10v18H7zM10.500 18h3" />,
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  sun: (
    <>
      <circle cx="12" cy="12" r="3.500" />
      <path d={rays(8, 6, 8.500)} />
    </>
  ),
  moon: <path d="M19 14.200A7.500 7.500 0 0 1 9.800 5a7.500 7.500 0 1 0 9.200 9.200z" />,
  close: <path d="M5.500 5.500l13 13M18.500 5.500l-13 13" />,
  plus: <path d="M12 4.500v15M4.500 12h15" />,
  check: <path d="M4.500 12.500l4.700 4.700L19.500 6.500" />,
  left: <path d="M20 12H4.500M10 6l-6 6 6 6" />,
  prev: <path d="M14.500 5l-7 7 7 7" />,
  next: <path d="M9.500 5l7 7-7 7" />,
} satisfies Record<string, ReactNode>

export type IconName = keyof typeof ICONS

export function Icon({ name, className = 'size-5', strokeWidth = 1.5 }: { name: IconName; className?: string; strokeWidth?: number }) {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="butt" strokeLinejoin="miter">
      {ICONS[name]}
    </svg>
  )
}
