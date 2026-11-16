import { useEffect, useRef, useState, type FormEvent } from 'react'
import { api, logout } from '../lib/api'
import { clearInvite, pendingInvite } from '../lib/invite'
import { Brand, CenterLayout, FieldGroup, Logo } from './Auth'
import { Button } from './ui'

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
        <Logo className="animate-[pulse-soft_1.2s_ease-in-out_infinite]" />
        <p className="sk-engrave font-medium text-ink-2">On rejoint votre espace à deux…</p>
      </CenterLayout>
    )
  const create = () => run({ action: 'create' })
  const join = (e: FormEvent) => {
    e.preventDefault()
    run({ action: 'join', code })
  }

  return (
    <CenterLayout>
      <Brand compact />
      <div className="mt-1 w-full">
        <h2 className="sk-section-title text-center !text-[1.15rem]">Votre espace à deux</h2>
        <p className="sk-engrave text-[0.95rem] text-ink-2">L’un de vous crée l’espace, l’autre le rejoint avec le code affiché.</p>
      </div>
      <Button className="w-full" onClick={create}>
        Créer notre espace
      </Button>
      <div className="sk-or w-full text-sm font-bold text-ink-2">ou</div>
      <form onSubmit={join} className="flex w-full flex-col gap-3">
        <FieldGroup>
          <input
            className="sk-field text-center font-mono tracking-[0.12em] uppercase placeholder:font-sans placeholder:tracking-normal placeholder:normal-case"
            placeholder="Code de votre partenaire"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            autoCapitalize="characters"
            autoComplete="off"
            required
          />
        </FieldGroup>
        <Button type="submit" variant="secondary">
          Rejoindre
        </Button>
      </form>
      {msg && <p className="text-sm font-medium text-accent">{msg}</p>}
      <Button variant="link" className="min-h-11 !self-center" onClick={() => logout().then(onDone)}>
        Se déconnecter
      </Button>
    </CenterLayout>
  )
}
