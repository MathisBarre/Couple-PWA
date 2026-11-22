import { useEffect, useRef, useState, type FormEvent } from 'react'
import { api, ApiError, logout } from '../lib/api'
import { clearInvite, pendingInvite } from '../lib/invite'
import { Brand, CenterLayout, FieldGroup, Logo } from './Auth'
import type { ModuleId } from '../modules'
import { ModulePicker } from './ModulePicker'
import { Button, ConfirmDialog, Notice } from './ui'

export function Setup({ onDone }: { onDone: () => void | Promise<void> }) {
  const [code, setCode] = useState(() => pendingInvite() ?? '')
  const [msg, setMsg] = useState('')
  const [joining, setJoining] = useState(() => Boolean(pendingInvite()))
  // Demande en cours : un seul envoi à la fois, le bouton concerné reste enfoncé.
  const [busy, setBusy] = useState<'create' | 'join' | 'logout' | null>(null)
  const [confirmLogout, setConfirmLogout] = useState(false)

  // Création : on choisit d'abord les espaces voulus (modifiable ensuite dans Réglages).
  const [choosing, setChoosing] = useState(false)
  const [modules, setModules] = useState<ModuleId[]>([])

  const run = async (payload: { action: 'create'; modules: ModuleId[] } | { action: 'join'; code: string }, fromLink = false) => {
    if (busy) return
    setBusy(payload.action)
    setMsg('')
    try {
      await api('couple', { method: 'POST', body: payload })
      clearInvite()
      await onDone()
    } catch (e) {
      const err = e as ApiError
      // Lien d'invitation refusé par le serveur (pas une simple coupure) : il ne sert plus, on le dit.
      const dead = fromLink && err.status >= 400 && err.status < 500
      if (dead) clearInvite()
      setMsg(dead ? `Ce lien d’invitation n’est plus valable (${err.message.toLowerCase()}). Demandez-en un nouveau à votre partenaire, ou saisissez son code ci-dessous.` : err.message)
      setJoining(false)
    }
    setBusy(null)
  }

  // Arrivé par un lien d'invitation : on rejoint l'espace sans rien demander.
  const auto = useRef(false)
  useEffect(() => {
    const invite = pendingInvite()
    if (!invite || auto.current) return
    auto.current = true
    run({ action: 'join', code: invite }, true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (joining)
    return (
      <CenterLayout>
        <Logo className="animate-[pulse-soft_1.2s_ease-in-out_infinite]" />
        <p role="status" className="font-medium text-ink-2">
          On rejoint votre espace à deux…
        </p>
      </CenterLayout>
    )
  if (choosing)
    return (
      <CenterLayout>
        <Brand compact />
        <div className="mt-1 w-full">
          <h2 className="sk-h2">Qu’est-ce que vous voulez suivre ?</h2>
          <p className="mt-1 text-[0.95rem] text-ink-2">Choisissez seulement ce qui vous sert. Vous pourrez en ajouter ou en retirer à tout moment dans Réglages.</p>
        </div>
        {msg && <Notice>{msg}</Notice>}
        <div className="w-full">
          <ModulePicker value={modules} onChange={setModules} disabled={busy != null} />
          {modules.includes('cycle') && (
            <p className="mt-2 px-1.5 text-left text-sm text-ink-2">Un ou plusieurs cycles (couple de femmes, sœurs…) : ça se règle ensuite dans l’espace Cycle.</p>
          )}
        </div>
        <Button className="w-full" onClick={() => run({ action: 'create', modules })} busy={busy === 'create'} disabled={busy != null || !modules.length}>
          {modules.length ? 'Créer notre espace' : 'Choisissez au moins un espace'}
        </Button>
        <Button variant="link" className="min-h-11 !self-center" disabled={busy != null} onClick={() => setChoosing(false)}>
          Retour
        </Button>
      </CenterLayout>
    )
  const create = () => {
    setMsg('')
    setChoosing(true)
  }
  const join = (e: FormEvent) => {
    e.preventDefault()
    run({ action: 'join', code: code.trim() })
  }

  return (
    <CenterLayout>
      <Brand compact />
      <div className="mt-1 w-full">
        <h2 className="sk-h2">Votre espace à deux</h2>
        <p className="mt-1 text-[0.95rem] text-ink-2">L’un de vous crée l’espace, l’autre le rejoint avec le code affiché.</p>
      </div>
      {msg && <Notice>{msg}</Notice>}
      <Button className="w-full" onClick={create} busy={busy === 'create'} disabled={busy != null}>
        Créer notre espace
      </Button>
      <div className="sk-or w-full text-sm text-ink-2">ou</div>
      <form onSubmit={join} className="flex w-full flex-col gap-3">
        <FieldGroup>
          <input
            className="sk-field text-center font-mono tracking-[0.12em] uppercase placeholder:font-sans placeholder:tracking-normal placeholder:normal-case"
            placeholder="Code de votre partenaire"
            aria-label="Code de votre partenaire"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            autoCapitalize="characters"
            autoComplete="off"
            maxLength={24}
            required
          />
        </FieldGroup>
        <Button type="submit" variant="secondary" busy={busy === 'join'} disabled={busy != null}>
          Rejoindre
        </Button>
      </form>
      <Button
        variant="link"
        className="min-h-11 !self-center"
        disabled={busy != null}
        onClick={() => setConfirmLogout(true)}
      >
        Se déconnecter
      </Button>
      <ConfirmDialog
        open={confirmLogout}
        onClose={() => setConfirmLogout(false)}
        title="Se déconnecter ?"
        confirm="Se déconnecter"
        busy={busy === 'logout'}
        onConfirm={() => {
          setBusy('logout')
          logout()
            .then(onDone)
            .catch((e: Error) => {
              setConfirmLogout(false)
              setMsg(e.message)
            })
            .finally(() => setBusy(null))
        }}
      >
        Il faudra votre e-mail et votre mot de passe pour revenir sur ce téléphone.
      </ConfirmDialog>
    </CenterLayout>
  )
}
