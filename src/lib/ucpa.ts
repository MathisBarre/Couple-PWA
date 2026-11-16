// Espace UCPA côté téléphone : état du compte UCPA relié, billets (QR), planning, séances de
// l'autre. Tout est gardé sur le téléphone pour s'afficher tout de suite, hors ligne compris ;
// aucune donnée de connexion UCPA n'y est jamais : la session reste chiffrée sur le serveur.
//
// Règles reprises de « UCPA simplifié » (src/Booking.tsx, Reservations.tsx, storage.ts) :
// - un appel UCPA à la fois (un seul renouvellement de session), entre onglets aussi ;
// - le QR et le planning gardés restent consultables hors ligne et après expiration de la
//   session ; seule une déconnexion explicite les efface ;
// - une réservation ou une annulation n'est jamais renvoyée toute seule. Une réponse incertaine
//   laisse un marqueur durable (rechargements compris) qui bloque tout nouvel envoi jusqu'à ce
//   qu'une lecture fraîche confirme l'état attendu, ou que l'utilisateur déclare avoir vérifié ;
// - une confirmation reçue est gardée : une lecture encore obsolète ne rétablit pas l'ancien état ;
// - le planning des 14 jours est relu au plus toutes les 10 minutes, les billets toutes les 24 h ;
//   le jour affiché, chaque minute tant qu'une séance à venir y est visible.
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
  contractId: string
  sessions: Session[]
  /** Heure de la lecture (ms) : sa vraie date, jamais rajeunie à la réouverture. */
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
export interface Contract {
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
export type Action = 'reserve' | 'cancel'
/** Opération dont on n'a pas la réponse : rien ne repart tant qu'elle n'est pas vérifiée. */
export interface Pending {
  action: Action
  date: string
  contractId: string
  sessionId: string
  name: string
}
/** Confirmation reçue d'UCPA, gardée tant qu'une lecture ne l'a pas rattrapée. */
interface Receipt {
  action: Action
  date: string
  contractId: string
  sessionId: string
  at: number
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

// ───────── Délais (cache-policy.ts d'origine) ─────────
export const TICKETS_TTL = 24 * 3600_000
export const UPCOMING_TTL = 10 * 60_000
/** Le jour affiché est relu chaque minute tant qu'une séance à venir y est visible, sinon toutes les 6 h. */
export const AVAILABILITY_TTL = 60_000
export const SCHEDULE_TTL = 6 * 3600_000
/** Un nombre de places reste valable 5 minutes ; plus vieux, il reste affiché, marqué. */
export const PLACES_VALIDITY = 5 * 60_000
/** Une séance réservée lue il y a plus de 3 minutes peut encore être annulée (le serveur vérifie). */
export const RESERVATION_VALIDITY = 3 * 60_000
const RECEIPT_TTL = 10 * 60_000
const MAX_DAYS = 30
export const fresh = (at: number | undefined, ttl: number, now = Date.now()) => Boolean(at) && at! <= now && now - at! < ttl

/** Date du jour à Paris (AAAA-MM-JJ) : UCPA raisonne en heure de Paris. */
export const parisDay = (ms = Date.now()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris' }).format(ms)
export const addDays = (date: string, n: number) => new Date(Date.parse(`${date}T00:00:00Z`) + n * 86400_000).toISOString().slice(0, 10)
export const LAST_DAY = 90

/** Même cours chez l'un et chez l'autre : même code de séance, ou même nom à la même heure. */
export const sameSlot = (a: { id: string; name: string; start: number }, b: { id: string; name: string; start: number }) =>
  a.id === b.id || (a.name === b.name && a.start === b.start)

// Un appel UCPA à la fois, entre onglets aussi quand le navigateur le permet (Web Locks).
let queue: Promise<unknown> = Promise.resolve()
function serial<T>(task: () => Promise<T>): Promise<T> {
  const locks = (navigator as Navigator & { locks?: LockManager }).locks
  const run = locks ? () => locks.request('ucpa', task) as Promise<T> : task
  const next = queue.then(run, run)
  queue = next.catch(() => {})
  return next
}

async function call<T>(query: string, body?: unknown): Promise<T> {
  if (navigator.onLine === false) throw new UcpaApiError('Hors ligne : réessayez une fois le réseau revenu.', 0, 'OFFLINE')
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

// ───────── Ce qui est gardé sur le téléphone ─────────
const KEY = 'ucpa'
const FILTER_KEY = 'ucpa-activites'
const PENDING_KEY = 'ucpa-en-attente'
interface Cache {
  overview?: Overview
  overviewAt?: number
  tickets?: Ticket[]
  ticketsAt?: number
  /** Billet choisi pour le QR (plusieurs billets possibles). */
  ticket?: number
  contractId?: string
  contracts?: Contract[]
  days?: Record<string, Day>
  upcomingAt?: number
  receipts?: Receipt[]
  /** Jour affiché dans « Réserver », retrouvé à la réouverture. */
  date?: string
}
export interface Filters {
  selected: string[]
  /** Toutes les activités déjà vues, pour pouvoir filtrer avant même de charger un jour. */
  known: string[]
}
function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}
function writeJson(key: string, value: unknown) {
  try {
    if (value === null) localStorage.removeItem(key)
    else localStorage.setItem(key, JSON.stringify(value))
    return true
  } catch {
    return false
  }
}
export const storageAvailable = (() => {
  try {
    localStorage.setItem('ucpa-test', '1')
    localStorage.removeItem('ucpa-test')
    return true
  } catch {
    return false
  }
})()

/** Garde les jours à venir, au plus MAX_DAYS, les plus proches d'abord. */
function prune(days: Record<string, Day>) {
  const today = parisDay()
  return Object.fromEntries(
    Object.entries(days)
      .filter(([d]) => d >= today)
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(0, MAX_DAYS),
  )
}

/** Une confirmation reçue l'emporte sur une lecture qui ne l'a pas encore rattrapée. */
function applyReceipts(day: Day, receipts: Receipt[]): { day: Day; caught: Receipt[] } {
  const caught: Receipt[] = []
  const sessions = day.sessions.map((s) => {
    const r = receipts.find((x) => x.date === day.date && x.contractId === day.contractId && x.sessionId === s.id)
    if (!r) return s
    const reserved = r.action === 'reserve'
    if (s.reserved === reserved && day.at > r.at) {
      caught.push(r)
      return s
    }
    return { ...s, reserved, available: false, cancellable: reserved ? s.cancellable || true : false }
  })
  return { day: { ...day, sessions }, caught }
}

export type Load = 'idle' | 'loading' | 'failed'

export function useUcpa(active: boolean) {
  const [cache, setCache] = useState<Cache>(() => ({ ...readJson<Cache>(KEY, {}) }))
  const cacheRef = useRef(cache)
  const update = useCallback((fn: (c: Cache) => Cache) => {
    const next = fn(cacheRef.current)
    cacheRef.current = next
    writeJson(KEY, next)
    setCache(next)
  }, [])
  const [filters, setFiltersState] = useState<Filters>(() => {
    const f = readJson<Filters>(FILTER_KEY, { selected: [], known: [] })
    return { selected: Array.isArray(f.selected) ? f.selected : [], known: Array.isArray(f.known) ? f.known : [] }
  })
  const setFilters = useCallback((fn: (f: Filters) => Filters) => {
    setFiltersState((prev) => {
      const next = fn(prev)
      writeJson(FILTER_KEY, next)
      return next
    })
  }, [])
  const [pending, setPendingState] = useState<Pending | null>(() => readJson<Pending | null>(PENDING_KEY, null))
  const pendingRef = useRef(pending)
  const setPending = useCallback((p: Pending | null) => {
    pendingRef.current = p
    setPendingState(p)
    return writeJson(PENDING_KEY, p)
  }, [])
  const [overviewLoad, setOverviewLoad] = useState<Load>('idle')
  const [ticketsLoad, setTicketsLoad] = useState<Load>('idle')
  const [upcomingLoad, setUpcomingLoad] = useState<Load>('idle')
  const [dayLoad, setDayLoad] = useState<Record<string, Load>>({})
  const [dayError, setDayError] = useState<Record<string, string>>({})
  const [error, setError] = useState<UcpaApiError | null>(null)
  const [online, setOnline] = useState(navigator.onLine !== false)
  /** Une écriture est en cours : pas de relecture automatique pendant ce temps. */
  const [writing, setWriting] = useState(false)
  const writingRef = useRef(false)

  // Autres onglets : filtres et marqueur d'opération suivis.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === FILTER_KEY || e.key === null) setFiltersState(readJson<Filters>(FILTER_KEY, { selected: [], known: [] }))
      if (e.key === PENDING_KEY || e.key === null) {
        const p = readJson<Pending | null>(PENDING_KEY, null)
        pendingRef.current = p
        setPendingState(p)
      }
    }
    const net = () => setOnline(navigator.onLine !== false)
    addEventListener('storage', onStorage)
    addEventListener('online', net)
    addEventListener('offline', net)
    return () => {
      removeEventListener('storage', onStorage)
      removeEventListener('online', net)
      removeEventListener('offline', net)
    }
  }, [])

  // Session UCPA expirée ou déliée : le QR et le planning gardés restent, les actions sont bloquées.
  const onError = useCallback(
    (e: unknown): never => {
      const err = e instanceof UcpaApiError ? e : new UcpaApiError('Erreur inattendue', 0, 'UNKNOWN')
      if (err.code === 'UCPA_SESSION_EXPIRED' || err.code === 'UCPA_NOT_CONNECTED')
        update((c) => ({ ...c, overview: c.overview && { ...c.overview, account: null } }))
      setError(err)
      throw err
    },
    [update],
  )

  /** Nouveaux jours lus : confirmations appliquées, activités connues, marqueur résolu si la lecture le prouve. */
  const storeDays = useCallback(
    (incoming: Day[], { startedAt }: { startedAt?: number } = {}) => {
      let receipts = cacheRef.current.receipts ?? []
      const merged: Day[] = []
      for (const d of incoming) {
        const existing = cacheRef.current.days?.[d.date]
        // Une journée relue seule pendant la lecture des 14 jours n'est pas écrasée.
        if (startedAt && existing && existing.contractId === d.contractId && existing.at > startedAt) continue
        const { day, caught } = applyReceipts(d, receipts)
        receipts = receipts.filter((r) => !caught.includes(r))
        merged.push(day)
      }
      const now = Date.now()
      receipts = receipts.filter((r) => now - r.at < RECEIPT_TTL)
      update((c) => {
        const days = { ...c.days }
        for (const d of merged) days[d.date] = d
        return { ...c, days: prune(days), receipts }
      })
      const names = incoming.flatMap((d) => d.sessions.map((s) => s.name))
      if (names.some((n) => !filters.known.includes(n))) setFilters((f) => ({ ...f, known: [...new Set([...f.known, ...names])] }))
      // Le marqueur d'une opération incertaine ne se lève que sur une lecture fraîche qui montre l'état attendu.
      const p = pendingRef.current
      if (p) {
        const day = incoming.find((d) => d.date === p.date && d.contractId === p.contractId)
        if (day?.sessions.some((s) => s.id === p.sessionId && s.reserved === (p.action === 'reserve'))) setPending(null)
      }
    },
    [update, filters.known, setFilters, setPending],
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

  // Une lecture déjà en cours est partagée, jamais relancée (comme isFetching dans l'app d'origine).
  const flights = useRef<{ tickets?: Promise<void>; upcoming?: Promise<void> }>({})
  const once = (key: 'tickets' | 'upcoming', run: () => Promise<void>) =>
    (flights.current[key] ??= run().finally(() => {
      flights.current[key] = undefined
    }))

  const refreshTickets = useCallback(
    () =>
      once('tickets', async () => {
        setTicketsLoad('loading')
        try {
          const { tickets } = await serial(() => call<{ tickets: Ticket[] }>('?view=tickets'))
          // Une réponse valide vide efface le QR ; une erreur garde la copie.
          update((c) => ({ ...c, tickets, ticketsAt: Date.now(), ticket: Math.min(c.ticket ?? 0, Math.max(0, tickets.length - 1)) }))
          setTicketsLoad('idle')
        } catch (e) {
          setTicketsLoad('failed')
          onError(e)
        }
      }),
    [update, onError],
  )

  const refreshUpcoming = useCallback(async () => {
    if (writingRef.current || pendingRef.current) return
    return once('upcoming', async () => {
      setUpcomingLoad('loading')
      const startedAt = Date.now()
      try {
        const contractId = cacheRef.current.contractId ?? ''
        const res = await serial(() => call<Upcoming>(`?view=upcoming&contractId=${encodeURIComponent(contractId)}`))
        const at = Date.now()
        update((c) => ({ ...c, contractId: res.contractId, contracts: res.contracts, upcomingAt: at }))
        storeDays(
          res.days.map((d) => ({ ...d, contractId: res.contractId, at })),
          { startedAt },
        )
        setUpcomingLoad('idle')
      } catch (e) {
        setUpcomingLoad('failed')
        onError(e)
      }
    })
  }, [update, onError, storeDays])

  const loadDay = useCallback(
    async (date: string) => {
      setDayLoad((l) => ({ ...l, [date]: 'loading' }))
      try {
        const contractId = cacheRef.current.contractId ?? ''
        const res = await serial(() => call<Planning>(`?view=planning&date=${date}&contractId=${encodeURIComponent(contractId)}`))
        update((c) => ({ ...c, contractId: res.contractId, contracts: res.contracts }))
        storeDays([{ date, contractId: res.contractId, sessions: res.sessions, at: Date.now() }])
        setDayLoad((l) => ({ ...l, [date]: 'idle' }))
        setDayError((e) => {
          const next = { ...e }
          delete next[date]
          return next
        })
      } catch (e) {
        setDayLoad((l) => ({ ...l, [date]: 'failed' }))
        setDayError((m) => ({ ...m, [date]: (e as Error).message }))
        onError(e)
      }
    },
    [update, onError, storeDays],
  )

  const connected = Boolean(cache.overview?.account)

  // À l'ouverture de l'app, au retour au premier plan ou du réseau, et toutes les 30 s :
  // ce qui est périmé (billets 24 h, 14 jours 10 min), et seulement ça.
  const tick = useCallback(() => {
    const c = cacheRef.current
    if (!c.overview?.account || writingRef.current || navigator.onLine === false) return
    if (!fresh(c.ticketsAt, TICKETS_TTL)) void refreshTickets().catch(() => {})
    if (!fresh(c.upcomingAt, UPCOMING_TTL)) void refreshUpcoming().catch(() => {})
  }, [refreshTickets, refreshUpcoming])

  useEffect(() => {
    if (!active) return
    // L'état du compte et les séances de l'autre sont relus à chaque ouverture (lecture en base, rapide).
    void refreshOverview().then((o) => o?.account && tick())
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return
      if (!fresh(cacheRef.current.overviewAt, 60_000)) void refreshOverview()
      tick()
    }
    document.addEventListener('visibilitychange', onVisible)
    addEventListener('online', onVisible)
    const timer = setInterval(() => document.visibilityState === 'visible' && tick(), 30_000)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      removeEventListener('online', onVisible)
      clearInterval(timer)
    }
  }, [active, tick, refreshOverview])

  const login = useCallback(
    async (email: string, password: string) => {
      const overview = await call<Overview>('', { action: 'login', email, password })
      // Nouvelle connexion : rien de l'ancienne ne doit rester (le compte a pu changer).
      update(() => ({ overview, overviewAt: Date.now() }))
      setError(null)
      void refreshTickets().catch(() => {})
      void refreshUpcoming().catch(() => {})
    },
    [update, refreshTickets, refreshUpcoming],
  )

  /** Déconnexion explicite (ou « Effacer le QR de cet appareil ») : QR et planning effacés. */
  const logout = useCallback(async () => {
    const wasConnected = Boolean(cacheRef.current.overview?.account)
    const keepPartner = cacheRef.current.overview?.partner ?? null
    update(() => ({ overview: { account: null, partner: keepPartner }, overviewAt: Date.now() }))
    setError(null)
    if (!wasConnected) return true
    const res = await serial(() => call<Overview & { upstreamConfirmed: boolean }>('', { action: 'logout' }))
    update(() => ({ overview: { account: res.account, partner: res.partner }, overviewAt: Date.now() }))
    return res.upstreamConfirmed
  }, [update])

  /**
   * Réserve ou annule. Confirmé : la séance change tout de suite et la confirmation est gardée.
   * Refus explicite : rien n'est gardé. Réponse incertaine : marqueur durable, plus aucun envoi.
   */
  const mutate = useCallback(
    async (action: Action, date: string, s: Session) => {
      const contractId = cacheRef.current.days?.[date]?.contractId || cacheRef.current.contractId || ''
      if (writingRef.current || pendingRef.current) throw new UcpaApiError('Une opération est déjà en cours.', 409, 'BOOKING_IN_PROGRESS')
      const marker: Pending = { action, date, contractId, sessionId: s.id, name: s.name }
      if (!setPending(marker)) throw new UcpaApiError('Stockage indisponible. Réservez depuis le site UCPA.', 0, 'NO_STORAGE')
      writingRef.current = true
      setWriting(true)
      const previous = (cacheRef.current.receipts ?? []).find((r) => r.date === date && r.sessionId === s.id)?.action
      try {
        await serial(() =>
          call('', { action, contractId, sessionId: s.id, date, expectedSession: { name: s.name, start: s.start, end: s.end }, previousConfirmation: previous }),
        )
      } catch (e) {
        const err = e instanceof UcpaApiError ? e : new UcpaApiError('Réponse incertaine', 0, 'UNKNOWN')
        const definite = ['PLANNING_NOT_READY', 'SESSION_CHANGED', 'SESSION_UNAVAILABLE', 'CONTRACT_UNAVAILABLE', 'BAD_REQUEST', 'BOOKING_REJECTED', 'CANCELLATION_REJECTED', 'BOOKING_IN_PROGRESS', 'UCPA_NOT_CONNECTED', 'RATE_LIMITED']
        if (definite.includes(err.code)) setPending(null)
        if (err.code === 'UCPA_SESSION_EXPIRED' || err.code === 'UCPA_NOT_CONNECTED')
          update((c) => ({ ...c, overview: c.overview && { ...c.overview, account: null } }))
        throw err
      } finally {
        writingRef.current = false
        setWriting(false)
      }
      setPending(null)
      const receipt: Receipt = { action, date, contractId, sessionId: s.id, at: Date.now() }
      update((c) => {
        const day = c.days?.[date]
        const receipts = [...(c.receipts ?? []).filter((r) => !(r.date === date && r.sessionId === s.id)), receipt]
        if (!day) return { ...c, receipts }
        return { ...c, receipts, days: { ...c.days, [date]: applyReceipts(day, receipts).day } }
      })
      // Les places exactes : relues juste après, sans bloquer ni attendre.
      void loadDay(date).catch(() => {})
    },
    [update, setPending, loadDay],
  )

  const days = cache.days ?? {}
  const now = Date.now()
  const mine: (Session & { date: string })[] = Object.values(days)
    .flatMap((d) => d.sessions.filter((s) => s.reserved === true && s.end + 1000 > now).map((s) => ({ ...s, date: d.date })))
    .sort((a, b) => a.start - b.start)
  const tickets = cache.tickets

  return {
    overview: cache.overview,
    overviewLoad,
    connected,
    /** Déjà relié sur ce téléphone, mais la session UCPA a expiré : QR et planning gardés, actions bloquées. */
    expired: !connected && Boolean(tickets?.length || Object.keys(days).length) && Boolean(cache.overview),
    online,
    tickets,
    ticket: cache.ticket ?? 0,
    selectTicket: (i: number) => update((c) => ({ ...c, ticket: i })),
    ticketsAt: cache.ticketsAt,
    ticketsLoad,
    days,
    dayLoad,
    dayError,
    upcomingAt: cache.upcomingAt,
    upcomingLoad,
    contracts: cache.contracts ?? [],
    contractId: cache.contractId ?? '',
    setContract: (id: string) => {
      update((c) => ({ ...c, contractId: id, days: {}, upcomingAt: undefined, receipts: [] }))
      void refreshUpcoming().catch(() => {})
    },
    date: cache.date,
    setDate: (date: string) => update((c) => ({ ...c, date })),
    receipts: cache.receipts ?? [],
    filters,
    setFilters,
    pending,
    clearPending: () => setPending(null),
    writing,
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
