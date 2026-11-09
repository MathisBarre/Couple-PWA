import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      registerType: 'autoUpdate',
      injectRegister: false,
      injectManifest: {
        // Les écrans de démarrage iOS ne sont pas pré-cachés (inutiles hors ligne).
        globPatterns: ['**/*.{js,css,html,svg,ico,woff2}', 'pwa-*.png', 'maskable-*.png', 'apple-touch-icon-*.png'],
      },
      manifest: {
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
          { src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png' },
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
        shortcuts: [{ name: 'Noter aujourd’hui', url: '/?log=today', icons: [{ src: 'pwa-192x192.png', sizes: '192x192' }] }],
      },
      devOptions: { enabled: false },
    }),
  ],
})
