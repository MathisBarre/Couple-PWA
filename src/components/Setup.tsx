import { useState } from 'react'
import { supabase, type Couple } from '../lib/supabase'

export function Setup({ onDone }: { onDone: (c: Couple) => void }) {
  const [code, setCode] = useState('')
  const [msg, setMsg] = useState('')

  const create = async () => {
    const { data, error } = await supabase.rpc('create_couple')
    if (error) setMsg(error.message)
    else onDone(data as Couple)
  }
  const join = async (e: React.FormEvent) => {
    e.preventDefault()
    const { data, error } = await supabase.rpc('join_couple', { code })
    if (error) setMsg(error.message)
    else onDone(data as Couple)
  }

  return (
    <div className="center">
      <h1>Votre espace à deux</h1>
      <p className="muted">L’un de vous crée l’espace, l’autre le rejoint avec le code affiché.</p>
      <button className="primary wide" onClick={create}>
        Créer notre espace
      </button>
      <div className="or">ou</div>
      <form onSubmit={join} className="form">
        <input placeholder="Code de votre partenaire" value={code} onChange={(e) => setCode(e.target.value)} required />
        <button className="secondary">Rejoindre</button>
      </form>
      {msg && <p className="small accent">{msg}</p>}
      <button className="link" onClick={() => supabase.auth.signOut()}>
        Se déconnecter
      </button>
    </div>
  )
}
