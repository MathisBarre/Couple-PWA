// Génère src/textures.css : le grain du papier, sous forme de petites tuiles SVG en data URI
// répétées en fond. Aucune image bitmap. Le filtre SVG (feTurbulence) n'est calculé qu'une fois
// par tuile, pas à chaque défilement.
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

/** Grain de belle papeterie : fibres à peine visibles (sombres sur papier clair, claires sur papier sombre). */
const grain = (rgb, alpha, freq, seed) =>
  `<svg xmlns='http://www.w3.org/2000/svg' width='220' height='220'>
    <filter id='p' x='0' y='0' width='100%' height='100%'>
      <feTurbulence type='fractalNoise' baseFrequency='${freq}' numOctaves='3' seed='${seed}' stitchTiles='stitch'/>
      <feColorMatrix values='0 0 0 0 ${rgb[0]}  0 0 0 0 ${rgb[1]}  0 0 0 0 ${rgb[2]}  0 0 0 ${alpha} ${-alpha * 0.3}'/>
    </filter>
    <rect width='100%' height='100%' filter='url(#p)'/>
  </svg>`

const out = `/* Fichier généré par scripts/skeuo-textures.mjs : ne pas modifier à la main. */
:root {
  --tex-paper: ${uri(grain([0.35, 0.28, 0.2], 0.15, 0.9, 3))};
  --tex-paper-dark: ${uri(grain([1, 0.97, 0.92], 0.07, 0.9, 5))};
}
`
writeFileSync(new URL('../src/textures.css', import.meta.url), out)
console.log('src/textures.css', out.length, 'octets')
