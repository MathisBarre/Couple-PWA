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
    <div className="flex flex-col gap-3 py-2">
      <p className="text-[1.15rem] leading-snug">Invitez votre partenaire : en ouvrant ce lien, son compte rejoint directement votre espace.</p>
      {/* Le lien comme un coupon à détacher : cadre en pointillé, caractères de machine. */}
      <p className="truncate border border-dashed border-ink px-3 py-3 font-mono text-sm select-all">{inviteUrl(code)}</p>
      <div className="grid grid-cols-2 gap-2.5">
        {canShare && <Button onClick={() => shareInvite(code, from).then(done, fail)}>Partager</Button>}
        <Button variant={canShare ? 'secondary' : 'primary'} className={canShare ? '' : 'col-span-2'} onClick={() => copyInvite(code).then(() => done('copied'), fail)}>
          Copier le lien
        </Button>
      </div>
      <p className="flex items-baseline gap-2 text-sm text-ink-2 italic">
        <span>Ou le code à saisir à la main :</span>
        <span aria-hidden className="conduite" />
        <strong className="font-mono text-[1.15rem] font-medium tracking-[0.18em] text-ink not-italic select-all">{code}</strong>
      </p>
      {msg && <p className="text-sm font-medium italic">{msg}</p>}
    </div>
  )
}
