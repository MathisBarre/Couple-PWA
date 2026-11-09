import type { Session } from '@supabase/supabase-js'
import { useEffect, useState } from 'react'
import { Auth } from './components/Auth'
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
      <div className="center">
        <h1>Configuration manquante</h1>
        <p className="muted">Renseignez VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY (voir le README).</p>
      </div>
    )
  if (session === undefined) return <div className="center"><img src="/logo.svg" alt="" className="logo pulse" /></div>
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

  if (!loaded || !profile) return <div className="center"><img src="/logo.svg" alt="" className="logo pulse" /></div>
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
    <div className="app">
      {pending > 0 && <div className="offline">Hors ligne · {pending} saisie(s) en attente de synchronisation</div>}
      <main>
        {tab === 'today' && <Today key={today} {...common} names={names} onSave={save} onDelete={remove} />}
        {tab === 'calendar' && <Calendar {...common} names={names} onSave={save} onDelete={remove} />}
        {tab === 'stats' && <Stats {...common} iudInsertedOn={couple.iud_inserted_on} />}
        {tab === 'settings' && (
          <Settings couple={couple} profile={profile} members={members} onCoupleChange={setCouple} onProfileChange={setProfile} />
        )}
      </main>
      <nav className="tabs">
        {(
          [
            ['today', 'Aujourd’hui', '💧'],
            ['calendar', 'Calendrier', '🗓️'],
            ['stats', 'Analyse', '📊'],
            ['settings', 'Réglages', '⚙️'],
          ] as const
        ).map(([id, label, icon]) => (
          <button key={id} className={tab === id ? 'active' : ''} onClick={() => setTab(id)}>
            <span className="tab-icon" aria-hidden>{icon}</span>
            {label}
          </button>
        ))}
      </nav>
    </div>
  )
}
