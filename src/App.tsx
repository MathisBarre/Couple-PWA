import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { Auth, CenterLayout, Logo } from './components/Auth'
import { Cycle, type CycleTab } from './components/Cycle'
import { Groceries } from './components/Groceries'
import { More } from './components/More'
import { NotificationSwitches } from './components/NotificationSwitches'
import { CycleSettings } from './components/CycleSettings'
import { ScreenHeader } from './components/ScreenHeader'
import { SpaceTabs } from './components/SpaceTabs'
import { SyncIndicator } from './components/SyncIndicator'
import { Settings } from './components/Settings'
import { Setup } from './components/Setup'
import { Stack, type StackHandle } from './components/Stack'
import { useTabMenu, type MenuItem } from './components/TabMenu'
import { Glyph } from './components/icons'
import { cx } from './components/ui'
import { fetchMe, SESSION_EXPIRED, type Me } from './lib/api'
import { localToday } from './lib/dates'
import { clearInvite } from './lib/invite'
import { useGroceries } from './lib/groceries'
import { slideTabs } from './lib/motion'
import { useDayLogs } from './lib/store'
import {
  applyTheme,
  BAR,
  labelFor,
  MODULES,
  OVERFLOW,
  SETTINGS_SECTIONS,
  spaceSettings,
  themeFor,
  type ModuleId,
  type View,
} from './modules'

const ME_CACHE = 'me'

function cachedMe(): Me | undefined {
  try {
    const raw = localStorage.getItem(ME_CACHE)
    return raw ? (JSON.parse(raw) as Me) : undefined
  } catch {
    return undefined
  }
}

export default function App() {
  // undefined = chargement, null = non connecté.
  // Dernier profil connu affiché tout de suite : l'app s'ouvre sans attendre le serveur
  // (une fonction Vercel « froide » peut mettre plusieurs secondes à répondre). Le profil
  // est vérifié juste après, en arrière-plan.
  const [me, setMe] = useState<Me | null | undefined>(cachedMe)

  const reload = useCallback(async () => {
    try {
      const data = await fetchMe()
      // Déjà dans un espace : un éventuel lien d'invitation ouvert ne sert plus.
      if (data?.couple) clearInvite()
      setMe(data)
      try {
        if (data) localStorage.setItem(ME_CACHE, JSON.stringify(data))
        else localStorage.removeItem(ME_CACHE)
      } catch {
        /* stockage indisponible */
      }
    } catch {
      // Hors ligne ou serveur indisponible : on garde le dernier profil connu.
      setMe((prev) => (prev === undefined ? (cachedMe() ?? null) : prev))
    }
  }, [])

  useEffect(() => {
    reload()
  }, [reload])

  // Session expirée en cours d'utilisation (une requête a répondu 401) : retour à la connexion,
  // avec un mot d'explication. Ce qui était en attente d'envoi reste sur le téléphone.
  const [expired, setExpired] = useState(false)
  useEffect(() => {
    const onExpired = () => {
      setExpired(true)
      reload()
    }
    window.addEventListener(SESSION_EXPIRED, onExpired)
    return () => window.removeEventListener(SESSION_EXPIRED, onExpired)
  }, [reload])

  if (me === undefined) return <Splash />
  if (!me)
    return (
      <Auth
        notice={expired ? 'Votre session a expiré. Reconnectez-vous pour retrouver votre espace : rien de ce que vous aviez noté n’est perdu.' : undefined}
        onDone={() => {
          setExpired(false)
          return reload()
        }}
      />
    )
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
  // Onglet affiché en haut de chaque espace.
  const [subTabs, setSubTabs] = useState<{ cycle: CycleTab }>({ cycle: 'today' })
  const setSubTab =
    <K extends keyof typeof subTabs>(id: K) =>
    (t: (typeof subTabs)[K]) =>
      setSubTabs((s) => ({ ...s, [id]: t }))
  const [today, setToday] = useState(localToday())
  const view = stacks[tab]?.at(-1) ?? tab
  const { logs, save, remove, pending: pendingLogs, status: logsStatus, refresh: refreshLogs } = useDayLogs(couple.id, profile.id)
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
  }

  // Réglages d'un espace (⚙️ dans son en-tête, raccourci des réglages globaux, appui long) :
  // écran empilé sur l'espace.
  const openSpaceSettings = (id: ModuleId) => {
    const target = spaceSettings(id)
    if (BAR.some((b) => b.id === id)) {
      setTab(id)
      if (stacks[id]?.at(-1) !== target) push(target, id)
    } else {
      setTab('more')
      setStacks((s) => ({ ...s, more: [id, target] }))
    }
  }

  // Appui long sur un onglet de la barre du bas : ses sous-écrans, pour y aller directement.
  const menuItems = (t: View): MenuItem[] => {
    if (t === 'settings')
      // Seulement les rubriques présentes à l'écran.
      return SETTINGS_SECTIONS.filter((s) => document.getElementById(`reglages-${s.id}`)).map((s) => ({
        key: s.id,
        label: s.label,
        icon: s.icon,
      }))
    if (t === 'more') return OVERFLOW.map((m) => ({ key: m.id, label: m.label, icon: m.icon, current: view === m.id }))
    const sections = MODULES.find((m) => m.id === t)?.sections ?? []
    const current =
      tab !== t
        ? null
        : view === spaceSettings(t as ModuleId)
          ? 'settings'
          : view === t
            ? t === 'cycle'
              ? subTabs.cycle
              : sections[0]?.id
            : null
    return sections.map((s) => ({ key: s.id, label: s.label, icon: s.icon, current: current === s.id }))
  }
  const pickMenu = (t: View, key: string) => {
    if (t !== tab) setTab(t)
    if (t === 'settings') {
      const el = document.getElementById(`reglages-${key}`)
      const scroller = el?.closest('[data-scroll]')
      if (el && scroller)
        scroller.scrollTo({
          top: el.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop - 16,
          behavior: 'smooth',
        })
    } else if (t === 'more') {
      if (view === key) return
      // Un autre espace déjà ouvert depuis « Plus » : on le remplace.
      if (stacks.more?.length) setStacks((s) => ({ ...s, more: [key as View] }))
      else push(key as View, 'more')
    } else if (key === 'settings') openSpaceSettings(t as ModuleId)
    else {
      // Un autre sous-écran : on revient à l'espace lui-même (sans ses réglages empilés).
      if (stacks[t]?.length) stackRefs.current[t]?.pop(stacks[t]!.length)
      if (t === 'cycle') setSubTab('cycle')(key as CycleTab)
    }
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
            onSettings={() => openSpaceSettings('cycle')}
            names={names}
            onSave={save}
            onDelete={remove}
            load={logsStatus}
            onRetry={refreshLogs}
          />
        )
      case 'groceries':
        return (
          <SpaceTabs
            title="Courses"
            onSettings={() => openSpaceSettings('groceries')}
            tab="list"
            onTab={() => {}}
            tabs={[
              {
                id: 'list',
                label: 'Liste',
                node: (
                  <Groceries
                    items={groceries.items}
                    names={names}
                    waiting={groceries.waiting}
                    loading={groceries.status === 'loading' && !groceries.items.length}
                    failed={groceries.status === 'failed' && !groceries.items.length}
                    onRetry={groceries.refresh}
                    onAdd={groceries.add}
                    onToggle={groceries.toggle}
                    onRemove={groceries.remove}
                    onClearDone={groceries.clearDone}
                  />
                ),
              },
            ]}
          />
        )
      case 'cycle:settings':
        return (
          <>
            <ScreenHeader title="Réglages du cycle" />
            <CycleSettings couple={couple} other={other} onChange={reload} />
          </>
        )
      case 'groceries:settings':
        return (
          <>
            <ScreenHeader title="Réglages des courses" />
            <NotificationSwitches items={[{ kind: 'groceries', label: `Quand ${other} modifie les courses` }]} />
          </>
        )
      case 'settings':
        return settings
      case 'more':
        return (
          <More modules={OVERFLOW} onOpen={push}>
            <Settings couple={couple} profile={profile} members={members} onChange={reload} onOpenSpace={openSpaceSettings} embedded />
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
      <nav aria-label="Navigation principale" className="pointer-events-none fixed inset-x-0 bottom-0 z-20 px-3 pb-[calc(env(safe-area-inset-bottom)+10px)]">
        <div aria-hidden className="sk-tabbar-fade absolute inset-x-0 -top-7 bottom-0" />
        <div className="sk-tabbar pointer-events-auto relative mx-auto max-w-md">
          {BAR.map(({ id, label, icon }) => {
            const badge = badges[id] ?? 0
            return (
              <button
                key={id}
                type="button"
                onClick={() => openTab(id)}
                {...tabMenu.bind(id)}
                aria-current={tab === id ? 'page' : undefined}
                className="sk-tabbar-item group flex flex-1 touch-none flex-col items-center justify-center gap-0.5 select-none [-webkit-touch-callout:none]"
              >
                <span aria-hidden className="relative transition-transform duration-200 ease-out group-active:scale-90 motion-reduce:transition-none">
                  <Glyph icon={icon} />
                  {badge > 0 && <span className="sk-badge">{badge > 99 ? '99+' : badge}</span>}
                </span>
                <span className="relative">{label}</span>
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
      <Logo className="animate-[pulse-soft_1.2s_ease-in-out_infinite]" />
    </CenterLayout>
  )
}
