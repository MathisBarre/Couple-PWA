import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { Icon } from './icons'
import { cx } from './ui'

/** Fourni par la pile d'écrans (Stack) à un écran empilé : de quoi afficher « ← Précédent ». */
export const BackContext = createContext<{ label: string; onBack: () => void } | null>(null)

/**
 * En-tête d'écran, comme la têtière d'une page d'almanach :
 * - une barre fine collée en haut (retour « ← » à gauche, action à droite, ex. réglages) ;
 * - un grand titre à empattements qui part avec le défilement, sans petit titre à sa place,
 *   avec le numéro de rubrique (`folio`, ex. « N° 1 ») en regard ;
 * - `sticky` (ex. les onglets de l'espace) reste collé juste sous la barre, entre deux filets.
 * Il se place tout en haut de l'écran : il annule la marge haute du <main> de la pile.
 * La barre commence 8 px sous la zone sûre, sous le bandeau #top-edge, qui sinon masquerait
 * (et capterait les appuis sur) le haut des boutons.
 *
 * Fond opaque, exactement la couleur de l'écran (et donc de la barre d'état, voir #top-edge dans
 * src/index.css) : barre d'état, barre et onglets forment une seule surface, sans raccord visible.
 * Pas de flou : sur iPhone la barre d'état ne peut pas être floutée par la page, un flou en dessous
 * ferait toujours une marche de couleur. Un filet d'encre apparaît sous la barre quand on a défilé.
 */
export function ScreenHeader({ title, action, sticky, folio }: { title: string; action?: ReactNode; sticky?: ReactNode; folio?: string }) {
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
  // Filet d'encre (1 px, net : pas une ombre portée) sous la barre, une fois le contenu passé dessous.
  const rule = (on: boolean) => (on ? 'shadow-[0_1px_0_var(--color-ink)]' : 'shadow-[0_1px_0_transparent]')
  return (
    <>
      <div className={cx(bar, 'top-0 -mt-[calc(env(safe-area-inset-top)+12px)] pt-[calc(env(safe-area-inset-top)+8px)]', rule(collapsed && !sticky))}>
        <div className="relative flex h-10 items-center">
          {back && (
            <button
              type="button"
              onClick={back.onBack}
              className="etiquette absolute left-0 flex h-11 max-w-[60%] items-center gap-2 pr-3 text-accent outline-none focus-visible:underline active:opacity-50"
            >
              <Icon name="left" className="size-[18px] shrink-0" />
              <span className="truncate">{back.label}</span>
            </button>
          )}
          {action && <div className="absolute right-0 flex items-center gap-2">{action}</div>}
        </div>
      </div>
      <div className={cx('flex items-end justify-between gap-3 pb-2.5', !sticky && 'mb-5 border-b-2 border-ink')}>
        <h1 ref={titleRef} className="text-[3.25rem] leading-[0.92] font-normal tracking-[-0.025em] text-balance">
          {title}
        </h1>
        {folio && <span className="etiquette shrink-0 pb-1 text-ink-2">{folio}</span>}
      </div>
      {sticky && (
        <div className={cx(bar, 'top-[calc(env(safe-area-inset-top)+3rem)]')}>
          <div className="border-t-2 border-b border-ink">{sticky}</div>
        </div>
      )}
    </>
  )
}

/** Bouton de la barre du haut (ex. réglages de l'espace) : un pictogramme au trait, cible de 44 px. */
export function HeaderButton({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="-mr-2.5 grid size-11 place-items-center text-ink transition-opacity outline-none active:opacity-50 focus-visible:outline-2 focus-visible:outline-accent"
    >
      {children}
    </button>
  )
}

/** Cadran à crans, pour les réglages d'un espace. */
export function GearIcon() {
  return <Icon name="gear" className="size-6" />
}
