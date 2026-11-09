import { useEffect, useState } from 'react'
import { currentSubscription, disablePush, enablePush, isIOS, isStandalone, pushSupported, sendTestPush } from '../lib/push'
import { supabase, type Couple, type Profile } from '../lib/supabase'

interface Props {
  couple: Couple
  profile: Profile
  members: Profile[]
  onCoupleChange: (c: Couple) => void
  onProfileChange: (p: Profile) => void
}

export function Settings({ couple, profile, members, onCoupleChange, onProfileChange }: Props) {
  const [pushOn, setPushOn] = useState<boolean | null>(null)
  const [msg, setMsg] = useState('')
  const [name, setName] = useState(profile.display_name)
  const partner = members.find((m) => m.id !== profile.id)

  useEffect(() => {
    currentSubscription().then((s) => setPushOn(Boolean(s)))
  }, [])

  const updateCouple = async (patch: Partial<Couple>) => {
    const { data, error } = await supabase.from('couples').update(patch).eq('id', couple.id).select().single()
    if (error) setMsg(error.message)
    else onCoupleChange(data as Couple)
  }

  const togglePush = async () => {
    setMsg('')
    try {
      if (pushOn) {
        await disablePush()
        setPushOn(false)
      } else {
        await enablePush(profile.id)
        setPushOn(true)
        setMsg('Notifications activées sur cet appareil.')
      }
    } catch (e) {
      setMsg((e as Error).message)
    }
  }

  return (
    <div className="screen">
      <h2>Réglages</h2>

      <div className="card">
        <h3>Notifications</h3>
        {!pushSupported || (isIOS && !isStandalone) ? (
          <p className="small">
            {isIOS
              ? 'Sur iPhone, installez d’abord l’app : Safari → Partager → « Sur l’écran d’accueil », puis ouvrez-la depuis l’icône.'
              : 'Ce navigateur ne gère pas les notifications push.'}
          </p>
        ) : (
          <>
            <label className="row">
              <span>Rappels sur cet appareil</span>
              <input type="checkbox" className="switch" checked={Boolean(pushOn)} onChange={togglePush} />
            </label>
            {pushOn && (
              <button className="link" onClick={() => sendTestPush().then((r) => setMsg(`Test envoyé à ${r.sent} appareil(s).`)).catch((e) => setMsg(e.message))}>
                Envoyer une notification de test
              </button>
            )}
          </>
        )}
        <label className="row">
          <span>Heure des rappels</span>
          <select value={couple.reminder_hour} onChange={(e) => updateCouple({ reminder_hour: Number(e.target.value) })}>
            {Array.from({ length: 24 }, (_, h) => (
              <option key={h} value={h}>
                {h} h
              </option>
            ))}
          </select>
        </label>
        <p className="muted small">
          Un rappel par jour maximum : chaque jour de règles non noté, quand ça semble fini, 2 jours avant les prochaines règles, le jour prévu
          et en cas de retard. Il part sur les téléphones de vous deux.
        </p>
        {msg && <p className="small accent">{msg}</p>}
      </div>

      <div className="card">
        <h3>Cycle</h3>
        <label className="row">
          <span>Pose du stérilet</span>
          <input type="date" value={couple.iud_inserted_on ?? ''} onChange={(e) => updateCouple({ iud_inserted_on: e.target.value || null })} />
        </label>
        <label className="row">
          <span>Cycle par défaut</span>
          <select value={couple.default_cycle_length} onChange={(e) => updateCouple({ default_cycle_length: Number(e.target.value) })}>
            {Array.from({ length: 26 }, (_, i) => i + 20).map((n) => (
              <option key={n} value={n}>
                {n} jours
              </option>
            ))}
          </select>
        </label>
        <p className="muted small">Utilisé tant qu’il n’y a pas deux cycles complets notés.</p>
      </div>

      <div className="card">
        <h3>Couple</h3>
        <label className="row">
          <span>Mon prénom</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={async () => {
              const { data } = await supabase.from('profiles').update({ display_name: name }).eq('id', profile.id).select().single()
              if (data) onProfileChange(data as Profile)
            }}
          />
        </label>
        {partner ? (
          <p>Partagé avec <strong>{partner.display_name}</strong>.</p>
        ) : (
          <p>
            Code à donner à votre partenaire : <strong className="code">{couple.invite_code}</strong>
          </p>
        )}
      </div>

      <button className="secondary wide" onClick={() => supabase.auth.signOut()}>
        Se déconnecter
      </button>
    </div>
  )
}
