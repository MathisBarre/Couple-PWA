// Ce qui est noté sur le calendrier : rectangle de couleur (flux), pointillés au crayon, éclair,
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

/** Flux du jour : un rectangle plein, du rose pâle (traces) au foncé (très abondant). Niveau 0 (« rien ») : un simple trait de crayon sous le chiffre. */
export function InkFlow({ day, level }: { day: string; level: number }) {
  if (level === 0) {
    const rand = rng(day)
    return <path className="sk-ink-none" pathLength={1} d={`M15 ${r1(34.5 + rand())}q${r1(6 + rand() * 2)} ${r1(-1.6 + rand())} 14 ${r1(rand() - 0.5)}`} />
  }
  return <rect className="sk-ink-block" x={7.5} y={7.5} width={29} height={29} rx={6.5} fill={`var(--color-flow-${level})`} />
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
