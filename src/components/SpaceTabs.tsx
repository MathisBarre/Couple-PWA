import { Tabs } from '@base-ui/react/tabs'
import { useLayoutEffect, useRef, type ReactNode } from 'react'
import { useDesktop } from '../lib/desktop'
import { slideTabs } from '../lib/motion'
import { GearIcon, HeaderButton, ScreenHeader } from './ScreenHeader'

export interface SpaceTab<T extends string> {
  id: T
  label: string
  node: ReactNode
  /** Barre propre à cet onglet, collée sous les onglets quand on fait défiler (ex. le jour du planning). */
  bar?: ReactNode
}

/**
 * Écran d'un espace : grand titre, ⚙️ pour ses réglages (écran empilé), et ses onglets
 * (ex. Cycle : Suivi / Analyse) qui restent collés en haut, en compact, quand on fait défiler.
 * Les réglages communs à toute l'app restent dans l'onglet Réglages de la barre du bas.
 */
export function SpaceTabs<T extends string>({
  title,
  tabs,
  tab,
  onTab,
  onSettings,
  split,
}: {
  title: string
  tabs: SpaceTab<T>[]
  tab: T
  onTab: (t: T) => void
  onSettings?: () => void
  /** Ordinateur : tous les onglets côte à côte, chacun sous son titre (ex. Courses | À faire). */
  split?: boolean
}) {
  const desktop = useDesktop()
  const panels = useRef<Partial<Record<T, HTMLElement | null>>>({})

  // Les panneaux restent montés (saisie en cours conservée) et glissent l'un vers l'autre.
  const order = useRef<T[]>([])
  useLayoutEffect(() => {
    order.current = tabs.map((t) => t.id)
  })
  const prev = useRef(tab)
  useLayoutEffect(() => {
    const from = prev.current
    prev.current = tab
    const a = panels.current[from]
    const b = panels.current[tab]
    if (from === tab || !a || !b) return
    const ids = order.current
    return slideTabs(a, b, ids.indexOf(tab) > ids.indexOf(from) ? 1 : -1, { inFlow: true })
  }, [tab])

  const action = onSettings && (
    <HeaderButton label={`Réglages : ${title}`} onClick={onSettings}>
      <GearIcon />
    </HeaderButton>
  )
  // Ordinateur, côte à côte : plus d'onglets, chaque liste a sa colonne.
  if (desktop && split && tabs.length > 1)
    return (
      <>
        <ScreenHeader title={title} />
        <div className="grid items-start gap-6" style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}>
          {tabs.map(({ id, label, node }) => (
            <section key={id} aria-label={label} className="min-w-0">
              <h2 className="sk-h2 mb-3">{label}</h2>
              {node}
            </section>
          ))}
        </div>
      </>
    )

  if (tabs.length === 1)
    return (
      <>
        <ScreenHeader title={title} action={action} />
        {tabs[0].node}
      </>
    )

  const list = (
    <Tabs.List className="sk-tabs" style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}>
      {/* Pastille enfoncée qui glisse sous l'onglet actif (contrôle segmenté de barre, iOS 6). */}
      <Tabs.Indicator className="sk-tabs-pill top-(--active-tab-top) left-0 h-(--active-tab-height) w-(--active-tab-width) [transform:translateX(var(--active-tab-left))]" />
      {tabs.map(({ id, label }) => (
        <Tabs.Tab key={id} value={id} className="sk-tab">
          {label}
        </Tabs.Tab>
      ))}
    </Tabs.List>
  )

  return (
    <Tabs.Root value={tab} onValueChange={(v) => onTab(v as T)}>
      <ScreenHeader
        title={title}
        action={action}
        sticky={
          <>
            {/* Ordinateur : on change d'onglet depuis la barre latérale. */}
            {!desktop && list}
            {tabs.find((t) => t.id === tab)?.bar}
          </>
        }
      />
      <div className="relative">
        {tabs.map(({ id, node }) => (
          <Tabs.Panel
            key={id}
            keepMounted
            value={id}
            ref={(el: HTMLElement | null) => {
              panels.current[id] = el
            }}
          >
            {node}
          </Tabs.Panel>
        ))}
      </div>
    </Tabs.Root>
  )
}
