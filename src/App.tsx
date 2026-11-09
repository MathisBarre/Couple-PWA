import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { Auth, CenterLayout } from './components/Auth'
import { Cycle, type CycleTab } from './components/Cycle'
import { Groceries } from './components/Groceries'
import { More } from './components/More'
import { Settings } from './components/Settings'
import { Setup } from './components/Setup'
import { fetchMe, type Me } from './lib/api'
import { localToday } from './lib/dates'
import { useGroceries } from './lib/groceries'
import { useDayLogs } from './lib/store'
import { barItemFor, BAR, OVERFLOW, type View } from './modules'

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
  const [view, setView] = useState<View>('cycle')
  const [cycleTab, setCycleTab] = useState<CycleTab>('today')
  const [today, setToday] = useState(localToday())
  const { logs, save, remove, pending: pendingLogs } = useDayLogs(couple.id, profile.id)
  const groceries = useGroceries(couple.id, profile.id, view === 'groceries')
  const pending = pendingLogs + groceries.pending
  const names = Object.fromEntries(members.map((m) => [m.id, m.id === profile.id ? 'vous' : m.display_name]))

  // Petite pastille sur l'icône d'un espace (ex. nombre d'articles à acheter).
  const badges: Partial<Record<View, number>> = { groceries: groceries.items.filter((i) => !i.done).length }

  useEffect(() => {
    if (location.search) history.replaceState(null, '', '/')
    const onVisible = () => document.visibilityState === 'visible' && setToday(localToday())
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [])

  const open = (v: View) => {
    // Retoucher l'onglet Cycle depuis un autre écran du cycle ramène à la saisie du jour.
    if (v === 'cycle' && view === 'cycle') setCycleTab('today')
    setView(v)
    window.scrollTo(0, 0)
  }

  const settings = <Settings couple={couple} profile={profile} members={members} onChange={reload} />

  let screen: ReactNode
  switch (view) {
    case 'cycle':
      screen = (
        <Cycle
          tab={cycleTab}
          onTab={setCycleTab}
          today={today}
          logs={logs}
          defaultCycle={couple.default_cycle_length}
          iudInsertedOn={couple.iud_inserted_on}
          names={names}
          onSave={save}
          onDelete={remove}
        />
      )
      break
    case 'groceries':
      screen = (
        <Groceries
          items={groceries.items}
          names={names}
          onAdd={groceries.add}
          onToggle={groceries.toggle}
          onRemove={groceries.remove}
          onClearDone={groceries.clearDone}
        />
      )
      break
    case 'settings':
      screen = settings
      break
    case 'more':
      screen = (
        <More modules={OVERFLOW} onOpen={open}>
          {settings}
        </More>
      )
      break
  }

  const active = barItemFor(view)

  return (
    <div className="flex min-h-dvh flex-col">
      {pending > 0 && (
        <div className="sticky top-0 z-10 bg-soon px-2 pt-[calc(env(safe-area-inset-top)+4px)] pb-1 text-center text-xs text-on-soon">
          Hors ligne · {pending} modification(s) en attente de synchronisation
        </div>
      )}
      <main className="mx-auto w-full max-w-xl flex-1 px-4 pt-[calc(env(safe-area-inset-top)+12px)] pb-[calc(env(safe-area-inset-bottom)+88px)]">
        {screen}
      </main>
      <nav
        aria-label="Navigation principale"
        className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-bg/90 px-2 pt-1.5 pb-[calc(env(safe-area-inset-bottom)+6px)] backdrop-blur-md"
      >
        <div className="mx-auto flex max-w-xl">
          {BAR.map(({ id, label, icon }) => {
            const badge = badges[id] ?? 0
            return (
              <button
                key={id}
                type="button"
                onClick={() => open(id)}
                aria-current={active === id ? 'page' : undefined}
                className="group flex flex-1 flex-col items-center gap-0.5 py-1 text-[0.72rem] text-ink-2 outline-none focus-visible:text-accent aria-[current=page]:font-semibold aria-[current=page]:text-accent"
              >
                <span aria-hidden className="relative text-xl">
                  <span className="opacity-70 grayscale group-aria-[current=page]:opacity-100 group-aria-[current=page]:grayscale-0">{icon}</span>
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
