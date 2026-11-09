import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'
import { apiDev } from './vite-api-dev.ts'

export default defineConfig(({ mode }) => {
  // Rend les variables de .env.local visibles par l'API locale (process.env).
  Object.assign(process.env, { ...loadEnv(mode, process.cwd(), ''), ...process.env })
  return {
  plugins: [
    react(),
    tailwindcss(),
    apiDev(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      registerType: 'autoUpdate',
      injectRegister: false,
      injectManifest: {
        // Les icônes du manifeste sont ajoutées automatiquement. Les écrans de démarrage iOS et
        // l'icône iOS ne sont pas pré-cachés : iOS les télécharge une seule fois, à l'installation.
        globPatterns: ['**/*.{js,css,html,ico,woff2}', 'logo.svg', 'favicon.svg', 'badge-*.png'],
      },
      manifest: {
        // Identifiant stable de l'app installée (sinon Chrome le déduit de start_url).
        id: '/',
        name: 'Cycle à deux',
        short_name: 'Cycle',
        description: 'Suivi des règles partagé, simple et rapide.',
        lang: 'fr',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#FFF6F3',
        theme_color: '#FFF6F3',
        icons: [
          { src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png', purpose: 'any' },
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
        shortcuts: [{ name: 'Noter aujourd’hui', url: '/?log=today', icons: [{ src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' }] }],
      },
      devOptions: { enabled: false },
    }),
  ],
}
})
