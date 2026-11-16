import { useState, type FormEvent } from 'react'
import { api } from '../lib/api'
import { pendingInvite } from '../lib/invite'
import { MODULES } from '../modules'
import { Icon } from './icons'
import { Button, cx, inputClass } from './ui'

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
      <Brand small={Boolean(invited)} />
      {invited && (
        <div className="card flex w-full items-start gap-3.5 p-4 text-left">
          <span aria-hidden className="accent-fill grid size-10 shrink-0 place-items-center rounded-[0.8125rem]">
            <Icon name="hearts" className="size-5.5" strokeWidth={1.9} />
          </span>
          <p className="text-[0.9375rem] leading-snug">
            <strong className="block">Vous avez été invité·e à rejoindre un espace à deux.</strong>
            <span className="text-ink-2">Créez votre compte (ou connectez-vous) : vous le rejoindrez automatiquement.</span>
          </p>
        </div>
      )}
      <form onSubmit={submit} className="card flex w-full flex-col gap-3 p-4 text-left">
        <h2 className="text-[1.375rem] leading-tight font-bold tracking-[-0.03em]">{mode === 'login' ? 'Se connecter' : 'Créer un compte'}</h2>
        {mode === 'signup' && (
          <input aria-label="Prénom" className={inputClass} placeholder="Prénom" autoComplete="given-name" value={name} onChange={(e) => setName(e.target.value)} required />
        )}
        <input aria-label="E-mail" className={inputClass} type="email" placeholder="E-mail" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <input
          aria-label="Mot de passe"
          className={inputClass}
          type="password"
          placeholder={mode === 'signup' ? 'Mot de passe (8 caractères minimum)' : 'Mot de passe'}
          autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
          minLength={mode === 'signup' ? 8 : undefined}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        {msg && <p className="text-sm font-medium text-[#c8323c] dark:text-[#ff8a8a]">{msg}</p>}
        <Button type="submit" disabled={busy} className="mt-1">
          {mode === 'login' ? 'Se connecter' : 'Créer le compte'}
        </Button>
      </form>
      <Button variant="link" className="!min-h-11 !self-center underline decoration-ink/25 underline-offset-4" onClick={() => setMode(mode === 'login' ? 'signup' : 'login')}>
        {mode === 'login' ? 'Pas encore de compte ? Créer un compte' : 'Déjà un compte ? Se connecter'}
      </Button>
    </CenterLayout>
  )
}

/**
 * L'app, présentée avant la connexion : le logo dans un halo aux couleurs des espaces, le nom,
 * une phrase, et les espaces qu'on y trouve (ceux de src/modules.ts).
 */
export function Brand({ compact, small = compact }: { compact?: boolean; small?: boolean }) {
  return (
    <div className="flex flex-col items-center">
      <div className="relative">
        <div aria-hidden className="brand-halo absolute -inset-16" />
        <img
          src="/logo.svg"
          alt=""
          className={cx('relative rounded-[22%] shadow-[0_1px_2px_rgb(0_0_0/0.2),0_12px_28px_-8px_rgb(0_0_0/0.45)]', small ? 'size-16' : 'size-20')}
        />
      </div>
      <h1 className={cx('relative mt-4 leading-none font-extrabold tracking-[-0.045em]', small ? 'text-[2rem]' : 'text-[2.5rem]')}>À deux</h1>
      {!compact && (
        <>
          <p className="relative mt-2.5 text-[1.0625rem] text-ink-2">Notre app de couple, rien qu’à nous deux.</p>
          <ul className="relative mt-4 flex flex-wrap justify-center gap-2" aria-label="Les espaces de l’app">
            {MODULES.map((m) => (
              <li key={m.id} data-theme={m.theme} className="raised flex items-center gap-1.5 rounded-full py-1.5 pr-3 pl-2 text-sm font-semibold text-ink">
                <Icon name={m.icon} className="size-4.5 text-accent" strokeWidth={2} />
                {m.label}
              </li>
            ))}
            <li className="flex items-center gap-1 rounded-full border border-dashed border-ink-2/40 py-1.5 pr-3 pl-2 text-sm font-medium text-ink-2">
              <Icon name="plus" className="size-4" strokeWidth={2} />
              à venir
            </li>
          </ul>
        </>
      )}
    </div>
  )
}

export function CenterLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-5 overflow-x-hidden px-4 pt-[calc(env(safe-area-inset-top)+24px)] pb-[calc(env(safe-area-inset-bottom)+24px)] text-center">
      {children}
    </div>
  )
}
