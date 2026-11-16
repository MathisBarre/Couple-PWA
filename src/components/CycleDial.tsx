import type { Flow } from '../../shared/cycles'

/** Rayon de la pastille d'encre selon le flux (0 = rien). */
const DOT = [0, 1.8, 3, 4.4, 5.8, 7.2]

/**
 * Cadran du cycle, dessiné comme une figure d'almanach : un cran par jour du cycle (le jour 1
 * en haut), les jours de règles en pastilles d'encre dont la taille suit le flux, une aiguille
 * sur le jour en cours et, au centre, une lune dont la phase suit l'avancée du cycle
 * (pleine encre au premier jour, vide à mi-cycle).
 * Les traits prennent la couleur du texte ; les pastilles, l'encre de l'espace
 * (ou `--dial-dot` si le cadran est posé sur un aplat).
 */
export function CycleDial({
  cycleDay,
  cycleLength,
  days,
  compact,
  className,
}: {
  /** Jour du cycle en cours (1 = premier jour des règles), ou null s'il n'y a rien à montrer. */
  cycleDay: number | null
  cycleLength: number
  /** Jours notés du cycle en cours : `n` = jour du cycle (à partir de 1). */
  days: { n: number; flow: Flow | null }[]
  /** Petit format (ligne de contexte) : traits plus gras, sans chiffres ni cercle intérieur. */
  compact?: boolean
  className?: string
}) {
  const k = compact ? 1.9 : 1
  const total = Math.max(cycleLength, cycleDay ?? 0, 1)
  const at = (n: number, r: number) => {
    const a = ((n - 1) / total) * 2 * Math.PI - Math.PI / 2
    return [100 + r * Math.cos(a), 100 + r * Math.sin(a)] as const
  }
  const fixed = (v: number) => v.toFixed(2)
  const ticks = Array.from({ length: total }, (_, i) => {
    const n = i + 1
    const week = (n - 1) % 7 === 0
    const [x1, y1] = at(n, 97)
    const [x2, y2] = at(n, week ? 97 - 8 * k : 97 - 4 * k)
    return <line key={n} x1={fixed(x1)} y1={fixed(y1)} x2={fixed(x2)} y2={fixed(y2)} strokeWidth={(week ? 1.4 : 0.8) * k} />
  })
  const labels = Array.from({ length: Math.ceil(total / 7) }, (_, i) => i * 7 + 1).filter((n) => n <= total - 2 || n === 1)

  return (
    <svg viewBox="0 0 200 200" className={className} role="img" aria-label={cycleDay ? `Jour ${cycleDay} sur ${total}` : 'Cadran du cycle'}>
      <g fill="none" stroke="currentColor">
        <circle cx="100" cy="100" r="97" strokeWidth={1.2 * k} />
        {!compact && <circle cx="100" cy="100" r="69" strokeWidth="0.8" />}
        {ticks}
      </g>
      <g fill="currentColor" fontFamily="var(--font-mono)" fontSize="9.500" textAnchor="middle" opacity="0.75">
        {!compact && labels.map((n) => {
          const [x, y] = at(n, 58)
          return (
            <text key={n} x={fixed(x)} y={fixed(y + 3.300)}>
              {n}
            </text>
          )
        })}
      </g>
      {/* Jours de règles : pastilles pleines, du point (traces) au gros rond (très abondant). */}
      <g fill="var(--dial-dot, var(--color-accent))">
        {days.map(({ n, flow }) => {
          if (!flow || n > total) return null
          const [x, y] = at(n, compact ? 72 : 80)
          return <circle key={n} cx={fixed(x)} cy={fixed(y)} r={DOT[flow] * (compact ? 1.25 : 1)} />
        })}
      </g>
      {cycleDay != null && <Hand tip={at(cycleDay, compact ? 72 : 80)} from={at(cycleDay, compact ? 34 : 36)} k={k} />}
      <Moon phase={cycleDay != null ? (cycleDay - 1) / total : 0.5} k={k} />
    </svg>
  )
}

/** Aiguille du jour : un trait depuis la lune, terminé par un anneau autour du jour en cours. */
function Hand({ tip, from, k }: { tip: readonly [number, number]; from: readonly [number, number]; k: number }) {
  const ring = k > 1 ? 14 : 9.5
  const [x, y] = tip
  const [fx, fy] = from
  // Le trait s'arrête au bord de l'anneau.
  const d = Math.hypot(x - fx, y - fy) || 1
  const ex = x - ((x - fx) / d) * ring
  const ey = y - ((y - fy) / d) * ring
  return (
    <g fill="none" stroke="currentColor" strokeWidth={1.6 * k}>
      <line x1={fx.toFixed(2)} y1={fy.toFixed(2)} x2={ex.toFixed(2)} y2={ey.toFixed(2)} />
      <circle cx={x.toFixed(2)} cy={y.toFixed(2)} r={ring} />
    </g>
  )
}

/** Lune au centre : `phase` de 0 (pleine encre) à 0,5 (vide) puis de retour vers 1 (pleine encre). */
function Moon({ phase, k: scale }: { phase: number; k: number }) {
  const r = 27
  const k = Math.cos(2 * Math.PI * phase) // 1 = pleine encre, −1 = vide
  const rx = (Math.abs(k) * r).toFixed(2)
  const waning = phase < 0.5
  // Demi-disque encré (à gauche quand l'encre décroît, à droite quand elle revient), fermé par
  // l'ellipse du terminateur.
  const half = `M100 ${100 - r}A${r} ${r} 0 0 ${waning ? 0 : 1} 100 ${100 + r}`
  const sweep = waning ? (k > 0 ? 0 : 1) : k > 0 ? 1 : 0
  return (
    <g>
      <path d={`${half}A${rx} ${r} 0 0 ${sweep} 100 ${100 - r}z`} fill="currentColor" />
      <circle cx="100" cy="100" r={r} fill="none" stroke="currentColor" strokeWidth={1.2 * scale} />
    </g>
  )
}
