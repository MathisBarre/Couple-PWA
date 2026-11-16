import { useEffect, useRef, useState, type FormEvent } from 'react'
import { api, logout } from '../lib/api'
import { clearInvite, pendingInvite } from '../lib/invite'
import { CenterLayout, CoverLayout, Masthead } from './Auth'
import { Icon } from './icons'
import { Button, inputClass, SectionTitle } from './ui'

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
        <Icon name="rings" className="size-20 animate-[pulse-soft_1.2s_ease-in-out_infinite]" strokeWidth={0.75} />
        <p className="text-[1.15rem] text-ink-2 italic">On rejoint votre espace à deux…</p>
      </CenterLayout>
    )
  const create = () => run({ action: 'create' })
  const join = (e: FormEvent) => {
    e.preventDefault()
    run({ action: 'join', code })
  }

  return (
    <CoverLayout>
      <Masthead compact />
      <div className="border-t-2 border-ink pt-4">
        <h1 className="text-[3.25rem] leading-[0.92] tracking-[-0.025em] text-balance">Votre espace à deux</h1>
        <p className="mt-4 text-[1.3rem] leading-snug italic">L’un de vous crée l’espace, l’autre le rejoint avec le code affiché.</p>
      </div>
      <section className="border-t border-ink pt-3">
        <SectionTitle>Créer</SectionTitle>
        <Button className="w-full" onClick={create}>
          Créer notre espace
        </Button>
      </section>
      <div className="-my-2 flex items-center gap-3 text-ink-2 italic">
        <span className="h-px flex-1 bg-line" />
        ou
        <span className="h-px flex-1 bg-line" />
      </div>
      <section className="border-t border-ink pt-3">
        <SectionTitle>Rejoindre</SectionTitle>
        <form onSubmit={join} className="flex w-full flex-col gap-3">
          <input
            className={inputClass + ' font-mono tracking-[0.12em] placeholder:font-serif placeholder:tracking-normal'}
            placeholder="Code de votre partenaire"
            aria-label="Code de votre partenaire"
            autoCapitalize="characters"
            autoComplete="off"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            required
          />
          <Button type="submit" variant="secondary">
            Rejoindre
          </Button>
        </form>
        {msg && <p className="mt-2 text-sm font-medium italic">{msg}</p>}
      </section>
      <Button variant="link" className="mt-auto !text-ink-2" onClick={() => logout().then(onDone)}>
        Se déconnecter
      </Button>
    </CoverLayout>
  )
}
