import { useEffect, useState } from 'react'
import { currentSubscription, disablePush, enablePush, isIOS, isStandalone, pushSupported, sendTestPush } from '../lib/push'
import { api, logout, type Couple, type Me, type Member } from '../lib/api'
import { SPACES_WITH_SETTINGS, type ModuleId } from '../modules'
import { AppUpdate } from './AppUpdate'
import { ScreenHeader } from './ScreenHeader'
import { InviteLink } from './InviteLink'
import { SchemePicker } from './SchemePicker'
import { Chevron, Glyph } from './icons'
import { Button, cx, Group, inputClass, SectionTitle, Switch } from './ui'

interface Props {
  couple: Couple
  profile: Me['user']
  members: Member[]
  onChange: () => void
  onOpenSpace: (id: ModuleId) => void
  /** Affiché dans l'écran « Plus » (qui a déjà son en-tête) : simple titre de section. */
  embedded?: boolean
}

export function Settings({ couple, profile, members, onChange, onOpenSpace, embedded }: Props) {
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
    <>
      {!embedded && <ScreenHeader title="Réglages" />}
      <div className="flex flex-col gap-5">
      {embedded && <h2 className="sk-h2">Réglages</h2>}

      {SPACES_WITH_SETTINGS.length > 0 && (
        <section id="reglages-espaces" className="sk-group scroll-mt-4">
          <SectionTitle>Réglages des espaces</SectionTitle>
          <ul className="sk-card sk-list">
            {SPACES_WITH_SETTINGS.map((m) => (
              <li key={m.id}>
                <button
                  type="button"
                  onClick={() => onOpenSpace(m.id)}
                  className="flex min-h-14 w-full items-center gap-3 px-4 py-2.5 text-left transition-colors outline-none select-none focus-visible:bg-surface-2 active:bg-surface-2"
                >
                  {/* Pastille aux couleurs de l'espace (son thème s'applique à elle seule). */}
                  <span data-theme={m.theme} aria-hidden className="sk-app-icon size-9 shrink-0">
                    <Glyph icon={m.icon} className="size-5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold">{m.label}</span>
                    <span className="block truncate text-sm text-ink-2">{m.settings}</span>
                  </span>
                  <Chevron className="text-ink-2/60" />
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section id="reglages-apparence" className="sk-group scroll-mt-4">
        <SectionTitle>Apparence</SectionTitle>
        <SchemePicker />
      </section>

      <Group id="reglages-notifications" title="Notifications">
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
          Active les notifications de l’app sur ce téléphone. Ce que chaque espace envoie se règle dans ses propres réglages (⚙️ en haut de
          l’espace).
        </p>
        {msg && <p className="mt-2 text-sm text-accent">{msg}</p>}
      </Group>

      <Group id="reglages-couple" title="Couple">
        <label className="flex items-center justify-between gap-3 py-2">
          <span className="shrink-0 font-medium">Mon prénom</span>
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
          <InviteLink code={couple.invite_code} from={profile.display_name} />
        )}
      </Group>

      <div id="reglages-app" className="scroll-mt-4">
        <AppUpdate />
      </div>

      <Button variant="secondary" onClick={() => logout().then(onChange)}>
        Se déconnecter
      </Button>
      </div>
    </>
  )
}
