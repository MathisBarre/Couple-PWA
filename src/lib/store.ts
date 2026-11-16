// Journées d'un cycle : lecture via l’API avec cache local (consultation hors ligne) et
// file d'attente des saisies et des effacements faits sans réseau, par cycle.
// Le premier cycle d'un espace porte l'id de l'espace : les caches d'avant les cycles
// multiples (logs:<espace>…) restent les siens.
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { DayLog } from '../../shared/cycles'
import { api, ApiError } from './api'

const cacheKey = (cycleId: string) => `logs:${cycleId}`
const queueKey = (cycleId: string) => `queue:${cycleId}`
/** Journées effacées dont l'effacement n'est pas encore arrivé au serveur. */
const deletesKey = (cycleId: string) => `deletes:${cycleId}`
const logsPath = (cycleId: string, extra = '') => `logs?cycle=${encodeURIComponent(cycleId)}${extra}`

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

/** Ce qui attend encore d'être envoyé : saisies et effacements, tous cycles confondus. */
const waiting = (cycleIds: string[]) =>
  cycleIds.reduce((n, id) => n + read<Row[]>(queueKey(id), []).length + read<string[]>(deletesKey(id), []).length, 0)

async function flushQueue(cycleId: string) {
  if (!navigator.onLine) return
  const queue = read<Row[]>(queueKey(cycleId), [])
  if (queue.length)
    try {
      await api(logsPath(cycleId), { method: 'PUT', body: queue })
      // Ne retire que ce qui a été envoyé (une saisie a pu arriver entre-temps).
      const sent = new Map(queue.map((q) => [q.day, q.updated_at]))
      write(queueKey(cycleId), read<Row[]>(queueKey(cycleId), []).filter((q) => sent.get(q.day) !== q.updated_at))
    } catch {
      /* hors ligne ou erreur serveur : on réessaiera */
    }
  // Effacements en attente, un par un : celui qui échoue reste dans la file pour la prochaine fois.
  for (const day of read<string[]>(deletesKey(cycleId), [])) {
    let done = true
    try {
      await api(logsPath(cycleId, `&day=${day}`), { method: 'DELETE' })
    } catch (e) {
      // Refusé pour de bon par le serveur (jour invalide…) : inutile d'insister. Sinon, on réessaiera.
      done = e instanceof ApiError && e.status >= 400 && e.status < 500 && e.status !== 401
    }
    if (done) write(deletesKey(cycleId), read<string[]>(deletesKey(cycleId), []).filter((d) => d !== day))
  }
}

/** Le cycle affiché (`cycleId`) ; `cycleIds` : tous ceux de l'espace, pour envoyer ce qui attend de chacun. */
export function useDayLogs(cycleId: string, cycleIds: string[], userId: string) {
  const all = cycleIds.join('|')
  const [logs, setLogs] = useState<DayLog[]>(() => read(cacheKey(cycleId), []))
  const [syncing, setSyncing] = useState(false)
  const [pending, setPending] = useState(() => waiting(cycleIds))
  // Tant que rien n'est en cache (toute première ouverture), on ne sait pas encore ce qui est noté.
  const [status, setStatus] = useState<LoadStatus>(() => (hasCache(cacheKey(cycleId)) ? 'ready' : 'loading'))
  // Autre cycle choisi : on affiche tout de suite le sien (depuis le cache), puis on rafraîchit.
  const [shown, setShown] = useState(cycleId)
  if (shown !== cycleId) {
    setShown(cycleId)
    setLogs(read(cacheKey(cycleId), []))
    setStatus(hasCache(cacheKey(cycleId)) ? 'ready' : 'loading')
  }
  // Cycle affiché maintenant : une réponse arrivée pour un autre cycle ne va que dans le cache de celui-ci.
  const current = useRef(cycleId)
  useLayoutEffect(() => {
    current.current = cycleId
  })
  const countPending = useCallback(() => setPending(waiting(all.split('|'))), [all])

  const merge = useCallback(
    (rows: DayLog[], replace = false) => {
      const combine = (prev: DayLog[]) => {
        const map = new Map((replace ? [] : prev).map((l) => [l.day, l]))
        // Les saisies en attente restent prioritaires sur le serveur.
        for (const r of rows) map.set(r.day, r)
        for (const q of read<Row[]>(queueKey(cycleId), [])) map.set(q.day, q)
        // Une journée effacée ici ne revient pas tant que le serveur n'a pas reçu l'effacement.
        for (const d of read<string[]>(deletesKey(cycleId), [])) map.delete(d)
        const next = [...map.values()].sort((a, b) => a.day.localeCompare(b.day))
        write(cacheKey(cycleId), next)
        return next
      }
      if (current.current === cycleId) setLogs(combine)
      else combine(read(cacheKey(cycleId), []))
    },
    [cycleId],
  )

  const refresh = useCallback(async () => {
    setSyncing(true)
    setStatus((s) => (s === 'failed' ? 'loading' : s))
    for (const id of all.split('|')) await flushQueue(id)
    countPending()
    try {
      const rows = await api<DayLog[]>(logsPath(cycleId))
      merge(rows, true)
      if (current.current === cycleId) setStatus('ready')
    } catch {
      /* hors ligne : on garde le cache local (s'il n'y en a pas, on le dit) */
      if (current.current === cycleId) setStatus((s) => (s === 'loading' ? 'failed' : s))
    }
    setSyncing(false)
  }, [cycleId, all, merge, countPending])

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
  }, [cycleId, refresh, merge])

  const save = useCallback(
    async (log: DayLog) => {
      const row: Row = { ...log, updated_by: userId, updated_at: new Date().toISOString() }
      const queue = read<Row[]>(queueKey(cycleId), []).filter((q) => q.day !== log.day)
      queue.push(row)
      write(queueKey(cycleId), queue)
      // Journée renotée après avoir été effacée : l'effacement en attente n'a plus lieu d'être.
      write(deletesKey(cycleId), read<string[]>(deletesKey(cycleId), []).filter((d) => d !== log.day))
      merge([row])
      countPending()
      await flushQueue(cycleId)
      countPending()
    },
    [cycleId, userId, merge, countPending],
  )

  const remove = useCallback(
    async (day: string) => {
      write(queueKey(cycleId), read<Row[]>(queueKey(cycleId), []).filter((q) => q.day !== day))
      // L'effacement passe par la file, comme une saisie : hors ligne, il part au retour du réseau.
      write(deletesKey(cycleId), [...read<string[]>(deletesKey(cycleId), []).filter((d) => d !== day), day])
      setLogs((prev) => {
        const next = prev.filter((l) => l.day !== day)
        write(cacheKey(cycleId), next)
        return next
      })
      countPending()
      await flushQueue(cycleId)
      countPending()
    },
    [cycleId, countPending],
  )

  return { logs, save, remove, refresh, syncing, pending, status }
}
