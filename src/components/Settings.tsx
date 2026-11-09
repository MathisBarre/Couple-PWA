import { useEffect, useState } from 'react'
import { currentSubscription, disablePush, enablePush, isIOS, isStandalone, pushSupported, sendTestPush } from '../lib/push'
import { api, logout, type Couple, type Me, type Member } from '../lib/api'
import { AppUpdate } from './AppUpdate'
import { SchemePicker } from './SchemePicker'
import { Button, Card, cx, inputClass, SectionTitle, Switch } from './ui'

interface Props {
  couple: Couple
  profile: Me['user']
  members: Member[]
  onChange: () => void
}

export function Settings({ couple, profile, members, onChange }: Props) {
  const [pushOn, setPushOn] = useState(false)
  const [msg, setMsg] = useState('')
  const [name, setName] = useState(profile.display_name)
  const partner = members.find((m) => m.id !== profile.id)

  useEffect(() => {
    currentSubscription().then((s) => setPushOn(Boolean(s)))
  }, [])

  const togglePush = async (on: boolean) => {
    setMsg('')
    try {
      if (on) {
        await enablePush()
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
        <SectionTitle>Apparence</SectionTitle>
        <SchemePicker />
      </Card>

      <Card>
        <SectionTitle>Notifications</SectionTitle>
        {!pushSupported || (isIOS && !isStandalone) ? (
          <p className="text-sm">
            {isIOS && !isStandalone
              ? 'Sur iPhone, installez d’abord l’app : Safari → Partager → « Sur l’écran d’accueil », puis ouvrez-la depuis l’icône.'
              : isIOS
                ? 'Les notifications demandent iOS 16.4 ou plus récent : mettez l’iPhone à jour (Réglages → Général → Mise à jour logicielle).'
                : 'Ce navigateur ne gère pas les notifications push.'}
          </p>
        ) : (
          <>
            <Switch label="Notifications sur cet appareil" checked={pushOn} onChange={togglePush} />
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
        <p className="mt-2 text-sm text-ink-2">
          Active les notifications de l’app sur ce téléphone. Ce que chaque espace envoie se règle dans son propre onglet Réglages (ex. Cycle →
          Réglages).
        </p>
        {msg && <p className="mt-2 text-sm text-accent">{msg}</p>}
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
              if (name.trim() && name !== profile.display_name) await api('auth', { method: 'PATCH', body: { display_name: name } }).then(onChange, () => {})
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

      <AppUpdate />

      <Button variant="secondary" onClick={() => logout().then(onChange)}>
        Se déconnecter
      </Button>
    </div>
  )
}
