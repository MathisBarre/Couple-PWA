import { defineConfig, minimal2023Preset, createAppleSplashScreens } from '@vite-pwa/assets-generator/config'

export default defineConfig({
  headLinkOptions: { preset: '2023' },
  preset: {
    ...minimal2023Preset,
    maskable: { ...minimal2023Preset.maskable, resizeOptions: { background: '#E8566F' } },
    apple: { ...minimal2023Preset.apple, resizeOptions: { background: '#E8566F' } },
    appleSplashScreens: createAppleSplashScreens(
      {
        padding: 0.35,
        resizeOptions: { background: '#FFF6F3', fit: 'contain' },
        darkResizeOptions: { background: '#1E1416', fit: 'contain' },
        linkMediaOptions: { log: true, addMediaScreen: true, basePath: '/', xhtml: false },
        png: { compressionLevel: 9, quality: 60 },
        name: (landscape, size, dark) =>
          `splash/apple-splash-${landscape ? 'landscape' : 'portrait'}-${dark ? 'dark-' : ''}${size.width}x${size.height}.png`,
      },
      ['iPhone 16 Pro Max', 'iPhone 16 Pro', 'iPhone 16 Plus', 'iPhone 16', 'iPhone 15 Pro Max', 'iPhone 15 Pro', 'iPhone 14 Plus', 'iPhone 13', 'iPhone 13 mini', 'iPhone SE 4.7"', 'iPhone 11 Pro Max', 'iPhone 11', 'iPhone X'],
    ),
  },
  images: ['public/logo.svg'],
})
