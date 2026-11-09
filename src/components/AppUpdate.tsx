import { useState } from 'react'
import { appVersion, forceUpdate } from '../lib/update'
import { Button, Card, SectionTitle } from './ui'

const builtAt = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(appVersion.builtAt))

export function AppUpdate() {
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  return (
    <Card>
      <SectionTitle>Application</SectionTitle>
      <p className="text-sm text-ink-2">
        Version du {builtAt}
        {appVersion.commit && <span className="font-mono"> · {appVersion.commit}</span>}. Les mises à jour s’installent toutes seules.
      </p>
      <Button
        variant="link"
        disabled={busy}
        onClick={() => {
          setBusy(true)
          setMsg('')
          forceUpdate().catch((e: Error) => {
            setMsg(e.message)
            setBusy(false)
          })
        }}
      >
        {busy ? 'Mise à jour…' : 'Forcer la mise à jour'}
      </Button>
      {msg && <p className="mt-2 text-sm text-accent">{msg}</p>}
    </Card>
  )
}
