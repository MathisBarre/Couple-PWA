// Ce qui est écrit à la main sur le calendrier : coloriage au feutre, pointillés au crayon, éclair,
// cercle d'encre. Chaque tracé est légèrement irrégulier, et différent d'un jour à l'autre : il est
// tiré d'un hasard dont la graine est la date (toujours le même dessin pour un même jour).
// Tout est dessiné dans une case de 44 × 44 (voir .sk-ink dans src/skeuo.css).
import type { ReactNode } from 'react'
import { cx } from './ui'

const C = 22

function rng(key: string) {
  let seed = 2166136261
  for (let i = 0; i < key.length; i++) seed = Math.imul(seed ^ key.charCodeAt(i), 16777619)
  return () => {
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const r1 = (n: number) => Math.round(n * 10) / 10

/** Feutre plus ou moins appuyé : nombre d'allers-retours et largeur de la pointe, par niveau de flux. */
const PASSES = [0, 6, 8, 9, 10, 11]
const TIP = [0, 4, 4.4, 4.8, 5.4, 6]
/** Rayon de la zone coloriée, pointe comprise : le coloriage ne déborde pas sur l'éclair ni sur le cercle d'aujourd'hui. */
const R = [0, 14.5, 15.5, 16, 16.5, 16.5]

/** Coloriage en zigzag, de haut en bas, dans un rond approximatif. */
function scribblePath(key: string, level: number) {
  const rand = rng(key)
  const n = PASSES[level]
  const r = R[level] - TIP[level] / 2
  let d = ''
  for (let i = 0; i < n; i++) {
    const y = -r + ((i + 0.5) / n) * 2 * r + (rand() - 0.5) * 1.4
    const half = Math.max(4, Math.sqrt(Math.max(0, r * r - y * y)) * (0.9 + rand() * 0.16))
    const x = (i % 2 ? half : -half) + (rand() - 0.5) * 1.2
    d += `${i ? 'L' : 'M'}${r1(C + x)} ${r1(C + y)}`
  }
  return { d, angle: Math.round(-22 + rand() * 14) }
}

/** Boucle fermée irrégulière (cercle tracé à la main), lissée par des courbes. */
function loopPath(key: string, radius: number, wobble: number) {
  const rand = rng(key)
  const start = rand() * Math.PI * 2
  const pts = Array.from({ length: 8 }, (_, i) => {
    const a = start + (i / 8) * Math.PI * 2
    const rr = radius + (rand() - 0.5) * wobble
    return [C + Math.cos(a) * rr, C + Math.sin(a) * rr]
  })
  const mid = (a: number[], b: number[]) => `${r1((a[0] + b[0]) / 2)} ${r1((a[1] + b[1]) / 2)}`
  let d = `M${mid(pts[7], pts[0])}`
  for (let i = 0; i < 8; i++) d += `Q${r1(pts[i][0])} ${r1(pts[i][1])} ${mid(pts[i], pts[(i + 1) % 8])}`
  return d
}

/** Le calque d'encre d'une case. `tracing` : ce qui vient d'être noté se trace sous les yeux. */
export function DayInk({ tracing, children }: { tracing?: boolean; children: ReactNode }) {
  return (
    <svg aria-hidden viewBox="0 0 44 44" className="sk-ink" data-tracing={tracing || undefined}>
      {children}
    </svg>
  )
}

/** Flux du jour : colorié au feutre, de quelques hachures pâles (traces) au plein foncé (très abondant). Niveau 0 (« rien ») : un simple trait de crayon sous le chiffre. */
export function InkScribble({ day, level }: { day: string; level: number }) {
  if (level === 0) {
    const rand = rng(day)
    return <path className="sk-ink-none" pathLength={1} d={`M15 ${r1(34.5 + rand())}q${r1(6 + rand() * 2)} ${r1(-1.6 + rand())} 14 ${r1(rand() - 0.5)}`} />
  }
  const { d, angle } = scribblePath(day, level)
  return (
    <path
      className="sk-ink-fill"
      pathLength={1}
      d={d}
      transform={`rotate(${angle} ${C} ${C})`}
      stroke={`var(--color-flow-${level})`}
      strokeWidth={TIP[level]}
    />
  )
}

/** Règles prévues : un rond en pointillés, au crayon de couleur. */
export function InkPredicted({ day }: { day: string }) {
  return <path className="sk-ink-predicted" d={loopPath(day, 14.2, 1.6)} />
}

/** Douleur : un petit éclair au crayon, dans le coin de la case, à l'écart du coloriage. */
export function InkBolt() {
  return <path className="sk-ink-bolt" pathLength={1} d="M40.4 1.6 37.6 6l3.3-.5-2.6 4.3" />
}

/** Aujourd'hui : entouré d'un trait d'encre. */
export function InkToday({ still }: { still?: boolean }) {
  return (
    <path
      transform="translate(22 22) scale(1.1) translate(-22 -22)"
      className={cx('sk-ink-today', !still && 'sk-ink-today-draw')}
      pathLength={1}
      d="M26.5 4.4C15.8 1.9 5.3 9.6 4.4 21.2 3.5 33 12 40.1 22.6 39.7 33.4 39.3 40.3 31.6 39.6 21 39 11.2 31.4 4.7 20 5.6"
    />
  )
}
