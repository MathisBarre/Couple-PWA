import { useEffect, useState } from 'react'
import {
  currentSubscription,
  disablePush,
  enablePush,
  fetchNotificationPrefs,
  isIOS,
  isStandalone,
  pushSupported,
  sendTestPush,
  setNotificationPref,
  type NotificationPrefs,
} from '../lib/push'
import { api, logout, type Couple, type Me, type Member } from '../lib/api'
import { AppUpdate } from './AppUpdate'
import { Button, Card, cx, inputClass, SectionTitle, Select, Switch } from './ui'

interface Props {
  couple: Couple
  profile: Me['user']
  members: Member[]
  onChange: () => void
}

const CYCLES = Array.from({ length: 26 }, (_, i) => ({ value: i + 20, label: `${i + 20} jours` }))

export function Settings({ couple, profile, members, onChange }: Props) {
  const [pushOn, setPushOn] = useState(false)
  const [prefs, setPrefs] = useState<NotificationPrefs | null>(null)
  const [msg, setMsg] = useState('')
  const [name, setName] = useState(profile.display_name)
  const partner = members.find((m) => m.id !== profile.id)

  useEffect(() => {
    currentSubscription().then((s) => setPushOn(Boolean(s)))
    fetchNotificationPrefs().then(setPrefs, () => {})
  }, [])

  const togglePref = (kind: keyof NotificationPrefs, enabled: boolean) => {
    setPrefs((p) => p && { ...p, [kind]: enabled })
    setNotificationPref(kind, enabled).then(setPrefs, (e: Error) => {
      setPrefs((p) => p && { ...p, [kind]: !enabled })
      setMsg(e.message)
    })
  }
  const other = partner?.display_name || (members.length > 2 ? 'les autres' : 'votre partenaire')

  const updateCouple = async (patch: Partial<Couple>) => {
    try {
      await api('couple', { method: 'PATCH', body: patch })
      onChange()
    } catch (e) {
      setMsg((e as Error).message)
    }
  }

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

      <Card id="reglages-notifications" className="scroll-mt-4">
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
            {pushOn && prefs && (
              <div className="mt-1 border-t border-line pt-1">
                <Switch label="Rappels du cycle" checked={prefs.reminders} onChange={(v) => togglePref('reminders', v)} />
                <Switch label={`Quand ${other} note le cycle`} checked={prefs.cycle} onChange={(v) => togglePref('cycle', v)} />
                <Switch label={`Quand ${other} modifie les courses`} checked={prefs.groceries} onChange={(v) => togglePref('groceries', v)} />
              </div>
            )}
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
          Rappels : un par jour, vers 19 h (jour de règles non noté, fin probable, 2 jours avant les prochaines règles, jour prévu, retard), sur
          les téléphones de vous deux. Nouveautés : quand {other} saisit quelque chose, une seule notification résume ses saisies, environ 20
          secondes après la dernière. Vous n’êtes jamais prévenu de vos propres saisies.
        </p>
        {msg && <p className="mt-2 text-sm text-accent">{msg}</p>}
      </Card>

      <Card id="reglages-cycle" className="scroll-mt-4">
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

      <Card id="reglages-couple" className="scroll-mt-4">
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

      <div id="reglages-app" className="scroll-mt-4">
        <AppUpdate />
      </div>

      <Button variant="secondary" onClick={() => logout().then(onChange)}>
        Se déconnecter
      </Button>
    </div>
  )
}
