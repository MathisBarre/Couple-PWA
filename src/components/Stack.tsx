import { useEffect, useImperativeHandle, useLayoutEffect, useRef, type ReactNode, type Ref } from 'react'
import { flushSync } from 'react-dom'
import { animateStack, setStackProgress } from '../lib/motion'
import type { Theme } from '../modules'
import { BackContext } from './ScreenHeader'
import { cx } from './ui'

export interface StackScreen {
  key: string
  theme: Theme
  title: string
  node: ReactNode
}

export interface StackHandle {
  /** Dépile `n` écrans avec l'animation iOS (bouton retour, retour Android…). */
  pop(n?: number): void
  /** Remonte en haut de l'écran affiché. */
  scrollToTop(): void
}

/**
 * Pile d'écrans façon iOS : un écran poussé arrive par la droite, l'écran dessous recule et
 * s'assombrit. Retour par le bouton « ‹ » ou en glissant le doigt vers la droite.
 * Les écrans recouverts restent montés (ils gardent leur saisie et leur position de défilement).
 */
export function Stack({ screens, onPop, ref }: { screens: StackScreen[]; onPop: (n: number) => void; ref?: Ref<StackHandle> }) {
  const rootRef = useRef<HTMLDivElement>(null)
  const els = useRef<Record<string, HTMLElement | null>>({})
  const running = useRef<(() => void) | null>(null)
  const latest = useRef({ screens, onPop })
  latest.current = { screens, onPop }
  const keys = screens.map((s) => s.key)
  const prevKeys = useRef(keys)

  const layer = (i: number) => els.current[latest.current.screens[i]?.key] ?? null

  /** Lance une animation de la pile ; `popped` = nombre d'écrans à retirer une fois le geste fini. */
  const run = (under: HTMLElement, top: HTMLElement, fromP: number, toP: number, popped = 0, velocity = 0) => {
    running.current?.()
    running.current = animateStack(under, top, fromP, toP, {
      velocity,
      beforeCleanup: () => {
        running.current = null
        // Retire l'écran dépilé avant d'enlever l'animation : sinon il réapparaîtrait une image.
        if (popped) flushSync(() => latest.current.onPop(popped))
      },
    })
  }

  const pop = (n = 1) => {
    const len = latest.current.screens.length
    n = Math.min(n, len - 1)
    if (n < 1) return
    const under = layer(len - 1 - n)
    const top = layer(len - 1)
    if (under && top) run(under, top, 1, 0, n)
    else latest.current.onPop(n)
  }

  useImperativeHandle(ref, () => ({
    pop,
    scrollToTop: () => {
      const top = layer(latest.current.screens.length - 1)
      top?.querySelector(':scope > [data-scroll]')?.scrollTo({ top: 0, behavior: 'smooth' })
    },
  }))

  // Nouvel écran empilé : il glisse depuis la droite (avant le premier affichage, pas de saut).
  useLayoutEffect(() => {
    const before = prevKeys.current
    prevKeys.current = keys
    const pushed = keys.length === before.length + 1 && before.every((k, i) => keys[i] === k)
    if (!pushed) return
    const under = els.current[keys[keys.length - 2]]
    const top = els.current[keys[keys.length - 1]]
    if (under && top) run(under, top, 0, 1)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keys.join('|')])

  useEffect(() => () => running.current?.(), [])

  // Geste de retour : glisser vers la droite n'importe où sur l'écran (comme sur iOS récents).
  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    let g: { x0: number; y0: number; x: number; t: number; v: number; w: number; dragging: boolean } | null = null
    const pair = () => {
      const n = latest.current.screens.length
      const under = layer(n - 2)
      const top = layer(n - 1)
      return under && top ? ([under, top] as const) : null
    }

    const start = (e: TouchEvent) => {
      g = null
      if (e.touches.length !== 1 || running.current || !pair() || blocksSwipe(e.target, root)) return
      const t = e.touches[0]
      g = { x0: t.clientX, y0: t.clientY, x: t.clientX, t: e.timeStamp, v: 0, w: root.clientWidth, dragging: false }
    }
    const move = (e: TouchEvent) => {
      if (!g) return
      const t = e.touches[0]
      const dx = t.clientX - g.x0
      const dy = t.clientY - g.y0
      if (!g.dragging) {
        if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return
        // Seulement un geste nettement horizontal vers la droite : le défilement vertical reste prioritaire.
        if (dx <= 0 || Math.abs(dx) < Math.abs(dy) * 1.5) {
          g = null
          return
        }
        g.dragging = true
        g.x0 = t.clientX // pas de saut au démarrage
        pair()![0].style.visibility = 'visible'
      }
      if (e.cancelable) e.preventDefault()
      const dt = e.timeStamp - g.t
      if (dt > 0) g.v = 0.7 * ((t.clientX - g.x) / dt) + 0.3 * g.v
      g.x = t.clientX
      g.t = e.timeStamp
      const [under, top] = pair()!
      setStackProgress(under, top, 1 - Math.min(Math.max(t.clientX - g.x0, 0) / g.w, 1))
    }
    const end = (e: TouchEvent) => {
      const cur = g
      g = null
      const layers = pair()
      if (!cur?.dragging || !layers) return
      const [under, top] = layers
      under.style.visibility = ''
      const progress = 1 - Math.min(Math.max(cur.x - cur.x0, 0) / cur.w, 1)
      // Lâché vite vers la droite, ou passé la moitié : on revient en arrière.
      const back = e.type === 'touchend' && (cur.v > 0.35 || (progress < 0.5 && cur.v > -0.1))
      run(under, top, progress, back ? 0 : 1, back ? 1 : 0, Math.abs(cur.v))
    }

    root.addEventListener('touchstart', start, { passive: true })
    root.addEventListener('touchmove', move, { passive: false })
    root.addEventListener('touchend', end)
    root.addEventListener('touchcancel', end)
    return () => {
      root.removeEventListener('touchstart', start)
      root.removeEventListener('touchmove', move)
      root.removeEventListener('touchend', end)
      root.removeEventListener('touchcancel', end)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div ref={rootRef} className="absolute inset-0 overflow-hidden">
      {screens.map((s, i) => {
        const covered = i < screens.length - 1
        return (
          <section
            key={s.key}
            ref={(el) => {
              els.current[s.key] = el
            }}
            data-theme={s.theme}
            inert={covered}
            className={cx(
              'absolute inset-0 overflow-hidden bg-bg text-ink transition-colors duration-300',
              i > 0 && 'shadow-[-6px_0_24px_rgb(0_0_0/0.1)]',
              covered && 'invisible',
            )}
          >
            <div data-scroll className="h-full overflow-x-hidden overflow-y-auto overscroll-contain">
              <main className="mx-auto w-full max-w-xl px-4 pt-[calc(env(safe-area-inset-top)+12px)] pb-[calc(env(safe-area-inset-bottom)+88px)]">
                {/* Un écran empilé affiche « ‹ Précédent » dans son en-tête (ScreenHeader). */}
                <BackContext value={i > 0 ? { label: screens[i - 1].title, onBack: () => pop() } : null}>{s.node}</BackContext>
              </main>
            </div>
            <div data-dim aria-hidden className="pointer-events-none absolute inset-0 bg-black opacity-0" />
          </section>
        )
      })}
    </div>
  )
}

/** Pas de geste de retour depuis un curseur, un champ texte ou une zone qui défile à l'horizontale. */
function blocksSwipe(target: EventTarget | null, root: HTMLElement) {
  for (let el = target as HTMLElement | null; el && el !== root; el = el.parentElement) {
    if (el.matches('input[type=range], textarea, [data-no-swipe-back]')) return true
    if (el.scrollWidth > el.clientWidth + 1) {
      const ox = getComputedStyle(el).overflowX
      if (ox === 'auto' || ox === 'scroll') return true
    }
  }
  return false
}
