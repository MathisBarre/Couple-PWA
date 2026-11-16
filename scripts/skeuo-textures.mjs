// Génère src/textures.css : les matières (cuir, papier, lin, papier déchiré, spirale…) sous forme de
// petites tuiles SVG en data URI, répétées en fond. Aucune image bitmap : tout est dessiné ici.
// Les filtres SVG (feTurbulence) ne sont calculés qu'une fois par tuile, pas à chaque défilement.
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

const svg = (w, h, body) => `<svg xmlns='http://www.w3.org/2000/svg' width='${w}' height='${h}' viewBox='0 0 ${w} ${h}'>${body}</svg>`

/** Cuir : relief éclairé de biais, centré sur le gris moyen (neutre en fusion « soft-light » / « overlay »). */
const leather = svg(
  240,
  240,
  `<filter id='l' x='0' y='0' width='100%' height='100%'>
    <feTurbulence type='fractalNoise' baseFrequency='.42' numOctaves='4' seed='7' stitchTiles='stitch' result='n'/>
    <feDiffuseLighting in='n' lighting-color='#fff' surfaceScale='1.5' diffuseConstant='1'><feDistantLight azimuth='240' elevation='30'/></feDiffuseLighting>
  </filter>
  <rect width='100%' height='100%' filter='url(#l)'/>`,
)

/** Grain de papier : fibres brunes très légères (ou claires pour le papier sombre). */
const grain = (rgb, alpha, freq = 0.75, seed = 3) =>
  svg(
    200,
    200,
    `<filter id='p' x='0' y='0' width='100%' height='100%'>
      <feTurbulence type='fractalNoise' baseFrequency='${freq}' numOctaves='4' seed='${seed}' stitchTiles='stitch'/>
      <feColorMatrix values='0 0 0 0 ${rgb[0]}  0 0 0 0 ${rgb[1]}  0 0 0 0 ${rgb[2]}  0 0 0 ${alpha} ${-alpha * 0.28}'/>
    </filter>
    <rect width='100%' height='100%' filter='url(#p)'/>`,
  )

/** Lin : fils horizontaux sombres et fils verticaux clairs, tissés. */
const linen = (dark, light) =>
  svg(
    180,
    180,
    `<filter id='a' x='0' y='0' width='100%' height='100%'>
      <feTurbulence type='fractalNoise' baseFrequency='.012 .85' numOctaves='2' seed='2' stitchTiles='stitch'/>
      <feColorMatrix values='0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 ${dark} ${-dark * 0.36}'/>
    </filter>
    <filter id='b' x='0' y='0' width='100%' height='100%'>
      <feTurbulence type='fractalNoise' baseFrequency='.85 .012' numOctaves='2' seed='9' stitchTiles='stitch'/>
      <feColorMatrix values='0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 ${light} ${-light * 0.36}'/>
    </filter>
    <rect width='100%' height='100%' filter='url(#a)'/>
    <rect width='100%' height='100%' filter='url(#b)'/>`,
  )

// Générateur pseudo-aléatoire à graine : le fichier produit est stable d'une exécution à l'autre.
let seed = 42
const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646

/** Bord dentelé périodique (largeur w), autour de la hauteur y. */
function jag(w, y, amp, step) {
  const pts = []
  for (let x = 0; x < w; x += step * (0.5 + rnd())) pts.push([Math.round(x * 10) / 10, Math.round((y + (rnd() - 0.5) * 2 * amp) * 10) / 10])
  pts[0] = [0, y]
  const all = [-1, 0, 1].flatMap((k) => pts.map(([x, yy]) => [x + k * w, yy]))
  return all.map(([x, yy]) => `${x} ${yy}`).join('L')
}

/** Restes de pages arrachées sous la reliure de l'agenda (deux feuilles + ombre du cuir). */
const torn = (front, back) => {
  const w = 320
  return svg(
    w,
    18,
    `<defs>
      <linearGradient id='s' x2='0' y2='1'><stop offset='0' stop-opacity='.42'/><stop offset='1' stop-opacity='0'/></linearGradient>
      <filter id='d' x='-10%' y='-60%' width='120%' height='300%'><feGaussianBlur in='SourceAlpha' stdDeviation='.9'/><feOffset dy='1.2'/><feComponentTransfer><feFuncA type='linear' slope='.4'/></feComponentTransfer><feMerge><feMergeNode/><feMergeNode in='SourceGraphic'/></feMerge></filter>
    </defs>
    <path filter='url(#d)' fill='${back}' d='M${-w} -4L${jag(w, 11, 1.6, 9)}L${2 * w} -4Z'/>
    <path filter='url(#d)' fill='${front}' d='M${-w} -4L${jag(w, 6.5, 1.8, 7)}L${2 * w} -4Z'/>
    <rect width='${w}' height='6' fill='url(#s)'/>`,
  )
}

/** Spirale du bloc-notes : un anneau métallique qui passe de la couverture (haut) au papier (bas). */
const rings = (paperHole) =>
  svg(
    26,
    36,
    `<defs>
      <linearGradient id='m' x2='1' y2='0'>
        <stop offset='0' stop-color='#6d6d6d'/><stop offset='.3' stop-color='#fafafa'/><stop offset='.55' stop-color='#a9a9a9'/><stop offset='1' stop-color='#4a4a4a'/>
      </linearGradient>
      <linearGradient id='s' x2='0' y2='1'><stop offset='0' stop-opacity='.4'/><stop offset='1' stop-opacity='0'/></linearGradient>
    </defs>
    <rect y='14' width='26' height='7' fill='url(#s)'/>
    <ellipse cx='13' cy='6.5' rx='4.2' ry='3.6' fill='#000' fill-opacity='.55'/>
    <ellipse cx='13' cy='27' rx='4.4' ry='4' fill='${paperHole}'/>
    <rect x='12.2' y='6' width='6' height='23' rx='3' fill='#000' fill-opacity='.22'/>
    <rect x='10' y='5' width='6' height='23' rx='3' fill='url(#m)' stroke='#000' stroke-opacity='.45' stroke-width='.6'/>`,
  )

/** Case à cocher tracée à la main (bloc-notes). */
const box = (stroke) =>
  svg(24, 24, `<path d='M4.2 4.6c5-.6 10.4-.5 15.3-.1.3 5 .5 10 .1 15-5 .5-10 .4-15.2.2-.5-5-.4-10-.2-15.1z' fill='none' stroke='${stroke}' stroke-width='1.7' stroke-linejoin='round'/>`)

const out = `/* Fichier généré par scripts/skeuo-textures.mjs : ne pas modifier à la main. */
:root {
  --tex-leather: ${uri(leather)};
  --tex-paper: ${uri(grain([0.38, 0.27, 0.12], 0.2))};
  --tex-kraft: ${uri(grain([1, 0.93, 0.8], 0.13, 0.6, 5))};
  --tex-noise: ${uri(grain([0, 0, 0], 0.16, 0.9, 11))};
  --tex-linen: ${uri(linen(0.22, 0.3))};
  --tex-linen-dark: ${uri(linen(0.5, 0.1))};
  --tex-torn: ${uri(torn('#fffdf6', '#e6dcc6'))};
  --tex-torn-dark: ${uri(torn('#574a3f', '#42372f'))};
  --tex-rings: ${uri(rings('#4b4630'))};
  --tex-rings-dark: ${uri(rings('#0c0b09'))};
  --tex-box: ${uri(box('#5d6a8f'))};
  --tex-box-dark: ${uri(box('#b9b4a0'))};
}
`
writeFileSync(new URL('../src/textures.css', import.meta.url), out)
console.log('src/textures.css', out.length, 'octets')
