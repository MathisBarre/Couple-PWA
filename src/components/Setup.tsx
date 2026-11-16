import { useEffect, useRef, useState, type FormEvent } from 'react'
import { api, logout } from '../lib/api'
import { clearInvite, pendingInvite } from '../lib/invite'
import { Brand, CenterLayout } from './Auth'
import { Icon } from './icons'
import { Button, cx, inputClass } from './ui'

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
        <div className="animate-[pulse-soft_1.2s_ease-in-out_infinite]">
          <Brand compact />
        </div>
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
      <Brand compact />
      <div>
        <h2 className="text-[1.75rem] leading-tight font-extrabold tracking-[-0.035em]">Votre espace à deux</h2>
        <p className="mx-auto mt-2 max-w-[20rem] text-ink-2">L’un de vous crée l’espace, l’autre le rejoint avec le code affiché.</p>
      </div>
      <div className="card flex w-full flex-col gap-3 p-4 text-left">
        <div className="flex items-center gap-3.5">
          <span aria-hidden className="accent-fill grid size-10 shrink-0 place-items-center rounded-[0.8125rem]">
            <Icon name="plus" className="size-5.5" strokeWidth={2} />
          </span>
          <p className="text-[0.9375rem] leading-snug">
            <strong className="block">Vous êtes le ou la première</strong>
            <span className="text-ink-2">Créez l’espace, puis invitez votre partenaire.</span>
          </p>
        </div>
        <Button className="w-full" onClick={create}>
          Créer notre espace
        </Button>
      </div>
      <div className="flex w-full items-center gap-3 text-sm font-medium text-ink-2 before:h-px before:flex-1 before:bg-line after:h-px after:flex-1 after:bg-line">ou</div>
      <form onSubmit={join} className="card flex w-full flex-col gap-3 p-4 text-left">
        <div className="flex items-center gap-3.5">
          <span aria-hidden className="raised grid size-10 shrink-0 place-items-center rounded-[0.8125rem] text-ink">
            <Icon name="hearts" className="size-5.5" strokeWidth={1.9} />
          </span>
          <p className="text-[0.9375rem] leading-snug">
            <strong className="block">Votre partenaire a déjà créé l’espace</strong>
            <span className="text-ink-2">Saisissez le code qu’il ou elle vous a donné.</span>
          </p>
        </div>
        <input
          className={cx(inputClass, 'text-center font-mono text-lg tracking-[0.2em] uppercase placeholder:font-sans placeholder:text-base placeholder:tracking-normal placeholder:normal-case')}
          placeholder="Code de votre partenaire"
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
      {msg && <p className="text-sm font-medium text-[#c8323c] dark:text-[#ff8a8a]">{msg}</p>}
      <Button variant="link" className="!min-h-11 !self-center underline decoration-ink/25 underline-offset-4" onClick={() => logout().then(onDone)}>
        Se déconnecter
      </Button>
    </CenterLayout>
  )
}
