import { useEffect, useState } from 'react'
import { currentSubscription, disablePush, enablePush, isIOS, isStandalone, pushSupported, sendTestPush } from '../lib/push'
import { supabase, type Couple, type Profile } from '../lib/supabase'
import { Button, Card, cx, inputClass, SectionTitle, Select, Switch } from './ui'

interface Props {
  couple: Couple
  profile: Profile
  members: Profile[]
  onCoupleChange: (c: Couple) => void
  onProfileChange: (p: Profile) => void
}

const HOURS = Array.from({ length: 24 }, (_, h) => ({ value: h, label: `${h} h` }))
const CYCLES = Array.from({ length: 26 }, (_, i) => ({ value: i + 20, label: `${i + 20} jours` }))

export function Settings({ couple, profile, members, onCoupleChange, onProfileChange }: Props) {
  const [pushOn, setPushOn] = useState(false)
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

  const togglePush = async (on: boolean) => {
    setMsg('')
    try {
      if (on) {
        await enablePush(profile.id)
        setMsg('Notifications activées sur cet appareil.')
      } else await disablePush()
      setPushOn(on)
    } catch (e) {
      setMsg((e as Error).message)
    }
  }

  return (
    <div className="flex flex-col gap-3.5">
      <h2 className="text-xl font-bold">Réglages</h2>

      <Card>
        <SectionTitle>Notifications</SectionTitle>
        {!pushSupported || (isIOS && !isStandalone) ? (
          <p className="text-sm">
            {isIOS
              ? 'Sur iPhone, installez d’abord l’app : Safari → Partager → « Sur l’écran d’accueil », puis ouvrez-la depuis l’icône.'
              : 'Ce navigateur ne gère pas les notifications push.'}
          </p>
        ) : (
          <>
            <Switch label="Rappels sur cet appareil" checked={pushOn} onChange={togglePush} />
            {pushOn && (
              <Button
                variant="link"
                onClick={() =>
                  sendTestPush()
                    .then((r) => setMsg(`Test envoyé à ${r.sent} appareil(s).`))
                    .catch((e: Error) => setMsg(e.message))
                }
              >
                Envoyer une notification de test
              </Button>
            )}
          </>
        )}
        <Select label="Heure des rappels" value={couple.reminder_hour} items={HOURS} onChange={(reminder_hour) => updateCouple({ reminder_hour })} />
        <p className="text-sm text-ink-2">
          Un rappel par jour maximum : chaque jour de règles non noté, quand ça semble fini, 2 jours avant les prochaines règles, le jour prévu
          et en cas de retard. Il part sur les téléphones de vous deux.
        </p>
        {msg && <p className="mt-2 text-sm text-accent">{msg}</p>}
      </Card>

      <Card>
        <SectionTitle>Cycle</SectionTitle>
        <label className="flex items-center justify-between gap-3 py-2">
          <span className="shrink-0">Pose du stérilet</span>
          <input
            type="date"
            className={cx(inputClass, 'max-w-[55%] py-2.5')}
            value={couple.iud_inserted_on ?? ''}
            onChange={(e) => updateCouple({ iud_inserted_on: e.target.value || null })}
          />
        </label>
        <Select
          label="Cycle par défaut"
          value={couple.default_cycle_length}
          items={CYCLES}
          onChange={(default_cycle_length) => updateCouple({ default_cycle_length })}
        />
        <p className="text-sm text-ink-2">Utilisé tant qu’il n’y a pas deux cycles complets notés.</p>
      </Card>

      <Card>
        <SectionTitle>Couple</SectionTitle>
        <label className="flex items-center justify-between gap-3 py-2">
          <span className="shrink-0">Mon prénom</span>
          <input
            className={cx(inputClass, 'max-w-[55%] py-2.5')}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={async () => {
              const { data } = await supabase.from('profiles').update({ display_name: name }).eq('id', profile.id).select().single()
              if (data) onProfileChange(data as Profile)
            }}
          />
        </label>
        {partner ? (
          <p className="py-2">
            Partagé avec <strong>{partner.display_name}</strong>.
          </p>
        ) : (
          <p className="py-2">
            Code à donner à votre partenaire :{' '}
            <strong className="font-mono text-xl tracking-[0.15em] text-accent select-all">{couple.invite_code}</strong>
          </p>
        )}
      </Card>

      <Button variant="secondary" onClick={() => supabase.auth.signOut()}>
        Se déconnecter
      </Button>
    </div>
  )
}
