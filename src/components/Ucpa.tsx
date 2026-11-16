// Espace UCPA : le billet d'entrée (QR), mes séances et celles de l'autre, le planning pour
// réserver, et les réglages du compte UCPA relié. Données : src/lib/ucpa.ts.
import { Toggle } from '@base-ui/react/toggle'
import { ToggleGroup } from '@base-ui/react/toggle-group'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { haptic } from '../lib/haptics'
import { addDays, parisDay, sameSlot, UcpaApiError, type Booking, type Session, type Ucpa } from '../lib/ucpa'
import { Chevron } from './icons'
import { NotificationSwitches } from './NotificationSwitches'
import { GearIcon, HeaderButton, ScreenHeader } from './ScreenHeader'
import { SpaceTabs } from './SpaceTabs'
import { Blank, Button, Card, cx, Group, inputClass, Notice, SectionTitle } from './ui'

export type UcpaTab = 'seances' | 'reserver'

// ───────── Dates (toujours en heure de Paris, celle du centre) ─────────
const ZONE = 'Europe/Paris'
const hour = (ms: number) => new Intl.DateTimeFormat('fr-FR', { timeZone: ZONE, hour: '2-digit', minute: '2-digit' }).format(ms)
/** UCPA donne la dernière seconde d'une séance : elle finit à la seconde suivante. */
const endOf = (s: { end: number }) => s.end + 1000
const fmt = (date: string, o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('fr-FR', { timeZone: ZONE, ...o }).format(Date.parse(`${date}T12:00:00Z`))
const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1)
/** « Aujourd’hui », « Demain », « Jeudi 20 nov. » */
function dayName(date: string, today = parisDay()) {
  if (date === today) return 'Aujourd’hui'
  if (date === addDays(today, 1)) return 'Demain'
  return cap(fmt(date, { weekday: 'long', day: 'numeric', month: 'short' }))
}
const LAST_DAY = 90

// ───────── Ajout au calendrier du téléphone (repris de « UCPA simplifié ») ─────────
const CENTRE = 'UCPA Sport Station Paris 19, 28 allée Rose Dieng-Kuntz, 75019 Paris'
const utc = (ms: number) => new Date(ms).toISOString().replace(/[-:]|\.\d{3}/g, '')
function calendarLink(s: { id: string; name: string; start: number; end: number }): { href: string; target?: string } {
  const end = endOf(s)
  if (!/android/i.test(navigator.userAgent)) {
    const path = `/api/ucpa?${new URLSearchParams({ view: 'calendar', id: s.id, name: s.name, start: String(s.start), end: String(end) })}`
    // App installée sur iPhone : son navigateur intégré affiche une page blanche pour ce fichier ; Safari, lui, propose de l'ajouter.
    return (navigator as Navigator & { standalone?: boolean }).standalone
      ? { href: `x-safari-${location.protocol.slice(0, -1)}://${location.host}${path}` }
      : { href: path, target: '_blank' }
  }
  const web = `https://calendar.google.com/calendar/r/eventedit?${new URLSearchParams({ text: `${s.name} · UCPA`, dates: `${utc(s.start)}/${utc(end)}`, ctz: ZONE, location: CENTRE })}`
  return { href: `intent://${web.slice('https://'.length)}#Intent;scheme=https;package=com.google.android.calendar;S.browser_fallback_url=${encodeURIComponent(web)};end` }
}

interface Props {
  ucpa: Ucpa
  tab: UcpaTab
  onTab: (t: UcpaTab) => void
  /** Prénom de l'autre (« votre partenaire » à défaut). */
  other: string
  onSettings: () => void
}

export function UcpaSpace({ ucpa, tab, onTab, other, onSettings }: Props) {
  const [day, setDay] = useState(() => parisDay())
  const openDay = (date: string) => {
    setDay(date)
    onTab('reserver')
  }

  if (!ucpa.overview && ucpa.overviewLoad !== 'failed')
    return (
      <>
        <ScreenHeader title="UCPA" />
        <Card className="flex flex-col gap-3">
          <Blank className="w-2/3" />
          <Blank className="w-1/2" />
        </Card>
      </>
    )

  if (!ucpa.connected)
    return (
      <>
        <ScreenHeader
          title="UCPA"
          action={
            <HeaderButton label="Réglages : UCPA" onClick={onSettings}>
              <GearIcon />
            </HeaderButton>
          }
        />
        <div className="flex flex-col gap-5">
          {ucpa.overviewLoad === 'failed' && !ucpa.overview ? (
            <Notice action="Réessayer" onAction={() => void ucpa.refreshOverview()}>
              Impossible de joindre le serveur pour le moment.
            </Notice>
          ) : (
            <Connect ucpa={ucpa} />
          )}
          <PartnerSessions ucpa={ucpa} other={other} onOpen={undefined} />
        </div>
      </>
    )

  return (
    <SpaceTabs
      title="UCPA"
      onSettings={onSettings}
      tab={tab}
      onTab={onTab}
      tabs={[
        { id: 'seances', label: 'Séances', node: <Sessions ucpa={ucpa} other={other} onOpenDay={openDay} /> },
        { id: 'reserver', label: 'Réserver', node: <Planner ucpa={ucpa} other={other} day={day} onDay={setDay} /> },
      ]}
    />
  )
}

// ───────── Relier son compte ─────────
function Connect({ ucpa, compact }: { ucpa: Ucpa; compact?: boolean }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const expired = ucpa.error?.code === 'UCPA_SESSION_EXPIRED'

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setMsg('')
    try {
      await ucpa.login(email.trim(), password)
      setPassword('')
    } catch (err) {
      setMsg((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="flex flex-col gap-3">
      {!compact && (
        <div className="sk-ticket" style={{ ['--cut' as string]: 'calc(100% - 2.6rem)' }}>
          <div className="sk-ticket-band">
            <span className="sk-slash">Sport Station · Paris 19</span>
          </div>
          <div className="px-5 pt-4 pb-6">
            <p className="text-lg font-semibold">Votre billet, vos séances, à deux</p>
            <p className="mt-1 text-sm text-[#5d6770]">
              Le QR d’accès, la réservation des cours, et les séances de l’autre pour y aller ensemble.
            </p>
          </div>
          <div className="sk-ticket-cut" />
          <p className="px-5 py-3 text-xs font-semibold tracking-[0.12em] text-[#5d6770] uppercase">Admis · 1 personne</p>
        </div>
      )}
      <Group title={expired ? 'Session UCPA expirée' : 'Relier votre compte UCPA'}>
        <form onSubmit={submit} className="flex flex-col gap-3">
          {expired && <p className="text-sm text-ink-2">UCPA a fermé la session. Reconnectez-vous pour réserver et voir votre QR à jour.</p>}
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">E-mail du compte UCPA</span>
            <input
              className={inputClass}
              type="email"
              autoComplete="username"
              inputMode="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">Mot de passe UCPA</span>
            <input
              className={inputClass}
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          {msg && <p className="text-sm font-medium text-btn">{msg}</p>}
          <Button type="submit" busy={busy}>
            {expired ? 'Se reconnecter' : 'Relier mon compte'}
          </Button>
          <p className="text-xs text-ink-2">
            Votre mot de passe sert une seule fois, à la connexion : il n’est enregistré nulle part. Seule la session UCPA est gardée, chiffrée sur le
            serveur, 30 jours au plus. Votre partenaire voit seulement le nom et l’horaire de vos séances.
          </p>
        </form>
      </Group>
    </section>
  )
}

// ───────── Onglet « Séances » : billet, mes séances, celles de l'autre ─────────
function Sessions({ ucpa, other, onOpenDay }: { ucpa: Ucpa; other: string; onOpenDay: (date: string) => void }) {
  return (
    <div className="flex flex-col gap-6">
      <TicketCard ucpa={ucpa} />
      <MySessions ucpa={ucpa} other={other} onOpenDay={onOpenDay} />
      <PartnerSessions ucpa={ucpa} other={other} onOpen={onOpenDay} />
    </div>
  )
}

function TicketCard({ ucpa }: { ucpa: Ucpa }) {
  const tickets = ucpa.tickets ?? []
  const [index, setIndex] = useState(0)
  const ticket = tickets[Math.min(index, tickets.length - 1)]
  const expiredTicket = ticket?.validUntil !== undefined && ticket.validUntil <= Date.now()

  if (!ticket) {
    if (ucpa.tickets === undefined && ucpa.ticketsLoad !== 'failed')
      return (
        <div className="sk-ticket">
          <div className="sk-ticket-band">
            <span className="sk-slash">Mon e-billet</span>
          </div>
          <div className="grid place-items-center p-6">
            <div className="sk-ticket-qr animate-[pulse-soft_1.4s_ease-in-out_infinite] bg-[#eeedf2]!" />
          </div>
        </div>
      )
    if (ucpa.ticketsLoad === 'failed' && ucpa.tickets === undefined)
      return (
        <Notice action="Réessayer" onAction={() => void ucpa.refreshTickets().catch(() => {})}>
          Impossible de récupérer votre billet pour le moment.
        </Notice>
      )
    return (
      <Card>
        <p className="font-medium">Aucun billet actif</p>
        <p className="mt-1 text-sm text-ink-2">UCPA ne renvoie aucun e-billet valable sur ce compte aujourd’hui.</p>
      </Card>
    )
  }

  return (
    <section aria-label="Billet d’accès" className="flex flex-col gap-2.5">
      <div className="sk-ticket" style={{ ['--cut' as string]: 'calc(100% - 2.85rem)' }}>
        <div className="sk-ticket-band flex items-center justify-between gap-3">
          <span className="sk-slash min-w-0 truncate">{ticket.label}</span>
        </div>
        <div className="px-6 pt-5 pb-4">
          <img className="sk-ticket-qr" src={ticket.qr} alt={`QR code du billet ${ticket.label}`} />
        </div>
        <div className="sk-ticket-cut" />
        <div className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
          <span className="min-w-0 truncate font-semibold">{ticket.holder}</span>
          {ticket.validUntil !== undefined && (
            <span className={cx('shrink-0 text-[#5d6770]', expiredTicket && 'font-semibold text-[#d53720]')}>
              {expiredTicket ? 'Expiré' : `Jusqu’au ${new Intl.DateTimeFormat('fr-FR', { timeZone: ZONE, day: 'numeric', month: 'short', year: 'numeric' }).format(ticket.validUntil)}`}
            </span>
          )}
        </div>
      </div>
      {tickets.length > 1 && (
        <div className="flex flex-wrap justify-center gap-2">
          {tickets.map((t, i) => (
            <Button key={t.code} variant={i === index ? 'primary' : 'secondary'} className="sk-chip" onClick={() => setIndex(i)}>
              {t.holder || t.label}
            </Button>
          ))}
        </div>
      )}
      {ucpa.ticketsLoad === 'failed' && <p className="text-center text-xs text-ink-2">Copie gardée sur ce téléphone : elle ne garantit pas que le billet est encore valable.</p>}
    </section>
  )
}

function SessionLine({ s, aside, onClick }: { s: { name: string; start: number; end: number; day?: string; date?: string }; aside?: ReactNode; onClick?: () => void }) {
  const date = s.day ?? s.date ?? parisDay(s.start)
  const started = s.start <= Date.now()
  const body = (
    <>
      <span className="sk-hour text-[0.95rem]">
        {hour(s.start)}
        <span className="block text-xs font-medium text-ink-2">{hour(endOf(s))}</span>
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-semibold">{s.name}</span>
        <span className="block text-sm text-ink-2">{started ? 'En cours' : dayName(date)}</span>
      </span>
      {aside}
      {onClick && <Chevron className="text-ink-2" />}
    </>
  )
  return (
    <li>
      {onClick ? (
        <button type="button" onClick={onClick} className="flex w-full items-center gap-3 px-4 py-3 text-left active:bg-surface-2">
          {body}
        </button>
      ) : (
        <div className="flex items-center gap-3 px-4 py-3">{body}</div>
      )}
    </li>
  )
}

function MySessions({ ucpa, other, onOpenDay }: { ucpa: Ucpa; other: string; onOpenDay: (date: string) => void }) {
  const partner = ucpa.overview?.partner?.bookings ?? []
  const checked = ucpa.upcomingAt !== undefined
  return (
    <section>
      <SectionTitle className="pl-1.5">Mes séances</SectionTitle>
      {ucpa.mine.length ? (
        <Card className="overflow-hidden p-0!">
          <ul className="sk-timetable">
            {ucpa.mine.map((s) => (
              <SessionLine
                key={s.id}
                s={s}
                onClick={() => onOpenDay(s.date)}
                aside={partner.some((p) => sameSlot(p, s)) ? <span className="sk-with">Avec {other}</span> : undefined}
              />
            ))}
          </ul>
        </Card>
      ) : !checked ? (
        <p className="px-1.5 text-sm text-ink-2">
          {ucpa.upcomingLoad === 'failed' ? 'Impossible de vérifier vos réservations.' : 'Vérification de vos réservations…'}
        </p>
      ) : (
        <Card className="flex items-center justify-between gap-3">
          <span className="text-sm text-ink-2">Aucune séance réservée dans les 14 prochains jours.</span>
          <Button variant="secondary" className="shrink-0" onClick={() => onOpenDay(parisDay())}>
            Réserver
          </Button>
        </Card>
      )}
      {ucpa.upcomingLoad === 'failed' && (
        <Button variant="link" className="mt-1 ml-1.5" onClick={() => void ucpa.refreshUpcoming().catch(() => {})}>
          Réessayer
        </Button>
      )}
    </section>
  )
}

const ago = (ms: number) => {
  const min = Math.round((Date.now() - ms) / 60_000)
  if (min < 1) return 'à l’instant'
  if (min < 60) return `il y a ${min} min`
  const h = Math.round(min / 60)
  if (h < 24) return `il y a ${h} h`
  return `le ${new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' }).format(ms)}`
}

/** Les séances de l'autre (gardées sur le serveur, à jour de sa dernière ouverture de l'espace). */
function PartnerSessions({ ucpa, other, onOpen }: { ucpa: Ucpa; other: string; onOpen?: (date: string) => void }) {
  const partner = ucpa.overview?.partner
  if (!partner) return null
  const bookings = partner.bookings.filter((b) => b.end > Date.now())
  const mine = ucpa.mine
  const join = (b: Booking) => onOpen?.(b.day)
  return (
    <section>
      <SectionTitle className="pl-1.5">Séances de {other}</SectionTitle>
      {!partner.connected ? (
        <Card>
          <p className="text-sm text-ink-2">
            {cap(other)} n’a pas encore relié son compte UCPA. Dès que ce sera fait, ses séances apparaîtront ici et vous serez prévenu à chaque réservation.
          </p>
        </Card>
      ) : bookings.length ? (
        <Card className="overflow-hidden p-0!">
          <ul className="sk-timetable">
            {bookings.map((b) => {
              const together = mine.some((m) => sameSlot(m, b))
              return (
                <SessionLine
                  key={b.id}
                  s={b}
                  onClick={onOpen && (() => join(b))}
                  aside={together ? <span className="sk-with">Vous aussi</span> : onOpen ? <span className="text-sm font-semibold text-accent">Rejoindre</span> : undefined}
                />
              )
            })}
          </ul>
        </Card>
      ) : (
        <Card>
          <p className="text-sm text-ink-2">Aucune séance prévue pour le moment.</p>
        </Card>
      )}
      {partner.connected && partner.syncedAt && <p className="mt-1.5 px-1.5 text-xs text-ink-2">Mis à jour {ago(partner.syncedAt)}</p>}
    </section>
  )
}

// ───────── Onglet « Réserver » : le planning d'un jour ─────────
const FILTER_KEY = 'ucpa-filtres'
function readFilter(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(FILTER_KEY) ?? '[]')
    return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : []
  } catch {
    return []
  }
}

function without<T>(map: Record<string, T>, id: string) {
  const next = { ...map }
  delete next[id]
  return next
}

interface RowState {
  phase: 'sending' | 'armed' | 'done' | 'error' | 'uncertain'
  message?: string
}

function Planner({ ucpa, other, day, onDay }: { ucpa: Ucpa; other: string; day: string; onDay: (d: string) => void }) {
  const today = parisDay()
  const date = day < today ? today : day
  const entry = ucpa.days[date]
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [filter, setFilter] = useState<string[]>(readFilter)
  const [rows, setRows] = useState<Record<string, RowState>>({})
  const [, setNow] = useState(Date.now())
  const busy = Object.values(rows).some((r) => r.phase === 'sending')
  const armTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Les séances terminées disparaissent d'elles-mêmes.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(t)
  }, [])

  // Le jour affiché : relu s'il n'est pas en cache, ou si ses places ont plus d'une minute.
  const { loadDay } = ucpa
  const at = entry?.at
  useEffect(() => {
    if (busy) return
    if (at && Date.now() - at < 60_000) return
    let live = true
    setLoading(true)
    setLoadError(null)
    loadDay(date)
      .catch((e: UcpaApiError) => live && setLoadError(e.message))
      .finally(() => live && setLoading(false))
    return () => {
      live = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, loadDay])

  const pick = (v: string[]) => {
    setFilter(v)
    try {
      localStorage.setItem(FILTER_KEY, JSON.stringify(v))
    } catch {
      /* rien */
    }
  }

  const now = Date.now()
  const sessions = (entry?.sessions ?? []).filter((s) => endOf(s) > now)
  const names = [...new Set((entry?.sessions ?? []).map((s) => s.name))].sort((a, b) => a.localeCompare(b, 'fr'))
  const active = filter.filter((f) => names.includes(f))
  const shown = active.length ? sessions.filter((s) => active.includes(s.name)) : sessions
  const partner = ucpa.overview?.partner?.bookings ?? []
  const stale = entry && now - entry.at > 5 * 60_000

  const go = (n: number) => {
    const next = addDays(date, n)
    if (next < today || next > addDays(today, LAST_DAY)) return
    haptic()
    onDay(next)
  }

  const setRow = (id: string, r: RowState | null) =>
    setRows((all) => {
      const next = { ...all }
      if (r) next[id] = r
      else delete next[id]
      return next
    })

  const act = async (s: Session) => {
    const cancelling = s.reserved === true
    // Annuler demande un second appui sur le même bouton (4 s), pour ne pas annuler en faisant défiler.
    if (cancelling && rows[s.id]?.phase !== 'armed') {
      haptic()
      setRow(s.id, { phase: 'armed' })
      if (armTimer.current) clearTimeout(armTimer.current)
      armTimer.current = setTimeout(() => setRows((all) => (all[s.id]?.phase === 'armed' ? without(all, s.id) : all)), 4000)
      return
    }
    haptic()
    setRow(s.id, { phase: 'sending' })
    try {
      await (cancelling ? ucpa.cancel(date, s) : ucpa.reserve(date, s))
      setRow(s.id, { phase: 'done', message: cancelling ? 'Annulée' : 'Réservée' })
      setTimeout(() => setRows((all) => (all[s.id]?.phase === 'done' ? without(all, s.id) : all)), 2500)
    } catch (e) {
      const err = e as UcpaApiError
      const uncertain = /_UNCERTAIN$/.test(err.code) || err.status === 0
      setRow(s.id, { phase: uncertain ? 'uncertain' : 'error', message: uncertain ? `${err.message} Vérifiez avant de réessayer.` : err.message })
    }
  }

  const verify = async (id: string) => {
    setRow(id, { phase: 'sending' })
    try {
      await loadDay(date)
      setRow(id, null)
    } catch (e) {
      setRow(id, { phase: 'uncertain', message: (e as Error).message })
    }
  }

  const label = dayName(date, today)
  return (
    <div className="flex flex-col gap-4">
      <Card className="flex items-center gap-2 p-2!">
        <button type="button" aria-label="Jour précédent" disabled={date <= today || busy} onClick={() => go(-1)} className="sk-round disabled:opacity-35">
          <Chevron dir="left" />
        </button>
        <label className="relative flex min-w-0 flex-1 flex-col items-center">
          <span className="font-semibold">{label}</span>
          <span className="text-xs text-ink-2">{date === today || date === addDays(today, 1) ? fmt(date, { weekday: 'long', day: 'numeric', month: 'long' }) : 'Choisir un jour'}</span>
          <input
            type="date"
            aria-label="Choisir le jour"
            className="absolute inset-0 opacity-0"
            min={today}
            max={addDays(today, LAST_DAY)}
            value={date}
            disabled={busy}
            onChange={(e) => e.target.value && onDay(e.target.value)}
          />
        </label>
        <button type="button" aria-label="Jour suivant" disabled={date >= addDays(today, LAST_DAY) || busy} onClick={() => go(1)} className="sk-round disabled:opacity-35">
          <Chevron />
        </button>
      </Card>

      {names.length > 1 && (
        <ToggleGroup multiple aria-label="Activités" value={active} onValueChange={pick} className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
          {names.map((n) => (
            <Toggle key={n} value={n} disabled={busy} className="sk-key sk-chip shrink-0">
              {n}
            </Toggle>
          ))}
        </ToggleGroup>
      )}

      {loadError && !entry && (
        <Notice action="Réessayer" onAction={() => void loadDay(date).then(() => setLoadError(null), (e: Error) => setLoadError(e.message))}>
          {loadError}
        </Notice>
      )}

      {!entry && !loadError ? (
        <Card className="flex flex-col gap-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="flex items-center gap-3">
              <Blank className="w-10" />
              <Blank className="w-1/2" />
            </div>
          ))}
        </Card>
      ) : entry && !shown.length ? (
        <Card className="flex flex-col items-start gap-3">
          <p className="text-sm text-ink-2">
            {sessions.length ? 'Aucune séance de ces activités ce jour-là.' : entry.sessions.length ? 'Les séances de ce jour sont terminées.' : 'Aucune séance réservable ce jour-là.'}
          </p>
          {active.length > 0 && sessions.length > 0 ? (
            <Button variant="secondary" onClick={() => pick([])}>
              Tout afficher
            </Button>
          ) : (
            date < addDays(today, LAST_DAY) && (
              <Button variant="secondary" onClick={() => go(1)}>
                Voir {dayName(addDays(date, 1), today).toLowerCase()}
              </Button>
            )
          )}
        </Card>
      ) : entry ? (
        <Card className="overflow-hidden p-0!">
          <ul className="sk-timetable">
            {shown.map((s) => (
              <PlanRow
                key={s.id}
                s={s}
                row={rows[s.id]}
                stale={Boolean(stale)}
                withOther={partner.some((p) => sameSlot(p, s)) ? other : undefined}
                disabled={busy && rows[s.id]?.phase !== 'sending'}
                onAct={() => void act(s)}
                onVerify={() => void verify(s.id)}
              />
            ))}
          </ul>
        </Card>
      ) : null}

      {entry && (
        <p className="px-1.5 text-xs text-ink-2">
          {loading ? 'Actualisation…' : stale ? 'Places à actualiser' : 'Places vérifiées'} · lu à {hour(entry.at)}
          {active.length > 0 && shown.length < sessions.length && (
            <>
              {' · '}
              <button type="button" className="font-semibold text-accent" onClick={() => pick([])}>
                {sessions.length - shown.length} masquée{sessions.length - shown.length > 1 ? 's' : ''}
              </button>
            </>
          )}
        </p>
      )}
    </div>
  )
}

function PlanRow({
  s,
  row,
  stale,
  withOther,
  disabled,
  onAct,
  onVerify,
}: {
  s: Session
  row?: RowState
  stale: boolean
  withOther?: string
  disabled: boolean
  onAct: () => void
  onVerify: () => void
}) {
  const started = s.start <= Date.now()
  const reserved = s.reserved === true
  const full = !reserved && s.stock <= 0
  const sending = row?.phase === 'sending'
  const blocked = row?.phase === 'uncertain'
  const cal = reserved && !started ? calendarLink(s) : null
  return (
    <li className={cx('px-4 py-3', reserved && 'bg-[color-mix(in_srgb,var(--color-flow-1),transparent_55%)]')}>
      <div className="flex items-center gap-3">
        <span className="sk-hour">
          {hour(s.start)}
          <span className="block text-xs font-medium text-ink-2">{hour(endOf(s))}</span>
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-semibold">{s.name}</span>
          <span className={cx('flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-ink-2', stale && 'opacity-60')}>
            {started ? 'En cours' : full ? 'Complet' : `${s.stock} place${s.stock > 1 ? 's' : ''}`}
            {withOther && <span className="sk-with">{withOther} y va</span>}
          </span>
        </span>
        <span className="flex shrink-0 flex-col items-end gap-1.5">
          {row?.phase === 'done' ? (
            <span className="sk-stamp">{row.message}</span>
          ) : reserved ? (
            <>
              {!s.cancellable && <span className="sk-stamp">Réservée</span>}
              {s.cancellable && (
                <Button variant={row?.phase === 'armed' ? 'primary' : 'outline'} className="min-h-10 px-3.5 text-sm" busy={sending} disabled={disabled || blocked} onClick={onAct}>
                  {row?.phase === 'armed' ? 'Confirmer ?' : 'Annuler'}
                </Button>
              )}
            </>
          ) : s.available && !started ? (
            <Button className="min-h-10 px-3.5 text-sm" busy={sending} disabled={disabled || blocked} onClick={onAct}>
              Réserver
            </Button>
          ) : null}
        </span>
      </div>
      {reserved && s.cancellable && row?.phase !== 'done' && <span className="sk-stamp mt-2 ml-[4.35rem]">Réservée</span>}
      {cal && row?.phase !== 'sending' && (
        <a {...cal} rel="noopener" className="mt-1.5 ml-[4.35rem] inline-block text-sm font-semibold text-accent">
          Ajouter au calendrier
        </a>
      )}
      {(row?.phase === 'error' || row?.phase === 'uncertain') && (
        <div className="mt-2 ml-[4.35rem] flex flex-col items-start gap-1">
          <p className="text-sm font-medium text-btn">{row.message}</p>
          {row.phase === 'uncertain' && (
            <span className="flex gap-3">
              <Button variant="link" onClick={onVerify}>
                Vérifier
              </Button>
              <a href="https://www.ucpa.com/sport-station/espacepersonnel/paris-19" target="_blank" rel="noopener" className="text-sm font-semibold text-accent">
                Ouvrir UCPA
              </a>
            </span>
          )}
        </div>
      )}
    </li>
  )
}

// ───────── Réglages de l'espace ─────────
export function UcpaSettings({ ucpa, other }: { ucpa: Ucpa; other: string }) {
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const account = ucpa.overview?.account
  const logout = async () => {
    setBusy(true)
    setMsg('')
    try {
      const confirmed = await ucpa.logout()
      setMsg(confirmed ? 'Compte délié. La session UCPA est fermée.' : 'Compte délié de l’app. UCPA n’a pas confirmé la fermeture de sa session : elle expirera d’elle-même.')
    } catch (e) {
      setMsg((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <>
      <ScreenHeader title="Réglages UCPA" />
      <div className="flex flex-col gap-5">
        {account ? (
          <Group title="Compte UCPA">
            <p className="font-semibold">{account.holder || 'Compte relié'}</p>
            <p className="mt-0.5 text-sm text-ink-2">
              Session gardée jusqu’au {new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long' }).format(account.expiresAt)} au plus. UCPA peut la
              fermer avant : il suffira alors de se reconnecter.
            </p>
            {ucpa.contracts.length > 1 && (
              <div className="mt-3 flex flex-col gap-1.5">
                <span className="text-sm font-medium">Billet utilisé pour réserver</span>
                <select className={inputClass} value={ucpa.contractId} onChange={(e) => ucpa.setContract(e.target.value)}>
                  {ucpa.contracts.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <Button variant="outline" className="mt-3 w-full" busy={busy} onClick={() => void logout()}>
              Délier mon compte UCPA
            </Button>
            {msg && <p className="mt-2 text-sm text-ink-2">{msg}</p>}
          </Group>
        ) : (
          <>
            {msg && <p className="px-1.5 text-sm text-ink-2">{msg}</p>}
            <Connect ucpa={ucpa} compact />
          </>
        )}
        <NotificationSwitches items={[{ kind: 'sport', label: `Quand ${other} réserve ou annule une séance` }]} />
        <Group title="Confidentialité">
          <p className="text-sm text-ink-2">
            Votre mot de passe UCPA n’est jamais enregistré. La session UCPA est chiffrée sur le serveur et ne revient jamais sur le téléphone. {cap(other)}{' '}
            voit le nom et l’horaire de vos séances à venir, rien d’autre. Délier le compte efface tout cela.
          </p>
        </Group>
      </div>
    </>
  )
}
