// Données du couple : lecture depuis Supabase avec cache local (consultation
// hors ligne) et file d'attente des saisies faites sans réseau.
import { useCallback, useEffect, useState } from 'react'
import type { DayLog } from '../../supabase/functions/_shared/cycles'
import { supabase } from './supabase'

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

type Row = DayLog & { couple_id: string }

async function flushQueue(coupleId: string) {
  const queue = read<Row[]>(queueKey(coupleId), [])
  if (!queue.length || !navigator.onLine) return
  const { error } = await supabase.from('day_logs').upsert(queue)
  if (!error) write(queueKey(coupleId), [])
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
    const { data, error } = await supabase
      .from('day_logs')
      .select('day, flow, pain, symptoms, note, updated_by, updated_at')
      .eq('couple_id', coupleId)
      .order('day')
    if (!error && data) merge(data as DayLog[], true)
    setSyncing(false)
  }, [coupleId, merge])

  useEffect(() => {
    refresh()
    const onOnline = () => refresh()
    const onVisible = () => document.visibilityState === 'visible' && refresh()
    window.addEventListener('online', onOnline)
    document.addEventListener('visibilitychange', onVisible)
    // Temps réel : la saisie de l'autre apparaît instantanément.
    const channel = supabase
      .channel(`logs-${coupleId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'day_logs', filter: `couple_id=eq.${coupleId}` }, (p) => {
        if (p.eventType === 'DELETE') {
          const day = (p.old as { day?: string }).day
          if (day) setLogs((prev) => prev.filter((l) => l.day !== day))
        } else merge([p.new as DayLog])
      })
      .subscribe()
    return () => {
      window.removeEventListener('online', onOnline)
      document.removeEventListener('visibilitychange', onVisible)
      supabase.removeChannel(channel)
    }
  }, [coupleId, refresh, merge])

  const save = useCallback(
    async (log: DayLog) => {
      const row: Row = { ...log, couple_id: coupleId, updated_by: userId, updated_at: new Date().toISOString() }
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
      await supabase.from('day_logs').delete().eq('couple_id', coupleId).eq('day', day)
    },
    [coupleId],
  )

  return { logs, save, remove, refresh, syncing, pending }
}
