import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { cx } from './ui'

/** Fourni par la pile d'écrans (Stack) à un écran empilé : de quoi afficher « ‹ Précédent ». */
export const BackContext = createContext<{ label: string; onBack: () => void } | null>(null)

/**
 * En-tête d'écran façon iOS :
 * - une barre fine collée en haut (retour « ‹ » à gauche, action à droite, ex. ⚙️) ;
 * - un grand titre qui part avec le défilement, et dont la version courte apparaît alors dans la barre ;
 * - `sticky` (ex. les onglets de l'espace) reste collé juste sous la barre, en compact.
 * Il se place tout en haut de l'écran : il annule la marge haute du <main> de la pile.
 */
export function ScreenHeader({ title, action, sticky }: { title: string; action?: ReactNode; sticky?: ReactNode }) {
  const back = useContext(BackContext)
  const titleRef = useRef<HTMLHeadingElement>(null)
  const [collapsed, setCollapsed] = useState(false)

  useEffect(() => {
    const h = titleRef.current
    const scroller = h?.closest('[data-scroll]')
    if (!h || !scroller) return
    // Le grand titre est passé sous la barre : on affiche le petit.
    const update = () => setCollapsed(scroller.scrollTop > h.offsetTop + h.offsetHeight - 52)
    update()
    scroller.addEventListener('scroll', update, { passive: true })
    return () => scroller.removeEventListener('scroll', update)
  }, [])

  const bar = 'sticky z-20 -mx-4 px-4 bg-bg/85 backdrop-blur-xl transition-[border-color] duration-200'
  return (
    <>
      <div
        className={cx(
          bar,
          'top-0 -mt-[calc(env(safe-area-inset-top)+12px)] pt-[env(safe-area-inset-top)]',
          'border-b',
          collapsed && !sticky ? 'border-line' : 'border-transparent',
        )}
      >
        <div className="relative flex h-11 items-center justify-center">
          {back && (
            <button
              type="button"
              onClick={back.onBack}
              className="absolute left-0 -ml-1.5 flex max-w-[40%] items-center gap-0.5 py-1 pr-2 text-accent outline-none focus-visible:underline"
            >
              <span aria-hidden className="text-3xl leading-none font-light">
                ‹
              </span>
              <span className="truncate">{back.label}</span>
            </button>
          )}
          <span
            aria-hidden={!collapsed}
            className={cx(
              'max-w-[50%] truncate text-[17px] font-semibold transition-opacity duration-200',
              collapsed ? 'opacity-100' : 'opacity-0',
            )}
          >
            {title}
          </span>
          {action && <div className="absolute right-0 flex items-center gap-2">{action}</div>}
        </div>
      </div>
      <h1 ref={titleRef} className="mb-2.5 text-[2.1rem] leading-tight font-extrabold tracking-tight">
        {title}
      </h1>
      {sticky && (
        <div
          className={cx(
            bar,
            'top-[calc(env(safe-area-inset-top)+2.75rem)] mb-3 border-b pb-2',
            collapsed ? 'border-line' : 'border-transparent',
          )}
        >
          {sticky}
        </div>
      )}
    </>
  )
}

/** Bouton rond de la barre du haut (ex. ⚙️ réglages de l'espace). */
export function HeaderButton({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="grid size-9 place-items-center rounded-full bg-surface-2 text-lg transition outline-none active:scale-90 focus-visible:outline-2 focus-visible:outline-accent"
    >
      {children}
    </button>
  )
}
