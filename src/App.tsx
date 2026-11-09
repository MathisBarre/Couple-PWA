import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { Auth, CenterLayout } from './components/Auth'
import { Cycle, type CycleTab } from './components/Cycle'
import { Groceries } from './components/Groceries'
import { More } from './components/More'
import { NotificationSwitches } from './components/NotificationSwitches'
import { SpaceTabs } from './components/SpaceTabs'
import { SyncIndicator } from './components/SyncIndicator'
import { Settings } from './components/Settings'
import { Setup } from './components/Setup'
import { Stack, type StackHandle } from './components/Stack'
import { useTabMenu, type MenuItem } from './components/TabMenu'
import { cx } from './components/ui'
import { fetchMe, type Me } from './lib/api'
import { localToday } from './lib/dates'
import { useGroceries } from './lib/groceries'
import { slideTabs } from './lib/motion'
import { useDayLogs } from './lib/store'
import { applyTheme, BAR, labelFor, MODULES, OVERFLOW, SETTINGS_SECTIONS, themeFor, type ModuleId, type View } from './modules'

const ME_CACHE = 'me'

export default function App() {
  // undefined = chargement, null = non connecté
  const [me, setMe] = useState<Me | null | undefined>(undefined)

  const reload = useCallback(async () => {
    try {
      const data = await fetchMe()
      setMe(data)
      try {
        if (data) localStorage.setItem(ME_CACHE, JSON.stringify(data))
        else localStorage.removeItem(ME_CACHE)
      } catch {
        /* stockage indisponible */
      }
    } catch {
      // Hors ligne : on ouvre l'app avec le dernier profil connu.
      try {
        setMe(JSON.parse(localStorage.getItem(ME_CACHE) ?? 'null'))
      } catch {
        setMe(null)
      }
    }
  }, [])

  useEffect(() => {
    reload()
  }, [reload])

  if (me === undefined) return <Splash />
  if (!me) return <Auth onDone={reload} />
  if (!me.couple) return <Setup onDone={reload} />
  return <Main me={me as Me & { couple: NonNullable<Me['couple']> }} reload={reload} />
}

function Main({ me, reload }: { me: Me & { couple: NonNullable<Me['couple']> }; reload: () => void }) {
  const { couple, user: profile, members } = me
  // À l'ouverture (et depuis une notification) : directement la saisie du jour.
  // « ?open=groceries » (notification des courses) ouvre directement cet onglet.
  const [tab, setTab] = useState<View>(() => {
    const open = new URLSearchParams(location.search).get('open')
    return BAR.find((i) => i.id === open)?.id ?? 'cycle'
  })
  // Écrans empilés dans chaque onglet (ex. un espace ouvert depuis « Plus »), gardés quand on change d'onglet.
  const [stacks, setStacks] = useState<Partial<Record<View, View[]>>>({})
  // Onglet affiché en haut de chaque espace ; « settings » = son onglet Réglages.
  const [subTabs, setSubTabs] = useState<{ cycle: CycleTab; groceries: 'list' | 'settings' }>({ cycle: 'today', groceries: 'list' })
  const setSubTab = <K extends keyof typeof subTabs>(id: K) => (t: (typeof subTabs)[K]) => setSubTabs((s) => ({ ...s, [id]: t }))
  const [today, setToday] = useState(localToday())
  const view = stacks[tab]?.at(-1) ?? tab
  const { logs, save, remove, pending: pendingLogs } = useDayLogs(couple.id, profile.id)
  const groceries = useGroceries(couple.id, profile.id, view === 'groceries')
  const pending = pendingLogs + groceries.pending
  const partner = members.find((m) => m.id !== profile.id)
  const other = partner?.display_name || 'votre partenaire'
  const names = Object.fromEntries(members.map((m) => [m.id, m.id === profile.id ? 'vous' : m.display_name]))
  const stackRefs = useRef<Partial<Record<View, StackHandle | null>>>({})
  const tabEls = useRef<Partial<Record<View, HTMLElement | null>>>({})

  // Petite pastille sur l'icône d'un espace (ex. nombre d'articles à acheter).
  const badges: Partial<Record<View, number>> = { groceries: groceries.items.filter((i) => !i.done).length }

  useEffect(() => {
    if (location.search) history.replaceState(null, '', '/')
    const onVisible = () => document.visibilityState === 'visible' && setToday(localToday())
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [])

  // Chaque espace a sa couleur (rose pour le cycle, verdure pour les courses…).
  useEffect(() => {
    applyTheme(themeFor(view))
  }, [view])
  useEffect(() => () => applyTheme('neutre'), [])

  // Changement d'onglet : l'écran glisse vers la gauche ou la droite selon la position dans la barre.
  const prevTab = useRef(tab)
  useLayoutEffect(() => {
    const from = prevTab.current
    prevTab.current = tab
    const a = tabEls.current[from]
    const b = tabEls.current[tab]
    if (from === tab || !a || !b) return
    const order = BAR.map((i) => i.id)
    return slideTabs(a, b, order.indexOf(tab) > order.indexOf(from) ? 1 : -1)
  }, [tab])

  // Bouton retour d'Android (et retour du navigateur) : dépile l'écran affiché.
  const tabRef = useRef(tab)
  const stacksRef = useRef(stacks)
  useLayoutEffect(() => {
    tabRef.current = tab
    stacksRef.current = stacks
  })
  const ignorePopstate = useRef(0)
  const historyPop = useRef(false)
  useEffect(() => {
    const onPopstate = () => {
      if (ignorePopstate.current) return void ignorePopstate.current--
      if (!stacksRef.current[tabRef.current]?.length) return
      historyPop.current = true
      stackRefs.current[tabRef.current]?.pop()
    }
    addEventListener('popstate', onPopstate)
    return () => removeEventListener('popstate', onPopstate)
  }, [])

  const push = (v: View, t: View = tab) => {
    setStacks((s) => ({ ...s, [t]: [...(s[t] ?? []), v] }))
    history.pushState({ stack: true }, '')
  }

  const popped = (t: View) => (n: number) => {
    setStacks((s) => ({ ...s, [t]: (s[t] ?? []).slice(0, -n) }))
    // Dépilé depuis l'app (bouton ‹, geste) : on recule aussi dans l'historique, en silence.
    if (historyPop.current) historyPop.current = false
    else if (history.state?.stack) {
      ignorePopstate.current++
      history.go(-n)
    }
  }

  const openTab = (v: View) => {
    if (v !== tab) return setTab(v)
    // Retoucher l'onglet affiché : retour à la racine, sinon remonte en haut (comme sur iOS).
    const depth = stacks[v]?.length ?? 0
    if (depth) return stackRefs.current[v]?.pop(depth)
    stackRefs.current[v]?.scrollToTop()
    if (v === 'cycle') setSubTab('cycle')('today')
    if (v === 'groceries') setSubTab('groceries')('list')
  }

  // Raccourci depuis les réglages globaux : ouvre l'onglet Réglages de l'espace.
  const openSpaceSettings = (id: ModuleId) => {
    setSubTabs((s) => ({ ...s, [id]: 'settings' }))
    if (BAR.some((b) => b.id === id)) setTab(id)
    else push(id)
  }

  // Appui long sur un onglet de la barre du bas : ses sous-écrans, pour y aller directement.
  const menuItems = (t: View): MenuItem[] => {
    if (t === 'settings')
      // Seulement les rubriques présentes à l'écran.
      return SETTINGS_SECTIONS.filter((s) => document.getElementById(`reglages-${s.id}`)).map((s) => ({ key: s.id, label: s.label, icon: s.icon }))
    if (t === 'more') return OVERFLOW.map((m) => ({ key: m.id, label: m.label, icon: m.icon, current: view === m.id }))
    const sections = MODULES.find((m) => m.id === t)?.sections ?? []
    const current = (subTabs as Record<string, string>)[t]
    return sections.map((s) => ({ key: s.id, label: s.label, icon: s.icon, current: view === t && current === s.id }))
  }
  const pickMenu = (t: View, key: string) => {
    if (t !== tab) setTab(t)
    if (t === 'settings') {
      const el = document.getElementById(`reglages-${key}`)
      const scroller = el?.closest('[data-scroll]')
      if (el && scroller)
        scroller.scrollTo({ top: el.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop - 16, behavior: 'smooth' })
    } else if (t === 'more') {
      if (view === key) return
      // Un autre espace déjà ouvert depuis « Plus » : on le remplace.
      if (stacks.more?.length) setStacks((s) => ({ ...s, more: [key as View] }))
      else push(key as View, 'more')
    } else setSubTabs((s) => ({ ...s, [t]: key }))
  }
  const tabMenu = useTabMenu(menuItems, pickMenu)

  const settings = <Settings couple={couple} profile={profile} members={members} onChange={reload} onOpenSpace={openSpaceSettings} />

  const render = (v: View): ReactNode => {
    switch (v) {
      case 'cycle':
        return (
          <Cycle
            tab={subTabs.cycle}
            onTab={setSubTab('cycle')}
            today={today}
            logs={logs}
            couple={couple}
            onCoupleChange={reload}
            other={other}
            names={names}
            onSave={save}
            onDelete={remove}
          />
        )
      case 'groceries':
        return (
          <SpaceTabs
            tab={subTabs.groceries}
            onTab={setSubTab('groceries')}
            tabs={[
              {
                id: 'list',
                label: 'Liste',
                node: (
                  <Groceries
                    items={groceries.items}
                    names={names}
                    onAdd={groceries.add}
                    onToggle={groceries.toggle}
                    onRemove={groceries.remove}
                    onClearDone={groceries.clearDone}
                  />
                ),
              },
              {
                id: 'settings',
                label: 'Réglages',
                node: <NotificationSwitches items={[{ kind: 'groceries', label: `Quand ${other} modifie les courses` }]} />,
              },
            ]}
          />
        )
      case 'settings':
        return settings
      case 'more':
        return (
          <More modules={OVERFLOW} onOpen={push}>
            {settings}
          </More>
        )
    }
  }

  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      <SyncIndicator pending={pending} />
      <div className="relative flex-1 overflow-hidden">
        {BAR.map(({ id }) => (
          <div
            key={id}
            ref={(el) => {
              tabEls.current[id] = el
            }}
            inert={id !== tab}
            className={cx('absolute inset-0', id !== tab && 'invisible')}
          >
            <Stack
              ref={(h) => {
                stackRefs.current[id] = h
              }}
              screens={[id, ...(stacks[id] ?? [])].map((v) => ({ key: v, theme: themeFor(v), title: labelFor(v), node: render(v) }))}
              onPop={popped(id)}
            />
          </div>
        ))}
      </div>
      <nav
        aria-label="Navigation principale"
        className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-bg/90 px-2 pt-1.5 pb-[calc(env(safe-area-inset-bottom)+6px)] backdrop-blur-md transition-colors duration-300"
      >
        <div className="mx-auto flex max-w-xl">
          {BAR.map(({ id, label, icon }) => {
            const badge = badges[id] ?? 0
            return (
              <button
                key={id}
                type="button"
                onClick={() => openTab(id)}
                {...tabMenu.bind(id)}
                aria-current={tab === id ? 'page' : undefined}
                className="group flex touch-none [-webkit-touch-callout:none] flex-1 flex-col items-center gap-0.5 py-1 text-[0.72rem] text-ink-2 outline-none select-none focus-visible:text-accent aria-[current=page]:font-semibold aria-[current=page]:text-accent"
              >
                <span
                  aria-hidden
                  className="relative text-xl transition-transform duration-200 ease-out group-active:scale-85 motion-reduce:transition-none"
                >
                  <span className="opacity-70 grayscale transition-[opacity,filter] duration-200 group-aria-[current=page]:opacity-100 group-aria-[current=page]:grayscale-0">
                    {icon}
                  </span>
                  {badge > 0 && (
                    <span className="absolute -top-1 -right-2.5 min-w-4.5 rounded-full bg-accent px-1 text-center text-[0.65rem] leading-4.5 font-semibold text-on-accent">
                      {badge > 99 ? '99+' : badge}
                    </span>
                  )}
                </span>
                {label}
                {badge > 0 && <span className="sr-only">({badge})</span>}
              </button>
            )
          })}
        </div>
      </nav>
      {tabMenu.menu}
    </div>
  )
}

function Splash() {
  return (
    <CenterLayout>
      <img src="/logo.svg" alt="" className="size-24 animate-[pulse-soft_1.2s_ease-in-out_infinite]" />
    </CenterLayout>
  )
}
