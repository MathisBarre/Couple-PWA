// GET /api/og-invite?code=… : image de partage 1200×630 du lien d'invitation, avec le prénom de qui invite.
import { Resvg } from '@resvg/resvg-js'
import satori from 'satori'
import { cleanCode, inviterName } from './_lib/invite.js'

type Node = { type: string; props: Record<string, unknown> }
const h = (type: string, style: Record<string, unknown>, children?: unknown, extra: Record<string, unknown> = {}): Node => ({
  type,
  props: { style, children, ...extra },
})

const LOGO = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#34343B"/><stop offset="1" stop-color="#18181B"/></linearGradient><clipPath id="l"><circle cx="196" cy="256" r="118"/></clipPath></defs><rect width="512" height="512" rx="112" fill="url(#bg)"/><circle cx="196" cy="256" r="118" fill="#F06882"/><circle cx="316" cy="256" r="118" fill="#5DBB73"/><circle cx="316" cy="256" r="118" fill="#FFF3E6" clip-path="url(#l)"/></svg>`

export async function GET(req: Request) {
  const url = new URL(req.url)
  const origin = `${url.protocol}//${url.host}`
  const name = await inviterName(cleanCode(url.searchParams.get('code')))
  const [extraBold, semiBold, medium] = await Promise.all(
    ['ExtraBold', 'SemiBold', 'Medium'].map((w) => fetch(`${origin}/og/Inter-${w}.otf`).then((r) => r.arrayBuffer())),
  )

  const headline = name ? `${name} t’invite` : 'Tu es invité·e'
  const size = headline.length > 18 ? 72 : headline.length > 13 ? 88 : 104

  const chip = (label: string, bg: string, fg: string, dot: string) =>
    h('div', { display: 'flex', alignItems: 'center', gap: 12, padding: '12px 24px', borderRadius: 999, background: bg, color: fg, fontSize: 26, fontWeight: 600 }, [
      h('div', { width: 16, height: 16, borderRadius: 999, background: dot }),
      label,
    ])

  const tree = h(
    'div',
    { width: '100%', height: '100%', display: 'flex', alignItems: 'center', gap: 72, padding: '0 96px', background: '#FBF7F2', color: '#18181B', fontFamily: 'Inter', position: 'relative' },
    [
      h('div', { position: 'absolute', width: 620, height: 620, right: -170, top: -210, borderRadius: 999, backgroundImage: 'radial-gradient(circle, rgba(240,104,130,0.30) 0%, rgba(240,104,130,0) 68%)' }),
      h('div', { position: 'absolute', width: 620, height: 620, right: 40, bottom: -330, borderRadius: 999, backgroundImage: 'radial-gradient(circle, rgba(93,187,115,0.28) 0%, rgba(93,187,115,0) 68%)' }),
      h('img', { width: 280, height: 280 }, undefined, { src: `data:image/svg+xml;base64,${Buffer.from(LOGO).toString('base64')}`, width: 280, height: 280 }),
      h('div', { display: 'flex', flexDirection: 'column', flex: 1 }, [
        h('div', { fontSize: 28, fontWeight: 600, color: '#B52F4A', letterSpacing: 2, textTransform: 'uppercase' }, 'Invitation'),
        h('div', { marginTop: 14, fontSize: size, fontWeight: 800, letterSpacing: -3, lineHeight: 1.02 }, headline),
        h('div', { marginTop: 22, fontSize: 36, fontWeight: 500, color: '#52525B', lineHeight: 1.25 }, 'à rejoindre votre espace sur À deux.'),
        h('div', { display: 'flex', gap: 14, marginTop: 36 }, [
          chip('Cycle', '#FDE4E9', '#B52F4A', '#F06882'),
          chip('Courses', '#DDF2E2', '#2E7A43', '#5DBB73'),
          chip('et plus', '#EEEBE7', '#52525B', '#A1A1AA'),
        ]),
      ]),
    ],
  )

  const svg = await satori(tree as never, {
    width: 1200,
    height: 630,
    fonts: [
      { name: 'Inter', data: extraBold, weight: 800, style: 'normal' },
      { name: 'Inter', data: semiBold, weight: 600, style: 'normal' },
      { name: 'Inter', data: medium, weight: 500, style: 'normal' },
    ],
  })
  const png = new Resvg(svg, { fitTo: { mode: 'width', value: 1200 } }).render().asPng()
  return new Response(new Uint8Array(png), {
    headers: {
      'Content-Type': 'image/png',
      'Cache-Control': 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800',
    },
  })
}
