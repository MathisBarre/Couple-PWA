import { useState, type FormEvent, type ReactNode } from 'react'
import { api } from '../lib/api'
import { pendingInvite } from '../lib/invite'
import { MODULES } from '../modules'
import { Glyph } from './icons'
import { Button, cx, Notice, PasswordInput } from './ui'

export function Auth({ onDone, notice }: { onDone: () => void | Promise<void>; notice?: string }) {
  const invited = pendingInvite()
  // Arrivé par un lien d'invitation : le plus probable est de créer son compte.
  // 'reset' : mot de passe réinitialisé par l'autre membre, on en choisit un nouveau.
  const [mode, setMode] = useState<'login' | 'signup' | 'reset'>(invited ? 'signup' : 'login')
  const [resetBy, setResetBy] = useState<string | null>(null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    // Pas de double envoi (touche Entrée répétée, double appui).
    if (busy) return
    setBusy(true)
    setMsg('')
    try {
      const res = await api<{ reset?: boolean; by?: string | null }>('auth', {
        method: 'POST',
        body: { action: mode === 'reset' ? 'set_password' : mode, email, password, name },
      })
      if (res.reset) {
        // L'ancien mot de passe ne compte plus : on demande le nouveau, l'e-mail reste.
        setResetBy(res.by ?? null)
        setPassword('')
        setMode('reset')
        setBusy(false)
        return
      }
      // Le bouton reste « en cours » jusqu'à l'arrivée dans l'app.
      await onDone()
    } catch (err) {
      // La saisie reste en place : on corrige et on renvoie.
      setMsg((err as Error).message)
    }
    setBusy(false)
  }

  return (
    <CenterLayout>
      <Brand compact={Boolean(invited)} />
      {invited && (
        <div className="sk-invite-card w-full">
          <p className="sk-section-title mb-1">Invitation</p>
          <p className="text-[0.95rem] leading-snug">
            Vous avez été invité·e à rejoindre un espace à deux. Créez votre compte (ou connectez-vous) : vous le rejoindrez automatiquement.
          </p>
        </div>
      )}
      {mode === 'reset' ? (
        <div className="sk-invite-card w-full">
          <p className="sk-section-title mb-1">Nouveau mot de passe</p>
          <p className="text-[0.95rem] leading-snug">
            {resetBy ? `${resetBy} a réinitialisé votre mot de passe.` : 'Votre mot de passe a été réinitialisé.'} Choisissez-en un nouveau pour retrouver votre espace :
            rien de ce que vous aviez noté n’est perdu.
          </p>
        </div>
      ) : (
        notice && !msg && <Notice>{notice}</Notice>
      )}
      <form onSubmit={submit} className="flex w-full flex-col gap-3.5">
        <FieldGroup>
          {mode === 'signup' && <input className="sk-field" placeholder="Prénom" autoComplete="given-name" maxLength={40} value={name} onChange={(e) => setName(e.target.value)} required />}
          {mode === 'reset' ? (
            // Gardé pour le trousseau du téléphone, qui associe le nouveau mot de passe au bon compte.
            <input className="sk-field text-ink-2" type="email" autoComplete="username" value={email} readOnly aria-label="E-mail" />
          ) : (
            <input className="sk-field" type="email" placeholder="E-mail" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          )}
          <PasswordInput
            className="sk-field"
            placeholder={mode === 'reset' ? 'Nouveau mot de passe' : 'Mot de passe'}
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            minLength={mode === 'login' ? undefined : 8}
            autoFocus={mode === 'reset'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            // Connexion : vide accepté, pour qui vient d'être réinitialisé (le serveur le redemande sinon).
            required={mode !== 'login'}
          />
        </FieldGroup>
        {mode !== 'login' && <p className="-mt-1.5 px-1 text-left text-xs text-ink-2">Mot de passe : 8 caractères minimum.</p>}
        {msg && <Notice>{msg}</Notice>}
        <Button type="submit" busy={busy}>
          {mode === 'login' ? 'Se connecter' : mode === 'signup' ? 'Créer le compte' : 'Enregistrer et me connecter'}
        </Button>
      </form>
      <Button
        variant="link"
        className="min-h-11 !self-center"
        disabled={busy}
        onClick={() => {
          setMsg('')
          setPassword('')
          setMode(mode === 'signup' ? 'login' : mode === 'reset' ? 'login' : 'signup')
        }}
      >
        {mode === 'login' ? 'Pas encore de compte ? Créer un compte' : mode === 'signup' ? 'Déjà un compte ? Se connecter' : 'Ce n’est pas mon compte'}
      </Button>
    </CenterLayout>
  )
}

/** Écrans hors de l'app (connexion, création de l'espace) : centrés, en thème neutre. */
export function CenterLayout({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-5 px-6 pt-[calc(env(safe-area-inset-top)+1.75rem)] pb-[calc(env(safe-area-inset-bottom)+1.5rem)] text-center">
      {children}
    </div>
  )
}

/** Le logo, posé comme un objet : coins arrondis, ombre portée douce. */
export function Logo({ className, size = 'size-24' }: { className?: string; size?: string }) {
  return (
    <div className={cx('sk-logo', size, className)}>
      <img src="/logo.svg" alt="" className="size-full" />
    </div>
  )
}

/**
 * L'identité de l'app : « À deux », une app de couple avec plusieurs espaces (et d'autres à venir),
 * rangés côte à côte dans un plumier.
 */
export function Brand({ compact }: { compact?: boolean }) {
  return (
    <div className="flex w-full flex-col items-center gap-5">
      <Logo size={compact ? 'size-16' : 'size-22'} />
      <div>
        <h1 className="sk-wordmark">À deux</h1>
        <p className="mt-2 text-[1.02rem] text-ink-2">Notre app de couple, rien qu’à nous deux.</p>
      </div>
      <ul aria-label="Les espaces de l’app" className="sk-tray">
        {MODULES.map((m) => (
          <li key={m.id} data-theme={m.theme}>
            <span aria-hidden className="sk-app-icon size-11">
              <Glyph icon={m.icon} className="size-6" />
            </span>
            <span className="text-ink-2">{m.label}</span>
          </li>
        ))}
        <li>
          <span aria-hidden className="sk-app-icon sk-app-icon-soon size-11">
            <span className="text-xl leading-none">+</span>
          </span>
          Et plus…
        </li>
      </ul>
    </div>
  )
}

/** Champs empilés dans un même panneau. */
export function FieldGroup({ children }: { children: ReactNode }) {
  return <div className="sk-card sk-fields w-full overflow-hidden text-left">{children}</div>
}
