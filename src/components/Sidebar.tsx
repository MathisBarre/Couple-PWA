import type { Theme, View } from '../modules'
import { Logo } from './Auth'
import { Glyph } from './icons'
import { cx } from './ui'

export interface SidebarGroup {
  id: View
  label: string
  icon: string
  theme: Theme
  badge?: number
  /** Pages du groupe (ex. Suivi, Analyse, Réglages). Vide : le groupe est lui-même une page. */
  pages: { key: string; label: string; icon: string; current?: boolean }[]
  current: boolean
}

/**
 * Ordinateur : la barre latérale remplace la barre du bas et les onglets du haut.
 * Chaque espace est un groupe, à sa couleur, avec ses pages ; les réglages communs ferment la liste.
 */
export function Sidebar({ groups, onPage, onOpen }: { groups: SidebarGroup[]; onPage: (id: View, key: string) => void; onOpen: (id: View) => void }) {
  return (
    <nav aria-label="Navigation principale" data-theme="neutre" className="sk-sidebar fixed inset-y-3 left-3 z-20 flex w-[232px] flex-col overflow-y-auto">
      <div className="flex items-center gap-2.5 px-2.5 pt-2 pb-4">
        <Logo size="size-8" />
        <span className="text-[1.15rem] font-semibold tracking-tight">À deux</span>
      </div>
      <div className="flex flex-1 flex-col gap-4">
        {groups.map((g) =>
          g.pages.length ? (
            <section key={g.id} data-theme={g.theme} aria-label={g.label}>
              <h2 className="flex items-center gap-2 px-2.5 pb-1 text-[0.68rem] font-semibold tracking-[0.08em] text-ink-2 uppercase">
                <span aria-hidden className="text-accent [&_.sk-glyph]:size-4">
                  <Glyph icon={g.icon} />
                </span>
                {g.label}
                {!!g.badge && <span className="sk-side-badge ml-auto">{g.badge > 99 ? '99+' : g.badge}</span>}
              </h2>
              <ul className="flex flex-col gap-0.5">
                {g.pages.map((p) => (
                  <li key={p.key}>
                    <button type="button" onClick={() => onPage(g.id, p.key)} aria-current={p.current ? 'page' : undefined} className="sk-side-item">
                      <span aria-hidden className="[&_.sk-glyph]:size-[18px]">
                        <Glyph icon={p.icon} />
                      </span>
                      {p.label}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ) : (
            <button
              key={g.id}
              type="button"
              data-theme={g.theme}
              onClick={() => onOpen(g.id)}
              aria-current={g.current ? 'page' : undefined}
              className={cx('sk-side-item', g.id === 'settings' && 'mt-auto')}
            >
              <span aria-hidden className="[&_.sk-glyph]:size-[18px]">
                <Glyph icon={g.icon} />
              </span>
              {g.label}
            </button>
          ),
        )}
      </div>
    </nav>
  )
}
