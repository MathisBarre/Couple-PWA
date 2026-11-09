// Animations « comme une app native » : glissement entre onglets, empilement façon iOS.
// Tout passe par la Web Animations API sur `transform` / `opacity`, que le téléphone
// anime sur la carte graphique : ça reste fluide même pendant un rendu React.

/** Courbe des transitions iOS (démarrage vif, arrivée tout en douceur). */
export const EASE = 'cubic-bezier(0.32, 0.72, 0, 1)'
const TAB_MS = 360
const STACK_MS = 420
const FADE_MS = 160

/** « Réduire les animations » (Réglages → Accessibilité) : on remplace les glissements par un fondu bref. */
export const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches

/** Assombrissement de l'écran recouvert quand un écran s'empile par-dessus. */
const DIM = 0.12
/** L'écran recouvert recule d'un tiers de sa largeur, comme sur iOS. */
const PARALLAX = 0.3

type Cleanup = () => void

/**
 * Glisse d'un onglet à l'autre : l'ancien part d'un côté, le nouveau arrive de l'autre.
 * `dir` = 1 si le nouvel onglet est à droite de l'ancien, -1 sinon.
 * `from` doit rester visible pendant l'animation : on le force ici, puis on rend la main au CSS.
 * Renvoie une fonction qui termine tout de suite l'animation (nouveau changement d'onglet entre-temps).
 */
export function slideTabs(from: HTMLElement, to: HTMLElement, dir: 1 | -1, { inFlow = false } = {}): Cleanup {
  const reduce = reducedMotion()
  const restore = reveal(from, inFlow)
  const opts: KeyframeAnimationOptions = { duration: reduce ? FADE_MS : TAB_MS, easing: reduce ? 'ease-out' : EASE, fill: 'forwards' }
  const anims = reduce
    ? [from.animate([{ opacity: 1 }, { opacity: 0 }], opts), to.animate([{ opacity: 0 }, { opacity: 1 }], opts)]
    : [
        from.animate([{ transform: 'translateX(0)' }, { transform: `translateX(${-dir * 100}%)` }], opts),
        to.animate([{ transform: `translateX(${dir * 100}%)` }, { transform: 'translateX(0)' }], opts),
      ]
  let done = false
  const finish = () => {
    if (done) return
    done = true
    restore()
    anims.forEach((a) => a.cancel())
  }
  anims[1].onfinish = finish
  return finish
}

/** Rend visible un écran normalement caché (onglet inactif), le temps d'une animation. */
function reveal(el: HTMLElement, inFlow: boolean): Cleanup {
  const { visibility, position, inset, display } = el.style
  el.style.visibility = 'visible'
  if (inFlow) {
    // Panneau dans le flux de la page : on le sort du flux pour qu'il ne pousse pas le nouveau.
    el.style.display = 'block' // l'emporte sur l'attribut hidden, sans y toucher (React le gère)
    el.style.position = 'absolute'
    el.style.inset = '0 0 auto 0'
  }
  return () => Object.assign(el.style, { visibility, position, inset, display })
}

/**
 * Pile d'écrans façon iOS. `p` = avancement de l'écran du dessus : 1 = posé, 0 = sorti à droite.
 * L'écran dessous recule et s'assombrit à mesure que celui du dessus arrive.
 */
export function stackFrames(width: number, p: number) {
  return {
    top: `translateX(${(1 - p) * width}px)`,
    under: `translateX(${-PARALLAX * width * p}px)`,
    dim: DIM * p,
  }
}

/** Pose les styles d'une étape du geste de retour (le doigt pilote directement). */
export function setStackProgress(under: HTMLElement, top: HTMLElement, p: number) {
  const f = stackFrames(top.clientWidth, p)
  top.style.transform = f.top
  under.style.transform = f.under
  dimOf(under).style.opacity = String(f.dim)
}

export function clearStackStyles(under: HTMLElement, top: HTMLElement) {
  top.style.transform = ''
  under.style.transform = ''
  dimOf(under).style.opacity = ''
}

const dimOf = (layer: HTMLElement) => layer.querySelector<HTMLElement>(':scope > [data-dim]')!

/**
 * Anime la pile de `fromP` à `toP` (1 = empiler, 0 = dépiler). `velocity` (px/ms) raccourcit la
 * fin d'un geste lancé vite. Avant de nettoyer, `beforeCleanup` laisse React retirer l'écran dépilé,
 * pour éviter qu'il ne réapparaisse une image.
 */
export function animateStack(
  under: HTMLElement,
  top: HTMLElement,
  fromP: number,
  toP: number,
  { velocity = 0, beforeCleanup }: { velocity?: number; beforeCleanup?: () => void } = {},
): Cleanup {
  const reduce = reducedMotion()
  const w = top.clientWidth
  const restore = reveal(under, false)
  const distance = Math.abs(toP - fromP)
  let duration = reduce ? FADE_MS : STACK_MS * Math.max(distance, 0.35)
  if (velocity > 0) duration = Math.min(duration, Math.max(180, (distance * w) / velocity) * 1.6)
  const opts: KeyframeAnimationOptions = { duration, easing: reduce ? 'ease-out' : EASE, fill: 'forwards' }
  const a = stackFrames(w, fromP)
  const b = stackFrames(w, toP)
  const anims = reduce
    ? [top.animate([{ opacity: fromP }, { opacity: toP }], opts)]
    : [
        top.animate([{ transform: a.top }, { transform: b.top }], opts),
        under.animate([{ transform: a.under }, { transform: b.under }], opts),
        dimOf(under).animate([{ opacity: a.dim }, { opacity: b.dim }], opts),
      ]
  clearStackStyles(under, top)
  let done = false
  const finish = () => {
    if (done) return
    done = true
    beforeCleanup?.()
    restore()
    anims.forEach((x) => x.cancel())
  }
  anims[0].onfinish = finish
  return finish
}
