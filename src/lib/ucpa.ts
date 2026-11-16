// Espace UCPA côté téléphone : état du compte UCPA relié, billets (QR), planning des 14 prochains
// jours, séances de l'autre. Tout est gardé sur le téléphone pour s'afficher tout de suite (et le
// QR hors ligne) ; aucune donnée de connexion UCPA n'y est jamais : la session reste chiffrée sur
// le serveur (api/_lib/ucpa/session.ts).
//
// Règles reprises de « UCPA simplifié » :
// - les appels UCPA passent un par un (un seul renouvellement de session à la fois) ;
// - une réservation ou une annulation n'est jamais renvoyée toute seule : une réponse
//   incertaine se vérifie en relisant le planning ;
// - le planning des 14 jours est relu au plus toutes les 10 minutes, les billets toutes les 24 h.
import { useCallback, useEffect, useRef, useState } from 'react'
import { SESSION_EXPIRED } from './api'

export interface Ticket {
  code: string
  label: string
  holder: string
  validUntil?: number
  qr: string
}
export interface Session {
  id: string
  name: string
  start: number
  end: number
  stock: number
  reserved: boolean | null
  available: boolean
  cancellable: boolean
}
export interface Day {
  date: string
  sessions: Session[]
  /** Heure de la lecture (ms). */
  at: number
}
export interface Booking {
  id: string
  day: string
  name: string
  start: number
  end: number
}
export interface Overview {
  account: { holder: string; expiresAt: number } | null
  partner: { id: string; name: string; connected: boolean; syncedAt: number | null; bookings: Booking[] } | null
}
interface Contract {
  id: string
  label: string
}
interface Planning {
  date: string
  contractId: string
  contracts: Contract[]
  sessions: Session[]
}
interface Upcoming {
  from: string
  to: string
  contractId: string
  contracts: Contract[]
  days: { date: string; sessions: Session[] }[]
}

export class UcpaApiError extends Error {
  status: number
  code: string
  constructor(message: string, status: number, code: string) {
    super(message)
    this.status = status
    this.code = code
  }
}

// Un appel UCPA à la fois, entre onglets aussi quand le navigateur le permet (Web Locks) : deux
// renouvellements de session simultanés pourraient se marcher dessus.
let queue: Promise<unknown> = Promise.resolve()
function serial<T>(task: () => Promise<T>): Promise<T> {
  const locks = (navigator as Navigator & { locks?: LockManager }).locks
  const run = locks ? () => locks.request('ucpa', task) as Promise<T> : task
  const next = queue.then(run, run)
  queue = next.catch(() => {})
  return next
}

async function call<T>(query: string, body?: unknown): Promise<T> {
  let res: Response
  try {
    res = await fetch(`/api/ucpa${query}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: 'same-origin',
      cache: 'no-store',
    })
  } catch {
    throw new UcpaApiError(navigator.onLine ? 'Impossible de joindre le serveur. Réessayez.' : 'Hors ligne : réessayez une fois le réseau revenu.', 0, 'OFFLINE')
  }
  const data = (await res.json().catch(() => ({}))) as { error?: string; code?: string }
  if (!res.ok) {
    if (res.status === 401) window.dispatchEvent(new Event(SESSION_EXPIRED))
    throw new UcpaApiError(data.error ?? 'UCPA est momentanément inaccessible. Réessayez.', res.status, data.code ?? 'UCPA_UNAVAILABLE')
  }
  return data as T
}

// ───────── Cache sur le téléphone ─────────
const KEY = 'ucpa'
interface Cache {
  overview?: Overview
  overviewAt?: number
  tickets?: Ticket[]
  ticketsAt?: number
  contractId?: string
  contracts?: Contract[]
  days?: Record<string, Day>
  upcomingAt?: number
}
function readCache(): Cache {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}') as Cache
  } catch {
    return {}
  }
}
function writeCache(c: Cache) {
  try {
    localStorage.setItem(KEY, JSON.stringify(c))
  } catch {
    /* stockage plein ou indisponible : l'app marche sans */
  }
}

const TICKETS_TTL = 24 * 3600_000
const UPCOMING_TTL = 10 * 60_000
const OVERVIEW_TTL = 60_000

/** Date du jour à Paris (AAAA-MM-JJ) : UCPA raisonne en heure de Paris. */
export const parisDay = (ms = Date.now()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris' }).format(ms)
export const addDays = (date: string, n: number) => new Date(Date.parse(`${date}T00:00:00Z`) + n * 86400_000).toISOString().slice(0, 10)

/** Même cours chez l'un et chez l'autre : même code de séance, ou même nom à la même heure. */
export const sameSlot = (a: { id: string; name: string; start: number }, b: { id: string; name: string; start: number }) =>
  a.id === b.id || (a.name === b.name && a.start === b.start)

export type Load = 'idle' | 'loading' | 'failed'

export function useUcpa(active: boolean) {
  const [cache, setCache] = useState<Cache>(readCache)
  const cacheRef = useRef(cache)
  const update = useCallback((fn: (c: Cache) => Cache) => {
    const next = fn(cacheRef.current)
    cacheRef.current = next
    writeCache(next)
    setCache(next)
  }, [])
  const [overviewLoad, setOverviewLoad] = useState<Load>('idle')
  const [ticketsLoad, setTicketsLoad] = useState<Load>('idle')
  const [upcomingLoad, setUpcomingLoad] = useState<Load>('idle')
  const [error, setError] = useState<UcpaApiError | null>(null)
  /** Une écriture est en cours : pas de relecture automatique pendant ce temps. */
  const writing = useRef(0)

  // Session UCPA expirée ou déliée : on oublie ce qui dépend du compte (le QR reste jusqu'à
  // reconnexion ou déconnexion explicite, comme dans l'app UCPA).
  const onError = useCallback(
    (e: unknown) => {
      const err = e instanceof UcpaApiError ? e : new UcpaApiError('Erreur inattendue', 0, 'UNKNOWN')
      if (err.code === 'UCPA_SESSION_EXPIRED' || err.code === 'UCPA_NOT_CONNECTED')
        update((c) => ({ ...c, overview: c.overview && { ...c.overview, account: null }, upcomingAt: undefined }))
      setError(err)
      throw err
    },
    [update],
  )

  const refreshOverview = useCallback(async () => {
    setOverviewLoad('loading')
    try {
      const overview = await call<Overview>('')
      update((c) => ({ ...c, overview, overviewAt: Date.now() }))
      setOverviewLoad('idle')
      return overview
    } catch {
      setOverviewLoad('failed')
      return null
    }
  }, [update])

  const refreshTickets = useCallback(async () => {
    setTicketsLoad('loading')
    try {
      const { tickets } = await serial(() => call<{ tickets: Ticket[] }>('?view=tickets'))
      update((c) => ({ ...c, tickets, ticketsAt: Date.now() }))
      setTicketsLoad('idle')
    } catch (e) {
      setTicketsLoad('failed')
      onError(e)
    }
  }, [update, onError])

  const refreshUpcoming = useCallback(async () => {
    setUpcomingLoad('loading')
    try {
      const contractId = cacheRef.current.contractId ?? ''
      const res = await serial(() => call<Upcoming>(`?view=upcoming&contractId=${encodeURIComponent(contractId)}`))
      const at = Date.now()
      update((c) => {
        const days: Record<string, Day> = {}
        // On garde les jours plus lointains déjà lus, et rien du passé.
        for (const [d, v] of Object.entries(c.days ?? {})) if (d >= res.from && d > res.to) days[d] = v
        for (const d of res.days) days[d.date] = { ...d, at }
        return { ...c, days, contractId: res.contractId, contracts: res.contracts, upcomingAt: at }
      })
      setUpcomingLoad('idle')
    } catch (e) {
      setUpcomingLoad('failed')
      onError(e)
    }
  }, [update, onError])

  const loadDay = useCallback(
    async (date: string) => {
      const contractId = cacheRef.current.contractId ?? ''
      const res = await serial(() => call<Planning>(`?view=planning&date=${date}&contractId=${encodeURIComponent(contractId)}`)).catch(onError)
      update((c) => ({ ...c, contractId: res.contractId, contracts: res.contracts, days: { ...c.days, [date]: { date, sessions: res.sessions, at: Date.now() } } }))
      return res
    },
    [update, onError],
  )

  const connected = Boolean(cache.overview?.account)

  // À l'ouverture de l'espace et au retour dans l'app : ce qui est périmé, et seulement ça.
  const tick = useCallback(() => {
    const c = cacheRef.current
    const now = Date.now()
    if (c.overviewAt && now - c.overviewAt > OVERVIEW_TTL) void refreshOverview()
    if (!c.overview?.account || writing.current) return
    if (!c.ticketsAt || now - c.ticketsAt > TICKETS_TTL) void refreshTickets().catch(() => {})
    if (!c.upcomingAt || now - c.upcomingAt > UPCOMING_TTL) void refreshUpcoming().catch(() => {})
  }, [refreshOverview, refreshTickets, refreshUpcoming])

  // À l'ouverture de l'espace : l'état du compte et les séances de l'autre sont toujours relus
  // (lecture en base, rapide), puis le reste selon sa fraîcheur.
  useEffect(() => {
    if (!active) return
    void refreshOverview().then((o) => {
      if (o?.account) tick()
    })
    const onVisible = () => document.visibilityState === 'visible' && tick()
    document.addEventListener('visibilitychange', onVisible)
    addEventListener('online', tick)
    const timer = setInterval(() => document.visibilityState === 'visible' && tick(), 60_000)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      removeEventListener('online', tick)
      clearInterval(timer)
    }
  }, [active, tick, refreshOverview])

  const login = useCallback(
    async (email: string, password: string) => {
      const overview = await call<Overview>('', { action: 'login', email, password })
      // Nouveau compte : rien de l'ancien ne doit rester.
      update(() => ({ overview, overviewAt: Date.now() }))
      setError(null)
      void refreshTickets().catch(() => {})
      void refreshUpcoming().catch(() => {})
    },
    [update, refreshTickets, refreshUpcoming],
  )

  const logout = useCallback(async () => {
    const res = await serial(() => call<Overview & { upstreamConfirmed: boolean }>('', { action: 'logout' }))
    update(() => ({ overview: { account: res.account, partner: res.partner }, overviewAt: Date.now() }))
    return res.upstreamConfirmed
  }, [update])

  /** Réserve ou annule ; en cas de succès, la séance change tout de suite dans le planning gardé. */
  const mutate = useCallback(
    async (action: 'reserve' | 'cancel', date: string, s: Session) => {
      writing.current++
      try {
        const contractId = cacheRef.current.contractId ?? ''
        await serial(() =>
          call('', { action, contractId, sessionId: s.id, date, expectedSession: { name: s.name, start: s.start, end: s.end } }),
        ).catch(onError)
        const reserved = action === 'reserve'
        update((c) => {
          const day = c.days?.[date]
          if (!day) return c
          const sessions = day.sessions.map((x) =>
            x.id === s.id ? { ...x, reserved, available: false, cancellable: reserved, stock: Math.max(0, x.stock + (reserved ? -1 : 1)) } : x,
          )
          return { ...c, days: { ...c.days, [date]: { ...day, sessions } } }
        })
      } finally {
        writing.current--
      }
      // Les places et droits exacts : relus juste après, sans bloquer.
      void loadDay(date).catch(() => {})
    },
    [update, onError, loadDay],
  )

  const days = cache.days ?? {}
  const now = Date.now()
  const mine: (Session & { date: string })[] = Object.values(days)
    .flatMap((d) => d.sessions.filter((s) => s.reserved === true && s.end > now).map((s) => ({ ...s, date: d.date })))
    .sort((a, b) => a.start - b.start)

  return {
    overview: cache.overview,
    overviewLoad,
    connected,
    tickets: cache.tickets,
    ticketsAt: cache.ticketsAt,
    ticketsLoad,
    days,
    upcomingAt: cache.upcomingAt,
    upcomingLoad,
    contracts: cache.contracts ?? [],
    contractId: cache.contractId ?? '',
    setContract: (id: string) => {
      update((c) => ({ ...c, contractId: id, days: {}, upcomingAt: undefined }))
      void refreshUpcoming().catch(() => {})
    },
    mine,
    error,
    refreshOverview,
    refreshTickets,
    refreshUpcoming,
    loadDay,
    login,
    logout,
    reserve: (date: string, s: Session) => mutate('reserve', date, s),
    cancel: (date: string, s: Session) => mutate('cancel', date, s),
  }
}
export type Ucpa = ReturnType<typeof useUcpa>
