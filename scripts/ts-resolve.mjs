// Pour lancer les tests TypeScript avec Node seul (--experimental-strip-types) : les imports
// « ./x.js » du code de /api (convention Vercel) pointent vers les fichiers « ./x.ts ».
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { register } from 'node:module'

export async function resolve(specifier, context, next) {
  if (specifier.startsWith('.') && specifier.endsWith('.js') && context.parentURL?.endsWith('.ts')) {
    const ts = new URL(specifier.slice(0, -3) + '.ts', context.parentURL)
    if (existsSync(fileURLToPath(ts))) return next(ts.href, context)
  }
  return next(specifier, context)
}

if (!import.meta.url.includes('?hook')) register(import.meta.url + '?hook')
