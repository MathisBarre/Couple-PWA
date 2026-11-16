// Données du couple : lecture via l’API avec cache local (consultation
// hors ligne) et file d'attente des saisies et des effacements faits sans réseau.
import { useCallback, useEffect, useState } from 'react'
import type { DayLog } from '../../shared/cycles'
import { api, ApiError } from './api'

const cacheKey = (coupleId: string) => `logs:${coupleId}`
const queueKey = (coupleId: string) => `queue:${coupleId}`
/** Journées effacées dont l'effacement n'est pas encore arrivé au serveur. */
const deletesKey = (coupleId: string) => `deletes:${coupleId}`

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

/** `loading` : premier chargement sans cache ; `failed` : il a échoué (rien à montrer) ; `ready` : des données, fraîches ou du cache. */
export type LoadStatus = 'loading' | 'failed' | 'ready'

export function hasCache(key: string) {
  try {
    return localStorage.getItem(key) !== null
  } catch {
    return false
  }
}

/** Ce qui attend encore d'être envoyé : saisies et effacements. */
const waiting = (coupleId: string) => read<Row[]>(queueKey(coupleId), []).length + read<string[]>(deletesKey(coupleId), []).length

async function flushQueue(coupleId: string) {
  if (!navigator.onLine) return
  const queue = read<Row[]>(queueKey(coupleId), [])
  if (queue.length)
    try {
      await api('logs', { method: 'PUT', body: queue })
      // Ne retire que ce qui a été envoyé (une saisie a pu arriver entre-temps).
      const sent = new Map(queue.map((q) => [q.day, q.updated_at]))
      write(queueKey(coupleId), read<Row[]>(queueKey(coupleId), []).filter((q) => sent.get(q.day) !== q.updated_at))
    } catch {
      /* hors ligne ou erreur serveur : on réessaiera */
    }
  // Effacements en attente, un par un : celui qui échoue reste dans la file pour la prochaine fois.
  for (const day of read<string[]>(deletesKey(coupleId), [])) {
    let done = true
    try {
      await api(`logs?day=${day}`, { method: 'DELETE' })
    } catch (e) {
      // Refusé pour de bon par le serveur (jour invalide…) : inutile d'insister. Sinon, on réessaiera.
      done = e instanceof ApiError && e.status >= 400 && e.status < 500 && e.status !== 401
    }
    if (done) write(deletesKey(coupleId), read<string[]>(deletesKey(coupleId), []).filter((d) => d !== day))
  }
}

export function useDayLogs(coupleId: string, userId: string) {
  const [logs, setLogs] = useState<DayLog[]>(() => read(cacheKey(coupleId), []))
  const [syncing, setSyncing] = useState(false)
  const [pending, setPending] = useState(() => waiting(coupleId))
  // Tant que rien n'est en cache (toute première ouverture), on ne sait pas encore ce qui est noté.
  const [status, setStatus] = useState<LoadStatus>(() => (hasCache(cacheKey(coupleId)) ? 'ready' : 'loading'))

  const merge = useCallback(
    (rows: DayLog[], replace = false) => {
      setLogs((prev) => {
        const map = new Map((replace ? [] : prev).map((l) => [l.day, l]))
        // Les saisies en attente restent prioritaires sur le serveur.
        for (const r of rows) map.set(r.day, r)
        for (const q of read<Row[]>(queueKey(coupleId), [])) map.set(q.day, q)
        // Une journée effacée ici ne revient pas tant que le serveur n'a pas reçu l'effacement.
        for (const d of read<string[]>(deletesKey(coupleId), [])) map.delete(d)
        const next = [...map.values()].sort((a, b) => a.day.localeCompare(b.day))
        write(cacheKey(coupleId), next)
        return next
      })
    },
    [coupleId],
  )

  const refresh = useCallback(async () => {
    setSyncing(true)
    setStatus((s) => (s === 'failed' ? 'loading' : s))
    await flushQueue(coupleId)
    setPending(waiting(coupleId))
    try {
      merge(await api<DayLog[]>('logs'), true)
      setStatus('ready')
    } catch {
      /* hors ligne : on garde le cache local (s'il n'y en a pas, on le dit) */
      setStatus((s) => (s === 'loading' ? 'failed' : s))
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
      // Journée renotée après avoir été effacée : l'effacement en attente n'a plus lieu d'être.
      write(deletesKey(coupleId), read<string[]>(deletesKey(coupleId), []).filter((d) => d !== log.day))
      merge([row])
      setPending(waiting(coupleId))
      await flushQueue(coupleId)
      setPending(waiting(coupleId))
    },
    [coupleId, userId, merge],
  )

  const remove = useCallback(
    async (day: string) => {
      write(queueKey(coupleId), read<Row[]>(queueKey(coupleId), []).filter((q) => q.day !== day))
      // L'effacement passe par la file, comme une saisie : hors ligne, il part au retour du réseau.
      write(deletesKey(coupleId), [...read<string[]>(deletesKey(coupleId), []).filter((d) => d !== day), day])
      setLogs((prev) => {
        const next = prev.filter((l) => l.day !== day)
        write(cacheKey(coupleId), next)
        return next
      })
      setPending(waiting(coupleId))
      await flushQueue(coupleId)
      setPending(waiting(coupleId))
    },
    [coupleId],
  )

  return { logs, save, remove, refresh, syncing, pending, status }
}
