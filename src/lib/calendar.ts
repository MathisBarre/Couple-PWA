// Calendrier commun : même principe que la liste de courses (cache local + file d'attente
// hors ligne, en opérations), pour que chacun puisse ajouter ou modifier même sans réseau.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { compareEvents, type CalEvent, type StoredEvent } from '../../shared/calendar'
import { api } from './api'
import { hasCache, type LoadStatus } from './store'

export type CalendarOp = { op: 'put'; event: CalEvent } | { op: 'delete'; id: string }
interface ServerState {
  events: StoredEvent[]
  feed: string
}

const cacheKey = (coupleId: string) => `calendar:${coupleId}`
const queueKey = (coupleId: string) => `calendar-queue:${coupleId}`

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

export function applyCalendarOps(events: StoredEvent[], ops: CalendarOp[], userId: string | null = null): StoredEvent[] {
  let next = events
  for (const o of ops) {
    if (o.op === 'put') {
      const prev = next.find((e) => e.id === o.event.id)
      const stored: StoredEvent = {
        ...o.event,
        created_by: prev?.created_by ?? userId,
        updated_by: userId,
        updated_at: new Date().toISOString().slice(0, 19).replace('T', ' '),
      }
      next = prev ? next.map((e) => (e.id === o.event.id ? stored : e)) : [...next, stored]
    } else next = next.filter((e) => e.id !== o.id)
  }
  return [...next].sort(compareEvents)
}

export const newEventId = () =>
  typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`

/** `enabled` : l'espace Calendrier est activé (sinon rien n'est chargé). `active` : il est affiché (rafraîchi plus souvent). */
export function useCalendar(coupleId: string, userId: string, active: boolean, enabled = true) {
  const [server, setServer] = useState<ServerState>(() => read(cacheKey(coupleId), { events: [], feed: '' }))
  const [queued, setQueued] = useState(() => read<CalendarOp[]>(queueKey(coupleId), []))
  const [status, setStatus] = useState<LoadStatus>(() => (hasCache(cacheKey(coupleId)) ? 'ready' : 'loading'))
  const [error, setError] = useState('')
  const events = useMemo(() => applyCalendarOps(server.events, queued, userId), [server.events, queued, userId])
  const waiting = useMemo(() => new Set(queued.map((o) => (o.op === 'put' ? o.event.id : o.id))), [queued])

  const adopt = useCallback(
    (next: ServerState) => {
      write(cacheKey(coupleId), next)
      setServer(next)
      setQueued(read<CalendarOp[]>(queueKey(coupleId), []))
      setStatus('ready')
    },
    [coupleId],
  )

  const sync = useCallback(async () => {
    const queue = read<CalendarOp[]>(queueKey(coupleId), [])
    setStatus((s) => (s === 'failed' ? 'loading' : s))
    try {
      if (queue.length && navigator.onLine) {
        let next: ServerState
        try {
          next = await api<ServerState>('calendar', { method: 'POST', body: { ops: queue } })
        } catch (e) {
          // Refusé par le serveur (saisie invalide) : on l'abandonne plutôt que de bloquer la file pour toujours.
          if ((e as { status?: number }).status === 400) {
            write(queueKey(coupleId), read<CalendarOp[]>(queueKey(coupleId), []).slice(queue.length))
            setError((e as Error).message)
            return adopt(await api<ServerState>('calendar'))
          }
          throw e
        }
        write(queueKey(coupleId), read<CalendarOp[]>(queueKey(coupleId), []).slice(queue.length))
        adopt(next)
      } else adopt(await api<ServerState>('calendar'))
    } catch {
      setStatus((s) => (s === 'loading' ? 'failed' : s))
    }
  }, [coupleId, adopt])

  useEffect(() => {
    if (!enabled) return
    sync()
    const onOnline = () => sync()
    const onVisible = () => document.visibilityState === 'visible' && sync()
    window.addEventListener('online', onOnline)
    document.addEventListener('visibilitychange', onVisible)
    const timer = setInterval(() => document.visibilityState === 'visible' && sync(), active ? 20_000 : 120_000)
    return () => {
      window.removeEventListener('online', onOnline)
      document.removeEventListener('visibilitychange', onVisible)
      clearInterval(timer)
    }
  }, [sync, active, enabled])

  const run = useCallback(
    (ops: CalendarOp[]) => {
      const queue = [...read<CalendarOp[]>(queueKey(coupleId), []), ...ops]
      write(queueKey(coupleId), queue)
      setQueued(queue)
      setError('')
      setStatus('ready')
      sync()
    },
    [coupleId, sync],
  )

  const save = useCallback((event: CalEvent) => run([{ op: 'put', event }]), [run])
  const remove = useCallback((id: string) => run([{ op: 'delete', id }]), [run])

  const resetFeed = useCallback(async () => {
    adopt(await api<ServerState>('calendar', { method: 'POST', body: { action: 'reset-feed' } }))
  }, [adopt])

  return { events, feed: server.feed, pending: queued.length, waiting, status, error, save, remove, resetFeed, refresh: sync }
}

export type Calendar = ReturnType<typeof useCalendar>

// ───────── Liens vers le calendrier du téléphone ─────────
const isAndroid = () => /android/i.test(navigator.userAgent)
const standalone = () => (navigator as Navigator & { standalone?: boolean }).standalone === true

/** Adresse du flux (https) ; `webcal://` pour s'y abonner depuis Apple Calendrier. */
export const feedUrl = (token: string) => `${location.origin}/cal/${token}.ics`
export const webcalUrl = (token: string) => feedUrl(token).replace(/^https?:/, 'webcal:')
/** Google Agenda : « Ajouter un agenda à partir d'une URL » pré-rempli. */
export const googleSubscribeUrl = (token: string) => `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(webcalUrl(token))}`

const utc = (ms: number) => new Date(ms).toISOString().replace(/[-:]|\.\d{3}/g, '')

/** Ajouter un seul événement au calendrier du téléphone. */
export function addToPhoneLink(e: CalEvent, token: string, span: { start: number; end: number } | null): { href: string; target?: string } {
  if (!isAndroid()) {
    const path = `/api/calendar?${new URLSearchParams({ feed: token, event: e.id })}`
    // App installée sur iPhone : sa vue web intégrée montre une page blanche pour un .ics ; Safari propose de l'ajouter.
    return standalone() ? { href: `x-safari-${location.protocol.slice(0, -1)}://${location.host}${path}` } : { href: path, target: '_blank' }
  }
  const dates = span ? `${utc(span.start)}/${utc(span.end)}` : `${e.start_day.replace(/-/g, '')}/${nextDay(e.end_day).replace(/-/g, '')}`
  const params: Record<string, string> = { text: e.title, dates, ctz: 'Europe/Paris' }
  if (e.location) params.location = e.location
  if (e.note) params.details = e.note
  const web = `https://calendar.google.com/calendar/r/eventedit?${new URLSearchParams(params)}`
  return { href: `intent://${web.slice('https://'.length)}#Intent;scheme=https;package=com.google.android.calendar;S.browser_fallback_url=${encodeURIComponent(web)};end` }
}

function nextDay(day: string) {
  const d = new Date(`${day}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().slice(0, 10)
}
