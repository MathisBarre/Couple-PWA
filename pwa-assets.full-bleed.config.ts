import { defineConfig } from '@vite-pwa/assets-generator/config'

// Icône iOS (apple-touch-icon) et icône maskable Android depuis public/logo-full-bleed.svg :
// le dégradé remplit tout le carré, iOS et Android appliquent eux-mêmes leur masque arrondi.
// La goutte reste dans la zone sûre des icônes maskable (cercle de 80 % du diamètre).
export default defineConfig({
  headLinkOptions: { preset: '2023' },
  preset: {
    transparent: { sizes: [], favicons: [] },
    // Pas de « quality » : sharp passerait en palette 256 couleurs et le dégradé serait tramé.
    png: { compressionLevel: 9, quality: undefined },
    maskable: { sizes: [512], padding: 0 },
    apple: { sizes: [180], padding: 0 },
  },
  images: ['public/logo-full-bleed.svg'],
})
