import { useState, type FormEvent, type ReactNode } from 'react'
import { api } from '../lib/api'
import { formatLong, localToday } from '../lib/dates'
import { pendingInvite } from '../lib/invite'
import { MODULES } from '../modules'
import { Icon } from './icons'
import { Button, inputClass, SectionTitle } from './ui'

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII']

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
    <CoverLayout>
      <Masthead />
      {invited ? (
        <div className="border-2 border-ink px-3.5 pt-2.5 pb-3">
          <div className="etiquette mb-1.5">Invitation</div>
          <p className="text-[1.1rem] leading-snug">
            Vous avez été invité·e à rejoindre un espace à deux. Créez votre compte (ou connectez-vous) : vous le rejoindrez automatiquement.
          </p>
        </div>
      ) : (
        <Contents />
      )}
      <section className="border-t-2 border-ink pt-3">
        <SectionTitle>{mode === 'login' ? 'Se connecter' : 'Créer un compte'}</SectionTitle>
        <form onSubmit={submit} className="flex w-full flex-col">
          {mode === 'signup' && <input className={inputClass} placeholder="Prénom" aria-label="Prénom" value={name} onChange={(e) => setName(e.target.value)} required />}
          <input
            className={inputClass + (mode === 'signup' ? ' border-t-0' : '')}
            type="email"
            placeholder="E-mail"
            aria-label="E-mail"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <input
            className={inputClass + ' border-t-0'}
            type="password"
            placeholder="Mot de passe"
            aria-label="Mot de passe"
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            minLength={mode === 'signup' ? 8 : undefined}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          <Button type="submit" disabled={busy} className="mt-3">
            {mode === 'login' ? 'Se connecter' : 'Créer le compte'}
          </Button>
        </form>
        {msg && <p className="mt-2 text-sm font-medium italic">{msg}</p>}
        <Button variant="link" className="mt-1" onClick={() => setMode(mode === 'login' ? 'signup' : 'login')}>
          {mode === 'login' ? 'Pas encore de compte ? Créer un compte' : 'Déjà un compte ? Se connecter'}
        </Button>
      </section>
    </CoverLayout>
  )
}

/** Têtière de couverture : la date du jour entre deux filets, puis le titre de l'almanach en très grand. */
export function Masthead({ compact }: { compact?: boolean }) {
  return (
    <header>
      <div className="etiquette flex items-center justify-between border-y border-ink py-2">
        <span>{formatLong(localToday())}</span>
        <Icon name="rings" className="h-4 w-6" />
      </div>
      <div className={compact ? 'pt-4 text-[2.75rem] leading-none font-light tracking-[-0.03em]' : 'pt-5 text-[6.25rem] leading-[0.85] font-light tracking-[-0.05em]'}>
        À deux
      </div>
      {!compact && <p className="mt-4 text-[1.3rem] leading-snug italic">Notre app de couple, rien qu’à nous deux : cycle, courses et plus.</p>}
    </header>
  )
}

/** Sommaire de couverture : les espaces de l'app, chacun annoncé par un chiffre romain à son encre. */
function Contents() {
  return (
    <ol className="border-t border-ink">
      {MODULES.map((m, i) => (
        <li key={m.id} className="flex items-center gap-3.5 border-b border-line py-2.5">
          <span data-theme={m.theme} aria-hidden className="w-9 shrink-0 text-[2rem] leading-none font-light text-accent italic">
            {ROMAN[i]}
          </span>
          <span className="min-w-0">
            <span className="block text-[1.2rem] leading-tight font-medium">{m.label}</span>
            <span className="block text-sm text-ink-2 italic">{m.description}</span>
          </span>
        </li>
      ))}
      <li className="flex items-center gap-3.5 py-2.5 text-ink-2">
        <span aria-hidden className="w-9 shrink-0 text-[2rem] leading-none font-light italic">
          …
        </span>
        <span className="text-sm italic">Et d’autres espaces à venir.</span>
      </li>
    </ol>
  )
}

/** Page de couverture (connexion, création de l'espace) : une colonne de texte, alignée à gauche. */
export function CoverLayout({ children }: { children: ReactNode }) {
  return (
    <div className="rubriques mx-auto flex min-h-dvh max-w-md flex-col gap-6 px-4 pt-[calc(env(safe-area-inset-top)+20px)] pb-[calc(env(safe-area-inset-bottom)+20px)]">
      {children}
    </div>
  )
}

export function CenterLayout({ children }: { children: ReactNode }) {
  return <div className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-3 px-4 py-6 text-center">{children}</div>
}
