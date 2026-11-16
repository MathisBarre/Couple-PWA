// Génère src/textures.css : les papiers de l'app, sous forme de tuiles SVG en data URI répétées
// en fond. Aucune image bitmap. Les filtres SVG (feTurbulence) ne sont calculés qu'une fois par
// tuile, pas à chaque défilement. Chaque surface de papier a le sien :
//   --tex-cal     bloc calendrier : papier épais, grain marqué, fibres visibles ;
//   --tex-pad     bloc de courses : papier d'écriture fin et lisse, grain serré ;
//   --tex-leaf    feuilles volantes (cartes, tuiles d'analyse) : grain moyen, quelques fibres ;
//   --tex-ephem   éphéméride : papier journal, grain grossier ;
//   --tex-card    carton d'invitation : carton lourd, moucheté ;
//   --tex-postit  pense-bête : grain fin, fibres verticales ;
//   --tex-sheet   feuilles de saisie : papier vergé (fines lignes d'eau).
// Chacun existe en clair (traces sombres) et en sombre (suffixe -dark, traces claires).
//   node scripts/skeuo-textures.mjs
import { writeFileSync } from 'node:fs'

const uri = (svg) =>
  `url("data:image/svg+xml,${svg
    .replace(/\s+/g, ' ')
    .replace(/> </g, '><')
    .trim()
    .replace(/%/g, '%25')
    .replace(/#/g, '%23')
    .replace(/</g, '%3C')
    .replace(/>/g, '%3E')
    .replace(/"/g, "'")}")`

/** Générateur pseudo-aléatoire à graine : les tuiles sont identiques d'une génération à l'autre. */
const rng = (seed) => () => {
  seed = (seed + 0x6d2b79f5) | 0
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}
const r1 = (n) => Math.round(n * 10) / 10

/**
 * Une couche de bruit : `freq` règle la taille du grain, `gain` et `cut` son contraste (seules les
 * crêtes du bruit au-dessus de `cut` marquent le papier), `octaves` sa finesse.
 */
const noise = (id, rgb, { freq, gain, cut, octaves = 3, seed = 1, type = 'fractalNoise' }) => ({
  def: `<filter id='${id}' x='0' y='0' width='100%' height='100%'>
      <feTurbulence type='${type}' baseFrequency='${freq}' numOctaves='${octaves}' seed='${seed}' stitchTiles='stitch'/>
      <feColorMatrix values='0 0 0 0 ${rgb[0]}  0 0 0 0 ${rgb[1]}  0 0 0 0 ${rgb[2]}  ${gain} 0 0 0 ${r1(-gain * cut * 100) / 100}'/>
    </filter>`,
  use: `<rect width='100%' height='100%' filter='url(#${id})'/>`,
})

/** Fibres : de courts brins courbes, semés au hasard (loin des bords de la tuile, pour le raccord). */
const fibres = (size, rgbCss, { count, len, width, alpha, seed, vertical = false }) => {
  const rand = rng(seed)
  let out = ''
  for (let i = 0; i < count; i++) {
    const l = len[0] + rand() * (len[1] - len[0])
    const x = l + rand() * (size - 2 * l)
    const y = l + rand() * (size - 2 * l)
    const a = vertical ? Math.PI / 2 + (rand() - 0.5) * 0.5 : rand() * Math.PI
    const dx = Math.cos(a) * l
    const dy = Math.sin(a) * l
    const bend = (rand() - 0.5) * l * 0.7
    out += `<path d='M${r1(x)} ${r1(y)}q${r1(dx / 2 - (dy / l) * bend)} ${r1(dy / 2 + (dx / l) * bend)} ${r1(dx)} ${r1(dy)}' stroke-opacity='${r1((0.4 + rand() * 0.6) * alpha * 100) / 100}'/>`
  }
  return `<g fill='none' stroke='${rgbCss}' stroke-width='${width}' stroke-linecap='round'>${out}</g>`
}

/** Mouchetures : petits points de matière (carton recyclé). */
const specks = (size, rgbCss, { count, alpha, seed }) => {
  const rand = rng(seed)
  let out = ''
  for (let i = 0; i < count; i++)
    out += `<circle cx='${r1(2 + rand() * (size - 4))}' cy='${r1(2 + rand() * (size - 4))}' r='${r1(0.3 + rand() * 0.6)}' fill-opacity='${r1((0.3 + rand() * 0.7) * alpha * 100) / 100}'/>`
  return `<g fill='${rgbCss}'>${out}</g>`
}

const tile = (size, layers) => {
  const defs = layers.map((l) => l.def ?? '').join('')
  const body = layers.map((l) => l.use ?? l).join('')
  return uri(`<svg xmlns='http://www.w3.org/2000/svg' width='${size}' height='${size}'>${defs}${body}</svg>`)
}

/** Encres des traces : sombres et chaudes sur papier clair, claires sur papier sombre. */
const INK = { light: [0.3, 0.22, 0.14], dark: [1, 0.96, 0.9] }
const css = (rgb) => `rgb(${rgb.map((c) => Math.round(c * 255)).join(' ')})`

/** `k` : force générale des traces (le sombre demande nettement moins). */
const papers = (mode) => {
  const ink = INK[mode]
  const c = css(ink)
  const k = mode === 'light' ? 1 : 0.42
  return {
    // Tout reste discret : on doit sentir le papier sans le voir derrière le texte. Les papiers
    // se distinguent par des nuances (finesse du grain, quelques fibres), pas par leur force.
    // Papier épais du bloc calendrier : grain un peu plus présent, de rares fibres pâles.
    cal: tile(280, [
      noise('c', ink, { freq: 0.012, gain: 0.06 * k, cut: 0.42, octaves: 2, seed: 11 }),
      noise('g', ink, { freq: 0.95, gain: 0.34 * k, cut: 0.4, seed: 3 }),
      fibres(280, c, { count: 14, len: [5, 13], width: 0.45, alpha: 0.12 * k, seed: 7 }),
    ]),
    // Papier d'écriture : lisse, grain très serré, pas de fibres.
    pad: tile(200, [noise('g', ink, { freq: 1.5, gain: 0.22 * k, cut: 0.38, octaves: 2, seed: 21 })]),
    // Feuille volante : entre les deux.
    leaf: tile(240, [
      noise('g', ink, { freq: 1.15, gain: 0.26 * k, cut: 0.4, seed: 31 }),
      fibres(240, c, { count: 6, len: [4, 9], width: 0.4, alpha: 0.1 * k, seed: 9 }),
    ]),
    // Papier journal de l'éphéméride : grain un peu plus gros.
    ephem: tile(160, [noise('g', ink, { freq: 0.75, gain: 0.34 * k, cut: 0.4, seed: 41 })]),
    // Carton lourd : pâte légèrement nuageuse, quelques mouchetures et fibres.
    card: tile(260, [
      noise('c', ink, { freq: 0.02, gain: 0.1 * k, cut: 0.4, octaves: 2, seed: 51 }),
      noise('g', ink, { freq: 0.6, gain: 0.36 * k, cut: 0.42, seed: 53 }),
      specks(260, c, { count: 36, alpha: 0.3 * k, seed: 17 }),
      fibres(260, c, { count: 12, len: [6, 15], width: 0.5, alpha: 0.16 * k, seed: 19 }),
    ]),
    // Pense-bête : papier fin, de rares fibres dans le sens du bloc.
    postit: tile(200, [
      noise('g', ink, { freq: 1.2, gain: 0.3 * k, cut: 0.4, octaves: 2, seed: 61 }),
      fibres(200, c, { count: 8, len: [4, 10], width: 0.4, alpha: 0.1 * k, seed: 23, vertical: true }),
    ]),
    // Papier vergé des feuilles de saisie : lignes d'eau à peine visibles, grain doux.
    sheet: tile(240, [
      noise('g', ink, { freq: 1, gain: 0.26 * k, cut: 0.4, seed: 71 }),
      noise('v', ink, { freq: '0.004 0.42', gain: 0.16 * k, cut: 0.45, octaves: 1, seed: 73 }),
    ]),
  }
}

const light = papers('light')
const dark = papers('dark')
const out = `/* Fichier généré par scripts/skeuo-textures.mjs : ne pas modifier à la main. */
:root {
${Object.entries(light)
  .map(([k, v]) => `  --tex-${k}: ${v};`)
  .join('\n')}
${Object.entries(dark)
  .map(([k, v]) => `  --tex-${k}-dark: ${v};`)
  .join('\n')}
}
`
writeFileSync(new URL('../src/textures.css', import.meta.url), out)
console.log('src/textures.css', out.length, 'octets')
