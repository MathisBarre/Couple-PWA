import { useEffect, useState } from 'react'
import { fetchNotificationPrefs, setNotificationPref, type NotificationPrefs } from '../lib/push'
import { Card, SectionTitle, Switch } from './ui'

type Kind = keyof NotificationPrefs

/**
 * Notifications propres à un espace, à placer dans son onglet Réglages.
 * Le choix vaut pour tous mes appareils ; l'activation sur ce téléphone se fait
 * dans les réglages globaux (barre du bas).
 */
export function NotificationSwitches({ items, children }: { items: { kind: Kind; label: string }[]; children?: React.ReactNode }) {
  const [prefs, setPrefs] = useState<NotificationPrefs | null>(null)
  const [msg, setMsg] = useState('')

  useEffect(() => {
    fetchNotificationPrefs().then(setPrefs, () => setMsg('Hors ligne : réglages indisponibles pour le moment.'))
  }, [])

  const toggle = (kind: Kind, enabled: boolean) => {
    setMsg('')
    setPrefs((p) => p && { ...p, [kind]: enabled })
    setNotificationPref(kind, enabled).then(setPrefs, (e: Error) => {
      setPrefs((p) => p && { ...p, [kind]: !enabled })
      setMsg(e.message)
    })
  }

  return (
    <Card>
      <SectionTitle>Notifications</SectionTitle>
      {prefs && items.map((i) => <Switch key={i.kind} label={i.label} checked={prefs[i.kind]} onChange={(v) => toggle(i.kind, v)} />)}
      {children}
      <p className="mt-2 text-sm text-ink-2">
        Pour les recevoir sur ce téléphone, activez les notifications dans l’onglet Réglages en bas. Vous n’êtes jamais prévenu de vos propres
        saisies.
      </p>
      {msg && <p className="mt-2 text-sm text-accent">{msg}</p>}
    </Card>
  )
}
