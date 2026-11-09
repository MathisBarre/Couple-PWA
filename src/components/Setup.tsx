import { useEffect, useRef, useState, type FormEvent } from 'react'
import { api, logout } from '../lib/api'
import { clearInvite, pendingInvite } from '../lib/invite'
import { CenterLayout } from './Auth'
import { Button, inputClass } from './ui'

export function Setup({ onDone }: { onDone: () => void }) {
  const [code, setCode] = useState(() => pendingInvite() ?? '')
  const [msg, setMsg] = useState('')
  const [joining, setJoining] = useState(() => Boolean(pendingInvite()))

  const run = async (payload: object) => {
    try {
      await api('couple', { method: 'POST', body: payload })
      clearInvite()
      onDone()
    } catch (e) {
      setMsg((e as Error).message)
      setJoining(false)
    }
  }

  // Arrivé par un lien d'invitation : on rejoint l'espace sans rien demander.
  const auto = useRef(false)
  useEffect(() => {
    const invite = pendingInvite()
    if (!invite || auto.current) return
    auto.current = true
    run({ action: 'join', code: invite })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (joining)
    return (
      <CenterLayout>
        <img src="/logo.svg" alt="" className="size-24 animate-[pulse-soft_1.2s_ease-in-out_infinite]" />
        <p className="text-ink-2">On rejoint votre espace à deux…</p>
      </CenterLayout>
    )
  const create = () => run({ action: 'create' })
  const join = (e: FormEvent) => {
    e.preventDefault()
    run({ action: 'join', code })
  }

  return (
    <CenterLayout>
      <h1 className="text-2xl font-bold">Votre espace à deux</h1>
      <p className="text-ink-2">L’un de vous crée l’espace, l’autre le rejoint avec le code affiché.</p>
      <Button className="w-full" onClick={create}>
        Créer notre espace
      </Button>
      <div className="text-sm text-ink-2">ou</div>
      <form onSubmit={join} className="flex w-full flex-col gap-2.5">
        <input className={inputClass} placeholder="Code de votre partenaire" value={code} onChange={(e) => setCode(e.target.value)} required />
        <Button type="submit" variant="secondary">
          Rejoindre
        </Button>
      </form>
      {msg && <p className="text-sm text-accent">{msg}</p>}
      <Button variant="link" className="self-center" onClick={() => logout().then(onDone)}>
        Se déconnecter
      </Button>
    </CenterLayout>
  )
}
