import { useState } from 'react'
import { copyInvite, inviteUrl, shareInvite } from '../lib/invite'
import { Button } from './ui'

/** Invitation du ou de la partenaire : lien « quick join » à partager ou copier, et le code en secours. */
export function InviteLink({ code, from }: { code: string; from: string }) {
  const [msg, setMsg] = useState('')
  const canShare = typeof navigator.share === 'function'

  const done = (r: 'shared' | 'copied' | 'cancelled') => r === 'copied' && setMsg('Lien copié. Collez-le dans un message.')
  const fail = () => setMsg('Impossible de copier : sélectionnez le lien ci-dessus.')

  return (
    <div className="flex flex-col gap-2.5 py-2">
      <p>Invitez votre partenaire : en ouvrant ce lien, son compte rejoint directement votre espace.</p>
      <p className="truncate rounded-xl bg-surface-2 px-3 py-2.5 font-mono text-sm text-ink-2 select-all">{inviteUrl(code)}</p>
      <div className="grid grid-cols-2 gap-2">
        {canShare && (
          <Button onClick={() => shareInvite(code, from).then(done, fail)} className="py-2.5">
            Partager
          </Button>
        )}
        <Button
          variant={canShare ? 'secondary' : 'primary'}
          className={canShare ? 'py-2.5' : 'col-span-2 py-2.5'}
          onClick={() => copyInvite(code).then(() => done('copied'), fail)}
        >
          Copier le lien
        </Button>
      </div>
      <p className="text-sm text-ink-2">
        Ou le code à saisir à la main : <strong className="font-mono tracking-[0.15em] text-accent select-all">{code}</strong>
      </p>
      {msg && <p className="text-sm text-accent">{msg}</p>}
    </div>
  )
}
