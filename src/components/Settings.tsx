import { useEffect, useState } from 'react'
import { currentSubscription, disablePush, enablePush, isIOS, isStandalone, pushSupported, sendTestPush } from '../lib/push'
import { api, logout, type Couple, type Me, type Member } from '../lib/api'
import { withSettings, type Module, type ModuleId } from '../modules'
import { ModulePicker } from './ModulePicker'
import { AppUpdate } from './AppUpdate'
import { ScreenHeader } from './ScreenHeader'
import { InviteLink } from './InviteLink'
import { SchemePicker } from './SchemePicker'
import { Chevron, Glyph } from './icons'
import { Button, ConfirmDialog, cx, Group, inputClass, Notice, SectionTitle, Switch } from './ui'

interface Props {
  couple: Couple
  /** Espaces activés pour cet espace. */
  enabled: Module[]
  profile: Me['user']
  members: Member[]
  onChange: () => void | Promise<void>
  onOpenSpace: (id: ModuleId) => void
  /** Affiché dans l'écran « Plus » (qui a déjà son en-tête) : simple titre de section. */
  embedded?: boolean
}

export function Settings({ couple, enabled, profile, members, onChange, onOpenSpace, embedded }: Props) {
  // Espaces activés : affichés tout de suite, enregistrés en arrière-plan (remis en cas d'échec).
  const [modules, setModules] = useState<ModuleId[] | null>(null)
  const [modulesError, setModulesError] = useState('')
  const shownModules = modules ?? enabled.map((m) => m.id)
  const saveModules = async (ids: ModuleId[]) => {
    setModules(ids)
    setModulesError('')
    try {
      await api('couple', { method: 'PATCH', body: { modules: ids } })
      await onChange()
    } catch (e) {
      setModulesError(`Le choix n’a pas été enregistré. ${(e as Error).message}`)
    }
    setModules(null)
  }
  const spacesWithSettings = withSettings(enabled)
  const [pushOn, setPushOn] = useState(false)
  const [msg, setMsg] = useState('')
  const [name, setName] = useState(profile.display_name)
  const [nameError, setNameError] = useState('')
  const [savingName, setSavingName] = useState(false)
  const partner = members.find((m) => m.id !== profile.id)
  const others = members.filter((m) => m.id !== profile.id)

  const [confirmLogout, setConfirmLogout] = useState(false)
  const [loggingOut, setLoggingOut] = useState(false)
  const [logoutError, setLogoutError] = useState('')
  const doLogout = async () => {
    setLoggingOut(true)
    try {
      await logout()
      await onChange()
    } catch (e) {
      setConfirmLogout(false)
      setLogoutError(`La déconnexion n’a pas abouti. ${(e as Error).message}`)
    }
    setLoggingOut(false)
  }

  // Réinitialiser le mot de passe d'un autre membre (oublié) : il le choisira à sa prochaine connexion.
  const [resetting, setResetting] = useState<Member | null>(null)
  const [resetBusy, setResetBusy] = useState(false)
  const [resetMsg, setResetMsg] = useState('')
  const doReset = async () => {
    if (!resetting) return
    setResetBusy(true)
    try {
      await api('auth', { method: 'POST', body: { action: 'reset_member', member_id: resetting.id } })
      setResetMsg(`Mot de passe de ${resetting.display_name} réinitialisé. À sa prochaine connexion, son e-mail suffira pour en choisir un nouveau.`)
    } catch (e) {
      setResetMsg(`La réinitialisation n’a pas abouti. ${(e as Error).message}`)
    }
    setResetBusy(false)
    setResetting(null)
  }

  // Le prénom s'enregistre en quittant le champ. En cas d'échec, la saisie reste et on peut réessayer.
  const saveName = async () => {
    const next = name.trim()
    if (savingName) return
    if (!next) {
      // Champ vidé : on remet le prénom actuel plutôt que d'envoyer du vide.
      setName(profile.display_name)
      return setNameError('')
    }
    if (next === profile.display_name) return setNameError('')
    setSavingName(true)
    try {
      await api('auth', { method: 'PATCH', body: { display_name: next } })
      setNameError('')
      onChange()
    } catch (e) {
      setNameError(`Le prénom « ${next} » n’a pas été enregistré. ${(e as Error).message}`)
    }
    setSavingName(false)
  }

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

      {spacesWithSettings.length > 0 && (
        <section id="reglages-espaces" className="sk-group scroll-mt-4">
          <SectionTitle>Réglages des espaces</SectionTitle>
          <ul className="sk-card sk-list">
            {spacesWithSettings.map((m) => (
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
            maxLength={40}
            aria-invalid={nameError ? true : undefined}
            onBlur={saveName}
            onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
          />
        </label>
        {/* L'enregistrement a échoué : on le dit, la saisie reste dans le champ. */}
        {nameError && (
          <Notice action="Réessayer" onAction={saveName} busy={savingName} className="mt-1 mb-2">
            {nameError}
          </Notice>
        )}
        {partner ? (
          <p className="py-2">
            Partagé avec <strong>{partner.display_name}</strong>.
          </p>
        ) : (
          <InviteLink code={couple.invite_code} from={profile.display_name} />
        )}
        {others.map((m) => (
          <Button key={m.id} variant="link" className="mt-1" onClick={() => (setResetMsg(''), setResetting(m))}>
            {others.length > 1 ? `Réinitialiser le mot de passe de ${m.display_name}` : `${m.display_name} a oublié son mot de passe ?`}
          </Button>
        ))}
        {resetMsg && <p className="mt-2 text-sm text-ink-2">{resetMsg}</p>}
      </Group>
      <ConfirmDialog
        open={resetting != null}
        onClose={() => setResetting(null)}
        title={`Réinitialiser le mot de passe de ${resetting?.display_name ?? ''} ?`}
        confirm="Réinitialiser"
        onConfirm={doReset}
        busy={resetBusy}
      >
        {resetting?.display_name} sera déconnecté·e de ses appareils. À sa prochaine connexion, son e-mail suffira : l’app lui demandera de choisir un nouveau
        mot de passe. Ses données ne bougent pas.
      </ConfirmDialog>

      <div id="reglages-app" className="scroll-mt-4">
        <AppUpdate />
      </div>

      <section id="reglages-modules" className="sk-group scroll-mt-4">
        <SectionTitle>Espaces affichés</SectionTitle>
        <ModulePicker value={shownModules} onChange={saveModules} disabled={modules != null} />
        <p className="mt-2 px-1.5 text-sm text-ink-2">Pour vous deux. Un espace coupé disparaît de la barre. Ses données sont gardées si vous le rallumez.</p>
        {modulesError && <Notice className="mt-2">{modulesError}</Notice>}
      </section>

      {logoutError && <Notice>{logoutError}</Notice>}
      <Button variant="secondary" onClick={() => (setLogoutError(''), setConfirmLogout(true))}>
        Se déconnecter
      </Button>
      <ConfirmDialog open={confirmLogout} onClose={() => setConfirmLogout(false)} title="Se déconnecter ?" confirm="Se déconnecter" onConfirm={doLogout} busy={loggingOut}>
        Il faudra votre e-mail et votre mot de passe pour revenir sur ce téléphone.
      </ConfirmDialog>
      </div>
    </>
  )
}
