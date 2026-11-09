import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { haptic } from '../lib/haptics'
import type { View } from '../modules'
import { cx } from './ui'

export interface MenuItem {
  key: string
  label: string
  icon: string
  current?: boolean
}

interface Open {
  tab: View
  rect: DOMRect
  items: MenuItem[]
}

const HOLD_MS = 380
const MOVE_TOLERANCE = 10
const WIDTH = 232

/**
 * Menu rapide de la barre du bas, façon iOS : on reste appuyé sur un onglet, ses sous-écrans
 * apparaissent au-dessus ; on glisse le doigt jusqu'au bon et on lâche pour y aller.
 * On peut aussi lâcher tout de suite puis toucher un choix (le menu reste ouvert).
 */
export function useTabMenu(itemsFor: (tab: View) => MenuItem[], onPick: (tab: View, key: string) => void) {
  const [open, setOpen] = useState<Open | null>(null)
  const [hover, setHover] = useState<string | null>(null)
  const press = useRef<{ id: number; x: number; y: number; timer: number; opened: boolean } | null>(null)
  const swallowClick = useRef(false)
  const hoverRef = useRef<string | null>(null)

  const show = (tab: View, el: HTMLElement) => {
    const items = itemsFor(tab)
    if (!items.length) return false
    setOpen({ tab, rect: el.getBoundingClientRect(), items })
    setHover((hoverRef.current = null))
    haptic()
    return true
  }
  const close = () => setOpen(null)
  const pick = (tab: View, key: string) => {
    close()
    onPick(tab, key)
  }

  const itemAt = (x: number, y: number) =>
    document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-menu-item]')?.dataset.menuItem ?? null

  const endPress = () => {
    if (press.current) clearTimeout(press.current.timer)
    press.current = null
  }

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close()
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  }, [open])

  /** À poser sur chaque bouton de la barre. */
  const bind = (tab: View) => ({
    onPointerDown: (e: ReactPointerEvent<HTMLElement>) => {
      if (e.button !== 0) return
      endPress()
      const el = e.currentTarget
      const timer = window.setTimeout(() => {
        if (press.current && show(tab, el)) press.current.opened = true
      }, HOLD_MS)
      press.current = { id: e.pointerId, x: e.clientX, y: e.clientY, timer, opened: false }
    },
    onPointerMove: (e: ReactPointerEvent<HTMLElement>) => {
      const p = press.current
      if (!p || p.id !== e.pointerId) return
      if (!p.opened) {
        if (Math.hypot(e.clientX - p.x, e.clientY - p.y) > MOVE_TOLERANCE) endPress()
        return
      }
      const key = itemAt(e.clientX, e.clientY)
      if (key !== hoverRef.current) {
        hoverRef.current = key
        setHover(key)
        if (key) haptic()
      }
    },
    onPointerUp: (e: ReactPointerEvent<HTMLElement>) => {
      const p = press.current
      endPress()
      if (!p?.opened) return
      // Le « clic » qui suit l'appui long ne doit pas aussi changer d'onglet.
      swallowClick.current = true
      setTimeout(() => (swallowClick.current = false), 250)
      const key = itemAt(e.clientX, e.clientY)
      if (key) pick(tab, key)
      setHover((hoverRef.current = null))
    },
    onPointerCancel: endPress,
    onClickCapture: (e: React.MouseEvent) => {
      if (!swallowClick.current) return
      swallowClick.current = false
      e.preventDefault()
      e.stopPropagation()
    },
    // Clic droit à la souris, appui long sur Android : même menu, sans menu du navigateur.
    onContextMenu: (e: React.MouseEvent<HTMLElement>) => {
      e.preventDefault()
      if (!press.current?.opened && !open) show(tab, e.currentTarget)
    },
  })

  const menu = open && (
    <TabMenuPopup
      open={open}
      hover={hover}
      // Le clic qui suit le lâcher de l'appui long tombe sur le fond : il ne doit pas fermer le menu.
      onClose={() => !swallowClick.current && close()}
      onPick={(key) => pick(open.tab, key)}
    />
  )

  return { bind, menu, openTab: open?.tab ?? null }
}

function TabMenuPopup({ open, hover, onClose, onPick }: { open: Open; hover: string | null; onClose: () => void; onPick: (key: string) => void }) {
  const { rect, items } = open
  const center = rect.left + rect.width / 2
  const left = Math.min(Math.max(center - WIDTH / 2, 12), innerWidth - WIDTH - 12)
  return (
    <div className="fixed inset-0 z-30">
      <div
        aria-hidden
        onClick={onClose}
        className="absolute inset-0 animate-[fade-in_200ms_ease-out] bg-black/25 backdrop-blur-[3px] motion-reduce:animate-none"
      />
      <div
        role="menu"
        aria-label="Aller directement à"
        style={{ left, width: WIDTH, bottom: innerHeight - rect.top + 10, transformOrigin: `${center - left}px 100%` }}
        className="absolute animate-[menu-in_260ms_cubic-bezier(0.2,0.9,0.3,1.15)] overflow-hidden rounded-2xl border border-line bg-surface/95 text-ink shadow-[0_12px_40px_rgb(0_0_0/0.25)] backdrop-blur-xl motion-reduce:animate-[fade-in_120ms_ease-out]"
      >
        {items.map((item, i) => (
          <button
            key={item.key}
            type="button"
            role="menuitem"
            data-menu-item={item.key}
            onClick={() => onPick(item.key)}
            className={cx(
              'flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors duration-100 outline-none select-none focus-visible:bg-surface-2',
              i > 0 && 'border-t border-line',
              hover === item.key && 'bg-surface-2',
            )}
          >
            <span aria-hidden className="text-lg">
              {item.icon}
            </span>
            <span className={cx('flex-1', item.current && 'font-semibold')}>{item.label}</span>
            {item.current && (
              <span aria-hidden className="text-accent">
                ✓
              </span>
            )}
          </button>
        ))}
      </div>
    </div>
  )
}
