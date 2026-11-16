import { createContext, useContext, type ReactNode } from 'react'
import { Chevron } from './icons'

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
 * Fond uni, exactement la couleur de l'écran et de la barre d'état (#top-edge dans src/index.css) :
 * barre d'état, barre, titre et onglets forment une seule surface, sans raccord visible. Pas de flou.
 * Le bas de l'en-tête (`sk-edge`) reste collé sous la barre ; il porte `sticky` quand il y en a un,
 * et le contenu qui défile s'efface dessous dans un court fondu.
 */
export function ScreenHeader({ title, action, sticky }: { title: string; action?: ReactNode; sticky?: ReactNode }) {
  const back = useContext(BackContext)
  return (
    <>
      <div className="sk-chrome sticky top-0 z-20 -mx-4 -mt-[calc(env(safe-area-inset-top)+12px)] px-4 pt-[calc(env(safe-area-inset-top)+8px)]">
        <div className="relative flex h-11 items-center">
          {back && (
            <button type="button" onClick={back.onBack} className="sk-back absolute left-0 max-w-[55%]">
              <Chevron dir="left" className="h-4 w-2.5" />
              <span className="truncate">{back.label}</span>
            </button>
          )}
          {action && <div className="absolute right-0 flex items-center gap-2">{action}</div>}
        </div>
      </div>
      <h1 className="sk-chrome sk-title">{title}</h1>
      <div className="sk-chrome sk-edge top-[calc(env(safe-area-inset-top)+8px+2.75rem)]">{sticky}</div>
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
      className="sk-navbtn"
    >
      {children}
    </button>
  )
}

/** Engrenage façon SF Symbols, pour les réglages d'un espace. */
export function GearIcon() {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className="size-[20px]" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M10.33 3.4a1.7 1.7 0 0 1 3.34 0l.2 1.02a1.7 1.7 0 0 0 2.36 1.23l.95-.43a1.7 1.7 0 0 1 2.36 2.36l-.43.95a1.7 1.7 0 0 0 1.23 2.36l1.02.2a1.7 1.7 0 0 1 0 3.34l-1.02.2a1.7 1.7 0 0 0-1.23 2.36l.43.95a1.7 1.7 0 0 1-2.36 2.36l-.95-.43a1.7 1.7 0 0 0-2.36 1.23l-.2 1.02a1.7 1.7 0 0 1-3.34 0l-.2-1.02a1.7 1.7 0 0 0-2.36-1.23l-.95.43a1.7 1.7 0 0 1-2.36-2.36l.43-.95a1.7 1.7 0 0 0-1.23-2.36l-1.02-.2a1.7 1.7 0 0 1 0-3.34l1.02-.2a1.7 1.7 0 0 0 1.23-2.36l-.43-.95a1.7 1.7 0 0 1 2.36-2.36l.95.43a1.7 1.7 0 0 0 2.36-1.23z" />
      <circle cx="12" cy="12" r="3.2" />
    </svg>
  )
}
