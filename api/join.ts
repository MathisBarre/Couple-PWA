// GET /join?code=… (réécrit vers /api/join, voir vercel.json)
// Les aperçus de liens (Messages, WhatsApp…) n'exécutent pas le JavaScript : on sert la page de l'app
// avec des balises Open Graph propres à l'invitation (« Mathis t'invite sur À deux » + image dédiée).
// Le navigateur, lui, charge l'app normalement : src/lib/invite.ts lit le code dans l'adresse.
import { cleanCode, inviterName } from './_lib/invite.js'

const escape = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)

/** Remplace la valeur d'une balise <meta property|name="key" content="…">. */
function setMeta(html: string, key: string, value: string) {
  const re = new RegExp(`(<meta (?:property|name)="${key}" content=")[^"]*(")`)
  return html.replace(re, `$1${escape(value)}$2`)
}

export async function GET(req: Request) {
  const url = new URL(req.url)
  const origin = `${url.protocol}//${url.host}`
  const page = await fetch(`${origin}/index.html`)
  if (!page.ok) return Response.redirect(`${origin}/`, 302)
  let html = await page.text()

  const code = cleanCode(url.searchParams.get('code'))
  const name = await inviterName(code)
  const title = name ? `${name} t’invite sur À deux` : 'Rejoins-moi sur À deux'
  const description = 'Notre app de couple, rien qu’à nous deux. Ouvre le lien pour rejoindre notre espace.'
  const image = `${origin}/api/og-invite${code ? `?code=${code}` : ''}`
  const metas: Record<string, string> = {
    'og:title': title,
    'og:description': description,
    'og:url': `${origin}/join${code ? `?code=${code}` : ''}`,
    'og:image': image,
    'og:image:alt': title,
    'twitter:title': title,
    'twitter:description': description,
    'twitter:image': image,
  }
  for (const [k, v] of Object.entries(metas)) html = setMeta(html, k, v)
  html = html.replace(/<title>[^<]*<\/title>/, `<title>${escape(title)}</title>`)

  return new Response(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'public, max-age=0, s-maxage=300, stale-while-revalidate=86400',
    },
  })
}
