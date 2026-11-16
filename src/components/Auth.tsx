import { useState, type FormEvent, type ReactNode } from 'react'
import { api } from '../lib/api'
import { pendingInvite } from '../lib/invite'
import { MODULES } from '../modules'
import { Glyph } from './icons'
import { Button, cx } from './ui'

export function Auth({ onDone }: { onDone: () => void }) {
  const invited = pendingInvite()
  // Arrivé par un lien d'invitation : le plus probable est de créer son compte.
  const [mode, setMode] = useState<'login' | 'signup'>(invited ? 'signup' : 'login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setMsg('')
    try {
      await api('auth', { method: 'POST', body: { action: mode, email, password, name } })
      onDone()
    } catch (err) {
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
      <form onSubmit={submit} className="flex w-full flex-col gap-3.5">
        <FieldGroup>
          {mode === 'signup' && <input className="sk-field" placeholder="Prénom" value={name} onChange={(e) => setName(e.target.value)} required />}
          <input className="sk-field" type="email" placeholder="E-mail" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <input
            className="sk-field"
            type="password"
            placeholder="Mot de passe"
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            minLength={mode === 'signup' ? 8 : undefined}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </FieldGroup>
        <Button type="submit" disabled={busy}>
          {mode === 'login' ? 'Se connecter' : 'Créer le compte'}
        </Button>
      </form>
      {msg && <p className="text-sm font-medium text-accent">{msg}</p>}
      <Button variant="link" className="min-h-11 !self-center" onClick={() => setMode(mode === 'login' ? 'signup' : 'login')}>
        {mode === 'login' ? 'Pas encore de compte ? Créer un compte' : 'Déjà un compte ? Se connecter'}
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
