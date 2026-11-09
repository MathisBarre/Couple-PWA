// Données du couple : lecture via l’API avec cache local (consultation
// hors ligne) et file d'attente des saisies faites sans réseau.
import { useCallback, useEffect, useState } from 'react'
import type { DayLog } from '../../shared/cycles'
import { api } from './api'

const cacheKey = (coupleId: string) => `logs:${coupleId}`
const queueKey = (coupleId: string) => `queue:${coupleId}`

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}
function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* stockage plein ou indisponible */
  }
}

type Row = DayLog

async function flushQueue(coupleId: string) {
  const queue = read<Row[]>(queueKey(coupleId), [])
  if (!queue.length || !navigator.onLine) return
  try {
    await api('logs', { method: 'PUT', body: queue })
    // Ne retire que ce qui a été envoyé (une saisie a pu arriver entre-temps).
    const sent = new Map(queue.map((q) => [q.day, q.updated_at]))
    write(queueKey(coupleId), read<Row[]>(queueKey(coupleId), []).filter((q) => sent.get(q.day) !== q.updated_at))
  } catch {
    /* hors ligne ou erreur serveur : on réessaiera */
  }
}

export function useDayLogs(coupleId: string, userId: string) {
  const [logs, setLogs] = useState<DayLog[]>(() => read(cacheKey(coupleId), []))
  const [syncing, setSyncing] = useState(false)
  const [pending, setPending] = useState(() => read<Row[]>(queueKey(coupleId), []).length)

  const merge = useCallback(
    (rows: DayLog[], replace = false) => {
      setLogs((prev) => {
        const map = new Map((replace ? [] : prev).map((l) => [l.day, l]))
        // Les saisies en attente restent prioritaires sur le serveur.
        for (const r of rows) map.set(r.day, r)
        for (const q of read<Row[]>(queueKey(coupleId), [])) map.set(q.day, q)
        const next = [...map.values()].sort((a, b) => a.day.localeCompare(b.day))
        write(cacheKey(coupleId), next)
        return next
      })
    },
    [coupleId],
  )

  const refresh = useCallback(async () => {
    setSyncing(true)
    await flushQueue(coupleId)
    setPending(read<Row[]>(queueKey(coupleId), []).length)
    try {
      merge(await api<DayLog[]>('logs'), true)
    } catch {
      /* hors ligne : on garde le cache local */
    }
    setSyncing(false)
  }, [coupleId, merge])

  useEffect(() => {
    refresh()
    const onOnline = () => refresh()
    const onVisible = () => document.visibilityState === 'visible' && refresh()
    window.addEventListener('online', onOnline)
    document.addEventListener('visibilitychange', onVisible)
    // Pas de temps réel : on resynchronise à l'ouverture et toutes les minutes.
    const timer = setInterval(() => document.visibilityState === 'visible' && refresh(), 60_000)
    return () => {
      window.removeEventListener('online', onOnline)
      document.removeEventListener('visibilitychange', onVisible)
      clearInterval(timer)
    }
  }, [coupleId, refresh, merge])

  const save = useCallback(
    async (log: DayLog) => {
      const row: Row = { ...log, updated_by: userId, updated_at: new Date().toISOString() }
      const queue = read<Row[]>(queueKey(coupleId), []).filter((q) => q.day !== log.day)
      queue.push(row)
      write(queueKey(coupleId), queue)
      merge([row])
      setPending(queue.length)
      await flushQueue(coupleId)
      setPending(read<Row[]>(queueKey(coupleId), []).length)
    },
    [coupleId, userId, merge],
  )

  const remove = useCallback(
    async (day: string) => {
      write(queueKey(coupleId), read<Row[]>(queueKey(coupleId), []).filter((q) => q.day !== day))
      setLogs((prev) => {
        const next = prev.filter((l) => l.day !== day)
        write(cacheKey(coupleId), next)
        return next
      })
      await api(`logs?day=${day}`, { method: 'DELETE' }).catch(() => {})
    },
    [coupleId],
  )

  return { logs, save, remove, refresh, syncing, pending }
}
