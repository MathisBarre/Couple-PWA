import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { cx } from './ui'

/** Fourni par la pile d'écrans (Stack) à un écran empilé : de quoi afficher « ‹ Précédent ». */
export const BackContext = createContext<{ label: string; onBack: () => void } | null>(null)

/**
 * En-tête d'écran façon iOS :
 * - une barre fine collée en haut (retour « ‹ » à gauche, action à droite, ex. ⚙️) ;
 * - un grand titre qui part avec le défilement, sans petit titre à sa place ;
 * - `sticky` (ex. les onglets de l'espace) reste collé juste sous la barre, en compact.
 * Il se place tout en haut de l'écran : il annule la marge haute du <main> de la pile.
 * La barre commence 8 px sous la zone sûre, sous le bandeau #top-edge, qui sinon masquerait
 * (et capterait les appuis sur) le haut des boutons.
 *
 * Fond opaque, exactement la couleur de l'écran (et donc de la barre d'état, voir #top-edge dans
 * src/index.css) : barre d'état, barre et onglets forment une seule surface, sans raccord visible.
 * Pas de flou : sur iPhone la barre d'état ne peut pas être floutée par la page, un flou en dessous
 * ferait toujours une marche de couleur. Un filet fin apparaît sous la surface quand on a défilé.
 */
export function ScreenHeader({ title, action, sticky }: { title: string; action?: ReactNode; sticky?: ReactNode }) {
  const back = useContext(BackContext)
  const titleRef = useRef<HTMLHeadingElement>(null)
  const [collapsed, setCollapsed] = useState(false)

  // Le grand titre part simplement avec le défilement, sous la barre opaque ; rien ne le remplace.
  // `collapsed` sert seulement à afficher le filet sous la barre une fois le contenu passé dessous.
  useEffect(() => {
    const h = titleRef.current
    const scroller = h?.closest('[data-scroll]')
    if (!h || !scroller) return
    const update = () => setCollapsed(scroller.scrollTop > h.offsetTop + h.offsetHeight - 52)
    update()
    scroller.addEventListener('scroll', update, { passive: true })
    return () => scroller.removeEventListener('scroll', update)
  }, [])

  // Même fond et même transition que l'écran (Stack) : aucune différence de teinte possible.
  const bar = 'sticky z-20 -mx-4 px-4 bg-bg transition-[background-color,box-shadow] duration-300'
  // Filet iOS (0,5 pt) sous le bas de la surface, seulement une fois le contenu passé dessous.
  const hairline = (on: boolean) => (on ? 'shadow-[0_0.5px_0_var(--color-line)]' : 'shadow-[0_0.5px_0_transparent]')
  return (
    <>
      <div className={cx(bar, 'top-0 -mt-[calc(env(safe-area-inset-top)+12px)] pt-[calc(env(safe-area-inset-top)+8px)]', hairline(collapsed && !sticky))}>
        <div className="relative flex h-10 items-center">
          {back && (
            <button
              type="button"
              onClick={back.onBack}
              className="absolute left-0 flex max-w-[40%] items-center gap-0.5 py-2 pr-2 text-[17px] text-accent outline-none focus-visible:underline active:opacity-50"
            >
              <svg aria-hidden viewBox="0 0 12 21" className="h-[21px] w-3 shrink-0" fill="none" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round">
                <path d="M10 2 2 10.5 10 19" />
              </svg>
              <span className="ml-1 truncate">{back.label}</span>
            </button>
          )}
          {action && <div className="absolute right-0 flex items-center gap-2">{action}</div>}
        </div>
      </div>
      <h1 ref={titleRef} className="mb-2.5 text-[1.75rem] leading-tight font-bold tracking-tight">
        {title}
      </h1>
      {sticky && (
        <div className={cx(bar, 'top-[calc(env(safe-area-inset-top)+3rem)] mb-3 pb-2', hairline(collapsed))}>{sticky}</div>
      )}
    </>
  )
}

/** Bouton rond de la barre du haut (ex. réglages de l'espace). */
export function HeaderButton({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="grid size-9 place-items-center rounded-full bg-surface-2 text-ink transition outline-none active:scale-90 active:opacity-70 focus-visible:outline-2 focus-visible:outline-accent"
    >
      {children}
    </button>
  )
}

/** Engrenage façon SF Symbols, pour les réglages d'un espace. */
export function GearIcon() {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className="size-[21px]" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M10.33 3.4a1.7 1.7 0 0 1 3.34 0l.2 1.02a1.7 1.7 0 0 0 2.36 1.23l.95-.43a1.7 1.7 0 0 1 2.36 2.36l-.43.95a1.7 1.7 0 0 0 1.23 2.36l1.02.2a1.7 1.7 0 0 1 0 3.34l-1.02.2a1.7 1.7 0 0 0-1.23 2.36l.43.95a1.7 1.7 0 0 1-2.36 2.36l-.95-.43a1.7 1.7 0 0 0-2.36 1.23l-.2 1.02a1.7 1.7 0 0 1-3.34 0l-.2-1.02a1.7 1.7 0 0 0-2.36-1.23l-.95.43a1.7 1.7 0 0 1-2.36-2.36l.43-.95a1.7 1.7 0 0 0-1.23-2.36l-1.02-.2a1.7 1.7 0 0 1 0-3.34l1.02-.2a1.7 1.7 0 0 0 1.23-2.36l-.43-.95a1.7 1.7 0 0 1 2.36-2.36l.95.43a1.7 1.7 0 0 0 2.36-1.23z" />
      <circle cx="12" cy="12" r="3.2" />
    </svg>
  )
}
