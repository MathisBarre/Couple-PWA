// Icônes de l'interface : traits fins (1,7 px), dessinées sur une grille de 24, couleur du texte.
import type { ReactNode } from 'react'

const PATHS: Record<string, ReactNode> = {
  // Espaces
  drop: <path d="M12 3.2c3 3.5 6 6.8 6 10.4a6 6 0 0 1-12 0c0-3.6 3-6.9 6-10.4Z" />,
  basket: (
    <>
      <path d="M3.5 9.5h17l-1.5 8.3a2.2 2.2 0 0 1-2.2 1.8H7.2A2.2 2.2 0 0 1 5 17.8Z" />
      <path d="m8.5 9.5 3.5-5.5 3.5 5.5" />
      <path d="M9.5 13.3v3M14.5 13.3v3" />
    </>
  ),
  sliders: (
    <>
      <path d="M4 7.5h9M17.5 7.5H20M4 16.5h2.5M11 16.5h9" />
      <circle cx="15.2" cy="7.5" r="2.2" />
      <circle cx="8.8" cy="16.5" r="2.2" />
    </>
  ),
  menu: <path d="M4.5 7.5h15M4.5 12h15M4.5 16.5h15" />,
  // Sous-écrans
  calendar: (
    <>
      <rect x="4" y="5.5" width="16" height="14.5" rx="3.2" />
      <path d="M4 10h16M8.5 3.5v3.5M15.5 3.5v3.5" />
    </>
  ),
  chart: <path d="M5 19.5v-6M10 19.5V5M15 19.5v-9M20 19.5v-4" />,
  gear: (
    <>
      <path d="M10.33 3.4a1.7 1.7 0 0 1 3.34 0l.2 1.02a1.7 1.7 0 0 0 2.36 1.23l.95-.43a1.7 1.7 0 0 1 2.36 2.36l-.43.95a1.7 1.7 0 0 0 1.23 2.36l1.02.2a1.7 1.7 0 0 1 0 3.34l-1.02.2a1.7 1.7 0 0 0-1.23 2.36l.43.95a1.7 1.7 0 0 1-2.36 2.36l-.95-.43a1.7 1.7 0 0 0-2.36 1.23l-.2 1.02a1.7 1.7 0 0 1-3.34 0l-.2-1.02a1.7 1.7 0 0 0-2.36-1.23l-.95.43a1.7 1.7 0 0 1-2.36-2.36l.43-.95a1.7 1.7 0 0 0-1.23-2.36l-1.02-.2a1.7 1.7 0 0 1 0-3.34l1.02-.2a1.7 1.7 0 0 0 1.23-2.36l-.43-.95a1.7 1.7 0 0 1 2.36-2.36l.95.43a1.7 1.7 0 0 0 2.36-1.23z" />
      <circle cx="12" cy="12" r="3.2" />
    </>
  ),
  list: (
    <>
      <path d="M9.5 7h10.5M9.5 12h10.5M9.5 17h10.5" />
      <path d="M4.5 7h.01M4.5 12h.01M4.5 17h.01" strokeWidth={2.6} />
    </>
  ),
  grid: (
    <>
      <rect x="4" y="4" width="6.8" height="6.8" rx="2" />
      <rect x="13.2" y="4" width="6.8" height="6.8" rx="2" />
      <rect x="4" y="13.2" width="6.8" height="6.8" rx="2" />
      <rect x="13.2" y="13.2" width="6.8" height="6.8" rx="2" />
    </>
  ),
  palette: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 3.5a8.5 8.5 0 0 0 0 17Z" fill="currentColor" stroke="none" />
    </>
  ),
  bell: (
    <>
      <path d="M6.5 16.5V11a5.5 5.5 0 0 1 11 0v5.5l1.5 2h-14Z" />
      <path d="M10.2 21a2 2 0 0 0 3.6 0" />
    </>
  ),
  hearts: (
    <>
      <circle cx="9" cy="12" r="5.5" />
      <circle cx="15" cy="12" r="5.5" />
    </>
  ),
  phone: (
    <>
      <rect x="7" y="3" width="10" height="18" rx="2.8" />
      <path d="M10.8 17.8h2.4" />
    </>
  ),
  sun: (
    <>
      <circle cx="12" cy="12" r="3.8" />
      <path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6 7 7M17 17l1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4" />
    </>
  ),
  moon: <path d="M19.5 14.2A8 8 0 0 1 9.8 4.5a8 8 0 1 0 9.7 9.7Z" />,
  // Petits signes
  check: <path d="m5.5 12.5 4.2 4.2 8.8-9.4" />,
  close: <path d="m6.5 6.5 11 11M17.5 6.5l-11 11" />,
  plus: <path d="M12 5v14M5 12h14" />,
  'chevron-left': <path d="m14.5 5.5-6.5 6.5 6.5 6.5" />,
  'chevron-right': <path d="m9.5 5.5 6.5 6.5-6.5 6.5" />,
  'chevron-down': <path d="m6 9.5 6 6 6-6" />,
}

/** Icône au trait. `name` : une clé de PATHS (les espaces et rubriques de src/modules.ts en portent une). */
export function Icon({ name, className = 'size-5', strokeWidth = 1.7 }: { name: string; className?: string; strokeWidth?: number }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {PATHS[name] ?? PATHS.grid}
    </svg>
  )
}
