import { defineConfig, minimal2023Preset, createAppleSplashScreens } from '@vite-pwa/assets-generator/config'

/**
 * Taille du logo sur l'écran de démarrage iOS, en points. Elle doit rester égale à celle du logo
 * de l'écran de chargement de l'app (size-24 = 96 px dans App.tsx), sinon le logo « saute »
 * quand l'app prend le relais.
 */
const SPLASH_LOGO_PT = 96

// Icônes « transparentes » (logo arrondi) et écrans de démarrage iOS, depuis public/logo.svg.
// L'icône iOS et l'icône maskable Android viennent de pwa-assets.full-bleed.config.ts :
// elles doivent remplir tout le carré, sinon on voit un cadre rose autour du logo arrondi.
export default defineConfig({
  headLinkOptions: { preset: '2023' },
  preset: {
    transparent: minimal2023Preset.transparent,
    // Pas de « quality » : sharp passerait en palette 256 couleurs et le dégradé serait tramé.
    png: { compressionLevel: 9, quality: undefined },
    maskable: { sizes: [] },
    apple: { sizes: [] },
    appleSplashScreens: withLogoSize(createAppleSplashScreens(
      {
        resizeOptions: { background: '#F5F5F4', fit: 'contain' },
        darkResizeOptions: { background: '#161618', fit: 'contain' },
        linkMediaOptions: { log: true, addMediaScreen: true, basePath: '/', xhtml: false },
        png: { compressionLevel: 9, quality: 60 },
        name: (landscape, size, dark) =>
          `splash/apple-splash-${landscape ? 'landscape' : 'portrait'}-${dark ? 'dark-' : ''}${size.width}x${size.height}.png`,
      },
      // Un écran par taille d'iPhone sous iOS 16.4+ (minimum pour les notifications).
      // Les modèles de même taille partagent la même image (ex. 17 = 16 Pro, 16e = 14 = 13).
      [
        'iPhone 17 Pro Max', // 440×956 @3 (= 16 Pro Max)
        'iPhone Air', // 420×912 @3
        'iPhone 17 Pro', // 402×874 @3 (= 17, 16 Pro)
        'iPhone 16 Plus', // 430×932 @3 (= 15 Plus, 15 Pro Max, 14 Pro Max)
        'iPhone 16', // 393×852 @3 (= 15, 15 Pro, 14 Pro)
        'iPhone 14 Plus', // 428×926 @3 (= 13 Pro Max, 12 Pro Max)
        'iPhone 13', // 390×844 @3 (= 16e, 14, 13 Pro, 12)
        'iPhone 13 mini', // 375×812 @3 (= 12 mini, 11 Pro, XS, X)
        'iPhone 11 Pro Max', // 414×896 @3 (= XS Max)
        'iPhone 11', // 414×896 @2 (= XR)
        'iPhone 8 Plus', // 414×736 @3
        'iPhone SE 4.7"', // 375×667 @2 (= SE 2/3, 8)
      ],
    )),
  },
  images: ['public/logo.svg'],
})

/** Marge propre à chaque écran pour que le logo fasse SPLASH_LOGO_PT points sur tous les iPhone. */
function withLogoSize<T extends { sizes: { width: number; scaleFactor: number; padding?: number }[] }>(splash: T): T {
  return {
    ...splash,
    sizes: splash.sizes.map((size) => ({ ...size, padding: 1 - SPLASH_LOGO_PT / (size.width / size.scaleFactor) })),
  }
}
