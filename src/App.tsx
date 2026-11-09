import { Tabs } from '@base-ui/react/tabs'
import { useCallback, useEffect, useState } from 'react'
import { Auth, CenterLayout } from './components/Auth'
import { Calendar } from './components/Calendar'
import { Groceries } from './components/Groceries'
import { Settings } from './components/Settings'
import { Setup } from './components/Setup'
import { Stats } from './components/Stats'
import { Today } from './components/Today'
import { fetchMe, type Me } from './lib/api'
import { localToday } from './lib/dates'
import { useGroceries } from './lib/groceries'
import { useDayLogs } from './lib/store'

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

type Tab = 'today' | 'calendar' | 'groceries' | 'stats' | 'settings'

function Main({ me, reload }: { me: Me & { couple: NonNullable<Me['couple']> }; reload: () => void }) {
  const { couple, user: profile, members } = me
  const [tab, setTab] = useState<Tab>('today')
  const [today, setToday] = useState(localToday())
  const { logs, save, remove, pending: pendingLogs } = useDayLogs(couple.id, profile.id)
  const groceries = useGroceries(couple.id, profile.id, tab === 'groceries')
  const pending = pendingLogs + groceries.pending
  const toBuy = groceries.items.filter((i) => !i.done).length
  const names = Object.fromEntries(members.map((m) => [m.id, m.id === profile.id ? 'vous' : m.display_name]))

  useEffect(() => {
    // Ouvert depuis une notification : aller directement à la saisie du jour.
    // (l'onglet par défaut est déjà la saisie du jour)
    if (location.search) history.replaceState(null, '', '/')
    const onVisible = () => document.visibilityState === 'visible' && setToday(localToday())
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [])

  const common = { today, logs, defaultCycle: couple.default_cycle_length }

  return (
    <Tabs.Root value={tab} onValueChange={(v) => setTab(v as Tab)} className="flex min-h-dvh flex-col">
      {pending > 0 && (
        <div className="sticky top-0 z-10 bg-soon px-2 pt-[calc(env(safe-area-inset-top)+4px)] pb-1 text-center text-xs text-on-soon">
          Hors ligne · {pending} modification(s) en attente de synchronisation
        </div>
      )}
      <main className="mx-auto w-full max-w-xl flex-1 px-4 pt-[calc(env(safe-area-inset-top)+12px)] pb-[calc(env(safe-area-inset-bottom)+88px)]">
        <Tabs.Panel value="today">
          <Today key={today} {...common} names={names} onSave={save} onDelete={remove} />
        </Tabs.Panel>
        <Tabs.Panel value="calendar">
          <Calendar {...common} names={names} onSave={save} onDelete={remove} />
        </Tabs.Panel>
        <Tabs.Panel value="groceries">
          <Groceries
            items={groceries.items}
            names={names}
            onAdd={groceries.add}
            onToggle={groceries.toggle}
            onRemove={groceries.remove}
            onClearDone={groceries.clearDone}
          />
        </Tabs.Panel>
        <Tabs.Panel value="stats">
          <Stats {...common} iudInsertedOn={couple.iud_inserted_on} />
        </Tabs.Panel>
        <Tabs.Panel value="settings">
          <Settings couple={couple} profile={profile} members={members} onChange={reload} />
        </Tabs.Panel>
      </main>
      <Tabs.List className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-5 border-t border-line bg-bg/90 px-2 pt-1.5 pb-[calc(env(safe-area-inset-bottom)+6px)] backdrop-blur-md">
        {TABS.map(([id, label, icon]) => (
          <Tabs.Tab
            key={id}
            value={id}
            className="group flex flex-col items-center gap-0.5 py-1 text-[0.72rem] text-ink-2 outline-none focus-visible:text-accent data-active:font-semibold data-active:text-accent"
          >
            <span aria-hidden className="relative text-xl">
              <span className="opacity-70 grayscale group-data-active:opacity-100 group-data-active:grayscale-0">{icon}</span>
              {id === 'groceries' && toBuy > 0 && (
                <span className="absolute -top-1 -right-2.5 min-w-4.5 rounded-full bg-accent px-1 text-center text-[0.65rem] leading-4.5 font-semibold text-on-accent">
                  {toBuy > 99 ? '99+' : toBuy}
                </span>
              )}
            </span>
            {label}
          </Tabs.Tab>
        ))}
      </Tabs.List>
    </Tabs.Root>
  )
}

const TABS = [
  ['today', 'Aujourd’hui', '💧'],
  ['calendar', 'Calendrier', '🗓️'],
  ['groceries', 'Courses', '🛒'],
  ['stats', 'Analyse', '📊'],
  ['settings', 'Réglages', '⚙️'],
] as const

function Splash() {
  return (
    <CenterLayout>
      <img src="/logo.svg" alt="" className="size-24 animate-[pulse-soft_1.2s_ease-in-out_infinite]" />
    </CenterLayout>
  )
}
