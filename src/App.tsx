import { Tabs } from '@base-ui/react/tabs'
import type { Session } from '@supabase/supabase-js'
import { useEffect, useState } from 'react'
import { Auth, CenterLayout } from './components/Auth'
import { Calendar } from './components/Calendar'
import { Settings } from './components/Settings'
import { Setup } from './components/Setup'
import { Stats } from './components/Stats'
import { Today } from './components/Today'
import { localToday } from './lib/dates'
import { useDayLogs } from './lib/store'
import { isConfigured, supabase, type Couple, type Profile } from './lib/supabase'

export default function App() {
  const [session, setSession] = useState<Session | null | undefined>(undefined)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => data.subscription.unsubscribe()
  }, [])

  if (!isConfigured)
    return (
      <CenterLayout>
        <h1 className="text-2xl font-bold">Configuration manquante</h1>
        <p className="text-ink-2">Connectez Supabase au projet Vercel ou renseignez VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY (voir le README).</p>
      </CenterLayout>
    )
  if (session === undefined) return <Splash />
  if (!session) return <Auth />
  return <Signed userId={session.user.id} />
}

function Signed({ userId }: { userId: string }) {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [couple, setCouple] = useState<Couple | null>(null)
  const [members, setMembers] = useState<Profile[]>([])
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    ;(async () => {
      const { data: p } = await supabase.from('profiles').select('*').eq('id', userId).single()
      setProfile(p as Profile)
      if (p?.couple_id) {
        const [{ data: c }, { data: m }] = await Promise.all([
          supabase.from('couples').select('*').eq('id', p.couple_id).single(),
          supabase.from('profiles').select('*').eq('couple_id', p.couple_id),
        ])
        setCouple(c as Couple)
        setMembers((m ?? []) as Profile[])
      }
      setLoaded(true)
    })()
  }, [userId, couple?.id])

  if (!loaded || !profile) return <Splash />
  if (!couple) return <Setup onDone={setCouple} />
  return <Main couple={couple} profile={profile} members={members} setCouple={setCouple} setProfile={setProfile} />
}

type Tab = 'today' | 'calendar' | 'stats' | 'settings'

function Main({
  couple,
  profile,
  members,
  setCouple,
  setProfile,
}: {
  couple: Couple
  profile: Profile
  members: Profile[]
  setCouple: (c: Couple) => void
  setProfile: (p: Profile) => void
}) {
  const [tab, setTab] = useState<Tab>('today')
  const [today, setToday] = useState(localToday())
  const { logs, save, remove, pending } = useDayLogs(couple.id, profile.id)
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
          Hors ligne · {pending} saisie(s) en attente de synchronisation
        </div>
      )}
      <main className="mx-auto w-full max-w-xl flex-1 px-4 pt-[calc(env(safe-area-inset-top)+12px)] pb-[calc(env(safe-area-inset-bottom)+88px)]">
        <Tabs.Panel value="today">
          <Today key={today} {...common} names={names} onSave={save} onDelete={remove} />
        </Tabs.Panel>
        <Tabs.Panel value="calendar">
          <Calendar {...common} names={names} onSave={save} onDelete={remove} />
        </Tabs.Panel>
        <Tabs.Panel value="stats">
          <Stats {...common} iudInsertedOn={couple.iud_inserted_on} />
        </Tabs.Panel>
        <Tabs.Panel value="settings">
          <Settings couple={couple} profile={profile} members={members} onCoupleChange={setCouple} onProfileChange={setProfile} />
        </Tabs.Panel>
      </main>
      <Tabs.List className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-4 border-t border-line bg-bg/90 px-2 pt-1.5 pb-[calc(env(safe-area-inset-bottom)+6px)] backdrop-blur-md">
        {TABS.map(([id, label, icon]) => (
          <Tabs.Tab
            key={id}
            value={id}
            className="group flex flex-col items-center gap-0.5 py-1 text-[0.72rem] text-ink-2 outline-none focus-visible:text-accent data-active:font-semibold data-active:text-accent"
          >
            <span aria-hidden className="text-xl opacity-70 grayscale group-data-active:opacity-100 group-data-active:grayscale-0">
              {icon}
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
