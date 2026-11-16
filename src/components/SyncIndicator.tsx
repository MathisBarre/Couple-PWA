import { useEffect, useState } from 'react'
import { cx } from './ui'

function useOnline() {
  const [online, setOnline] = useState(() => navigator.onLine)
  useEffect(() => {
    const on = () => setOnline(true)
    const off = () => setOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => {
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
    }
  }, [])
  return online
}

/**
 * Pastille flottante (ne décale rien) : visible seulement hors ligne, ou si des
 * modifications restent en attente plus d'une seconde et demie. Une saisie
 * normale, envoyée tout de suite, ne fait donc rien clignoter.
 */
export function SyncIndicator({ pending }: { pending: number }) {
  const online = useOnline()
  const [slow, setSlow] = useState(false)

  const hasPending = pending > 0
  useEffect(() => {
    if (!hasPending) return
    const t = setTimeout(() => setSlow(true), 1500)
    return () => {
      clearTimeout(t)
      setSlow(false)
    }
  }, [hasPending])

  const visible = !online || (hasPending && slow)
  const label = !online
    ? pending > 0
      ? `Hors ligne · ${pending} en attente`
      : 'Hors ligne'
    : `Synchronisation… (${pending})`

  return (
    <div
      role="status"
      aria-live="polite"
      className={cx(
        'pointer-events-none fixed bottom-[calc(env(safe-area-inset-bottom)+92px)] left-1/2 z-50 -translate-x-1/2 transition-[opacity,translate] duration-300 motion-reduce:transition-none',
        visible ? 'translate-y-0 opacity-100' : 'translate-y-2 opacity-0',
      )}
    >
      {visible && (
        <span className="inline-flex items-center gap-1.5 rounded-full bg-soon px-3 py-1.5 text-xs font-semibold text-on-soon shadow-[0_0_0_1px_rgb(0_0_0/0.05),0_6px_16px_-4px_rgb(0_0_0/0.25)]">
          <span aria-hidden className={cx('size-1.5 rounded-full bg-current', online && 'animate-pulse')} />
          {label}
        </span>
      )}
    </div>
  )
}
