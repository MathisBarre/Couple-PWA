import { useState, type FormEvent } from 'react'
import { api } from '../lib/api'
import { Button, inputClass } from './ui'

export function Auth({ onDone }: { onDone: () => void }) {
  const [mode, setMode] = useState<'login' | 'signup'>('login')
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
      <img src="/logo.svg" alt="" className="size-24" />
      <h1 className="text-2xl font-bold">Cycle à deux</h1>
      <form onSubmit={submit} className="flex w-full flex-col gap-2.5">
        {mode === 'signup' && <input className={inputClass} placeholder="Prénom" value={name} onChange={(e) => setName(e.target.value)} required />}
        <input className={inputClass} type="email" placeholder="E-mail" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <input
          className={inputClass}
          type="password"
          placeholder="Mot de passe"
          autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
          minLength={mode === 'signup' ? 8 : undefined}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        <Button type="submit" disabled={busy}>
          {mode === 'login' ? 'Se connecter' : 'Créer le compte'}
        </Button>
      </form>
      {msg && <p className="text-sm text-accent">{msg}</p>}
      <Button variant="link" className="self-center" onClick={() => setMode(mode === 'login' ? 'signup' : 'login')}>
        {mode === 'login' ? 'Pas encore de compte ? Créer un compte' : 'Déjà un compte ? Se connecter'}
      </Button>
    </CenterLayout>
  )
}

export function CenterLayout({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-3 px-4 py-6 text-center">{children}</div>
}
