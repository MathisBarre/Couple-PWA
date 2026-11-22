// Animations « comme une app native » : glissement entre onglets, empilement façon iOS.
// Tout passe par la Web Animations API sur `transform` / `opacity`, que le téléphone
// anime sur la carte graphique : ça reste fluide même pendant un rendu React.
import { DESKTOP_QUERY } from './desktop'

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
  // Ordinateur : pas de glissement d'écran (geste de téléphone), un fondu rapide.
  const reduce = reducedMotion() || isDesktop()
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
  // Ordinateur : l'écran empilé apparaît en fondu au lieu d'arriver par la droite.
  const reduce = reducedMotion() || isDesktop()
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

const PAGE_MS = 440
/** Nombre de bandes horizontales de la feuille qui se courbe. */
const STRIPS = 14
/** Largeur du pli, en bandes : plus c'est grand, plus la courbure est ample. */
const BEND = 6
/** Angle total de la feuille retournée par-dessus la reliure. */
const FOLDED = 166
/** Instants calculés (le navigateur interpole entre eux). */
const SAMPLES = 16

const shadeOf = (pageEl: HTMLElement) => pageEl.querySelector<HTMLElement>(':scope > [data-shade]')
const smooth = (x: number) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x))
const r2 = (n: number) => Math.round(n * 100) / 100

interface Strip {
  el: HTMLElement
  /**
   * Ombres du recto et du verso de la bande (opacité). Deux dégradés par face, l'un plein en haut,
   * l'autre plein en bas : en réglant l'opacité de chacun, l'ombre passe sans marche d'une bande à
   * la suivante.
   */
  front: [HTMLElement, HTMLElement]
  back: [HTMLElement, HTMLElement]
}

/**
 * Copie de la feuille découpée en bandes horizontales emboîtées (chaque bande est accrochée au bas
 * de la précédente et pivote autour de cette charnière) : en les faisant tourner un peu chacune,
 * la feuille se courbe. Chaque bande montre sa tranche de la copie au recto, du papier nu au verso.
 */
function buildCurl(source: HTMLElement): { root: HTMLElement; strips: Strip[] } {
  const width = source.offsetWidth
  const height = source.offsetHeight
  const h = height / STRIPS
  const proto = source.cloneNode(true) as HTMLElement
  proto.removeAttribute('style')
  proto.className = 'sk-page'
  // Rien ne se retrace sur la copie.
  proto.querySelectorAll('.sk-ink-today-draw').forEach((e) => e.classList.remove('sk-ink-today-draw'))
  proto.querySelectorAll('[data-tracing]').forEach((e) => e.removeAttribute('data-tracing'))
  const div = (className: string, parent: HTMLElement) => {
    const el = document.createElement('div')
    el.className = className
    parent.append(el)
    return el
  }
  const root = document.createElement('div')
  root.className = 'sk-curl'
  root.inert = true
  root.setAttribute('aria-hidden', 'true')
  const strips: Strip[] = []
  let parent = root
  for (let i = 0; i < STRIPS; i++) {
    const el = div('sk-curl-strip', parent)
    el.style.cssText = `top:${i ? h : 0}px;height:${h}px`
    const front = div('sk-curl-face', el)
    // Un demi-pixel de recouvrement : pas de jour entre deux bandes.
    front.style.height = `${h + 0.6}px`
    const slice = proto.cloneNode(true) as HTMLElement
    slice.style.cssText = `position:absolute;left:0;top:${-i * h}px;width:${width}px;height:${height}px`
    front.append(slice)
    const back = div('sk-curl-face sk-curl-back', el)
    back.style.height = `${h + 0.6}px`
    if (i === 0) back.dataset.edge = 'top'
    if (i === STRIPS - 1) back.dataset.edge = 'bottom'
    strips.push({
      el,
      front: [div('sk-curl-shade', front), div('sk-curl-shade sk-curl-shade-low', front)],
      back: [div('sk-curl-shade', back), div('sk-curl-shade sk-curl-shade-low', back)],
    })
    parent = el
  }
  return { root, strips }
}

/**
 * Le geste, instant par instant : le pli part du bas de la feuille et remonte vers la reliure.
 * Au-dessus du pli la feuille est encore à plat ; en dessous elle est déjà retournée. Pour chaque
 * instant : l'angle de chaque bande par rapport à la précédente, et l'ombre de ses deux faces
 * (le recto s'assombrit en se détournant de la lumière, le verso reste un ton plus sombre).
 */
function curlFrames(n: number) {
  return Array.from({ length: SAMPLES + 1 }, (_, k) => {
    const at = k / SAMPLES
    // Départ retenu (la feuille se décolle), puis elle file.
    const e = at * at * (2.2 - 1.2 * at)
    const fold = n + BEND / 2 - e * (n + BEND + 0.5)
    const angle = (i: number) => FOLDED * smooth((i - fold) / BEND + 0.5)
    const sin = (i: number) => Math.sin((angle(i) * Math.PI) / 180)
    const turn: number[] = []
    const front: [number, number][] = []
    const back: [number, number][] = []
    for (let i = 0; i < n; i++) {
      turn.push(r2(angle(i) - (i ? angle(i - 1) : 0)))
      // Ombre au bord haut et au bord bas de la bande (le verso est retourné : haut et bas échangés).
      const top = sin(i - 0.5)
      const low = sin(i + 0.5)
      front.push([r2(0.38 * top), r2(0.38 * low)])
      back.push([r2(0.07 + 0.3 * low), r2(0.07 + 0.3 * top)])
    }
    return { at, turn, front, back }
  })
}

/**
 * Tourne la page du bloc calendrier (voir .sk-pages dans src/skeuo.css). `page` porte déjà le
 * nouveau mois ; `ghost` est la feuille qu'on quitte, posée exactement au même endroit.
 * - `dir` = 1 (mois suivant) : l'ancienne feuille se décolle par le bas, s'enroule en remontant
 *   vers la reliure et passe derrière le bloc ; la nouvelle est dessous ;
 * - `dir` = -1 (mois précédent) : le même geste à l'envers, la feuille revient se dérouler
 *   par-dessus celle qu'on quitte.
 * La courbure vient d'une copie de la feuille découpée en bandes (buildCurl). Seulement `transform`
 * et `opacity`. Renvoie de quoi tout arrêter net (nouvel appui pendant que ça tourne).
 */
export function turnPage(page: HTMLElement, ghost: HTMLElement, dir: 1 | -1, done: () => void): Cleanup {
  const anims: Animation[] = []
  let curl: HTMLElement | null = null
  if (reducedMotion()) {
    ghost.style.zIndex = '2'
    anims.push(ghost.animate([{ opacity: 1 }, { opacity: 0 }], { duration: FADE_MS, easing: 'ease-out', fill: 'forwards' }))
  } else {
    const turning = dir === 1 ? ghost : page
    const under = dir === 1 ? page : ghost
    const opts: KeyframeAnimationOptions = { duration: PAGE_MS, fill: 'both', direction: dir === 1 ? 'normal' : 'reverse' }
    // La feuille qui tourne est remplacée, le temps du geste, par sa copie découpée en bandes.
    const built = buildCurl(turning)
    curl = built.root
    turning.parentElement!.append(curl)
    turning.style.visibility = 'hidden'
    const frames = curlFrames(built.strips.length)
    built.strips.forEach((s, i) => {
      anims.push(s.el.animate(frames.map((f) => ({ transform: `rotateX(${f.turn[i]}deg)`, offset: f.at })), opts))
      for (const g of [0, 1] as const) {
        anims.push(s.front[g].animate(frames.map((f) => ({ opacity: f.front[i][g], offset: f.at })), opts))
        anims.push(s.back[g].animate(frames.map((f) => ({ opacity: f.back[i][g], offset: f.at })), opts))
      }
    })
    // Passée par-dessus la reliure, la feuille file derrière le bloc (.sk-pages la coupe à son bord).
    anims.unshift(curl.animate([{ opacity: 1 }, { opacity: 1, offset: 0.85 }, { opacity: 0 }], opts))
    // Son ombre sur la feuille du dessous, et celle de la reliure sur la feuille qui se soulève.
    const cast = shadeOf(under)
    if (cast) anims.push(cast.animate([{ opacity: 0 }, { opacity: 0.4, offset: 0.3 }, { opacity: 0.25, offset: 0.7 }, { opacity: 0 }], opts))
    const binding = page.closest('.sk-block')?.querySelector<HTMLElement>('[data-binding-shade]')
    if (binding) anims.push(binding.animate([{ opacity: 0 }, { opacity: 1, offset: 0.55 }, { opacity: 0 }], opts))
  }
  let ended = false
  const stop = () => {
    if (ended) return
    ended = true
    anims.forEach((a) => a.cancel())
    curl?.remove()
    // La feuille quittée (ghost) reste cachée : React la retire au rendu suivant.
    page.style.visibility = ''
    page.style.zIndex = ''
  }
  anims[0].onfinish = () => {
    stop()
    done()
  }
  return stop
}

/**
 * Déplacement de mise en page (« FLIP ») : l'élément repart de là où il était avant le rendu et
 * glisse jusqu'à sa nouvelle place. `dy` = ancienne position moins la nouvelle.
 */
export function slideFrom(el: HTMLElement, dy: number, { duration = 260, delay = 0 } = {}) {
  if (!dy || reducedMotion()) return
  el.animate([{ transform: `translateY(${dy}px)` }, { transform: 'translateY(0)' }], { duration, delay, easing: EASE, fill: 'backwards' })
}

/** Ordinateur (même règle que useDesktop) : les transitions d'écran se font en fondu. */
function isDesktop() {
  return typeof matchMedia !== 'undefined' && matchMedia(DESKTOP_QUERY).matches
}
