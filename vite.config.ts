import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'
import { execSync } from 'node:child_process'
import { apiDev } from './vite-api-dev.ts'

/** Version affichée dans les Réglages : date du build et commit (fourni par Vercel, sinon git). */
function appVersion() {
  let commit = process.env.VERCEL_GIT_COMMIT_SHA ?? ''
  if (!commit) {
    try {
      commit = execSync('git rev-parse HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()
    } catch {
      /* pas de dépôt git */
    }
  }
  return { builtAt: new Date().toISOString(), commit: commit.slice(0, 7) }
}

export default defineConfig(({ mode }) => {
  // Rend les variables de .env.local visibles par l'API locale (process.env).
  Object.assign(process.env, { ...loadEnv(mode, process.cwd(), ''), ...process.env })
  return {
  define: { __APP_VERSION__: JSON.stringify(appVersion()) },
  plugins: [
    react(),
    tailwindcss(),
    apiDev(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      // « prompt » : c'est src/lib/update.ts qui choisit le moment d'activer une nouvelle version.
      registerType: 'prompt',
      injectRegister: false,
      injectManifest: {
        // Les icônes du manifeste sont ajoutées automatiquement. Les écrans de démarrage iOS et
        // l'icône iOS ne sont pas pré-cachés : iOS les télécharge une seule fois, à l'installation.
        globPatterns: ['**/*.{js,css,html,ico,woff2}', 'logo.svg', 'favicon.svg', 'badge-*.png'],
      },
      manifest: {
        // Identifiant stable de l'app installée (sinon Chrome le déduit de start_url).
        id: '/',
        name: 'À deux',
        short_name: 'À deux',
        description: 'Notre app à deux : cycle, courses et plus.',
        lang: 'fr',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#F5F5F4',
        theme_color: '#F5F5F4',
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
