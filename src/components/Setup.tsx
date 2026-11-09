import { useState, type FormEvent } from 'react'
import { supabase, type Couple } from '../lib/supabase'
import { CenterLayout } from './Auth'
import { Button, inputClass } from './ui'

export function Setup({ onDone }: { onDone: (c: Couple) => void }) {
  const [code, setCode] = useState('')
  const [msg, setMsg] = useState('')

  const create = async () => {
    const { data, error } = await supabase.rpc('create_couple')
    if (error) setMsg(error.message)
    else onDone(data as Couple)
  }
  const join = async (e: FormEvent) => {
    e.preventDefault()
    const { data, error } = await supabase.rpc('join_couple', { code })
    if (error) setMsg(error.message)
    else onDone(data as Couple)
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
      <Button variant="link" className="self-center" onClick={() => supabase.auth.signOut()}>
        Se déconnecter
      </Button>
    </CenterLayout>
  )
}
