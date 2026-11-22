// Espace UCPA : le billet d'entrée (QR), mes séances et celles de l'autre, le planning pour
// réserver, et les réglages du compte UCPA relié. Données : src/lib/ucpa.ts.
//
// L'expérience reprend celle de « UCPA simplifié » (src/App.tsx, Booking.tsx, Reservations.tsx) :
// jour et filtres collés en haut du planning, filtres d'activités gardés d'un jour et d'une
// ouverture à l'autre, QR et planning consultables hors ligne et après expiration de la session,
// fraîcheur des places affichée, annulation en deux gestes, opération incertaine bloquante.
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { haptic } from '../lib/haptics'
import {
  addDays,
  AVAILABILITY_TTL,
  fresh,
  LAST_DAY,
  parisDay,
  PLACES_VALIDITY,
  RESERVATION_VALIDITY,
  sameSlot,
  SCHEDULE_TTL,
  storageAvailable,
  UPCOMING_TTL,
  type Booking,
  type Session,
  type Ucpa,
  type UcpaApiError,
} from '../lib/ucpa'
import { Chevron } from './icons'
import { NotificationSwitches } from './NotificationSwitches'
import { GearIcon, HeaderButton, ScreenHeader } from './ScreenHeader'
import { SpaceTabs } from './SpaceTabs'
import { Blank, Button, Card, cx, Group, inputClass, Notice, PasswordInput, SectionTitle } from './ui'

export type UcpaTab = 'seances' | 'reserver'

// ───────── Dates (toujours en heure de Paris, celle du centre) ─────────
const ZONE = 'Europe/Paris'
const hour = (ms: number) => new Intl.DateTimeFormat('fr-FR', { timeZone: ZONE, hour: '2-digit', minute: '2-digit' }).format(ms)
/** UCPA donne la dernière seconde d'une séance : elle finit à la seconde suivante. */
const endOf = (s: { end: number }) => s.end + 1000
const fmt = (date: string, o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('fr-FR', { timeZone: ZONE, ...o }).format(Date.parse(`${date}T12:00:00Z`))
const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1)
/** « Aujourd’hui » / « Demain » d'abord, avec la date complète pour vérifier qu'on suit le bon jour. */
function dayLabel(date: string, today = parisDay()) {
  const relative = date === today ? 'Aujourd’hui' : date === addDays(today, 1) ? 'Demain' : ''
  if (relative) return { title: relative, detail: fmt(date, { weekday: 'long', day: 'numeric', month: 'short' }) }
  return { title: cap(fmt(date, { weekday: 'long' })), detail: fmt(date, { day: 'numeric', month: 'long' }) }
}
/** « Demain · mardi 17 nov. », « Jeudi 20 novembre » */
function shortDay(date: string, today = parisDay()) {
  const { title, detail } = dayLabel(date, today)
  return date === today || date === addDays(today, 1) ? `${title} · ${detail}` : `${title} ${detail}`
}

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
const UCPA_SITE = 'https://www.ucpa.com/sport-station/espacepersonnel/paris-19/e-billets'

/** L'heure qui avance : les séances terminées quittent les listes d'elles-mêmes. */
function useNow(ms = 1000) {
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms)
    const v = () => setNow(Date.now())
    document.addEventListener('visibilitychange', v)
    return () => {
      clearInterval(t)
      document.removeEventListener('visibilitychange', v)
    }
  }, [ms])
  return now
}

interface Props {
  ucpa: Ucpa
  tab: UcpaTab
  onTab: (t: UcpaTab) => void
  /** Prénom de l'autre (« votre partenaire » à défaut). */
  other: string
  onSettings: () => void
  /** Vrai quand l'espace est à l'écran (relectures automatiques). */
  visible: boolean
}

export function UcpaSpace({ ucpa, tab, onTab, other, onSettings, visible }: Props) {
  const [reconnecting, setReconnecting] = useState(false)
  const today = parisDay()
  const saved = ucpa.date
  // Jour gardé d'une ouverture à l'autre, ramené à aujourd'hui s'il est passé.
  const date = saved && saved >= today && saved <= addDays(today, LAST_DAY) ? saved : today
  const openDay = (d: string) => {
    if (ucpa.writing || ucpa.pending) return
    ucpa.setDate(d)
    onTab('reserver')
  }
  const gear = (
    <HeaderButton label="Réglages : UCPA" onClick={onSettings}>
      <GearIcon />
    </HeaderButton>
  )

  if (!ucpa.overview && ucpa.overviewLoad !== 'failed' && !ucpa.tickets)
    return (
      <>
        <ScreenHeader title="UCPA" />
        <Card className="flex flex-col gap-3">
          <Blank className="w-2/3" />
          <Blank className="w-1/2" />
        </Card>
      </>
    )

  // Jamais relié sur ce téléphone (ou déconnexion explicite) : formulaire, et les séances de l'autre.
  if ((!ucpa.connected && !ucpa.expired) || reconnecting)
    return (
      <>
        <ScreenHeader title="UCPA" action={gear} />
        <div className="flex flex-col gap-5">
          {ucpa.overviewLoad === 'failed' && !ucpa.overview ? (
            <Notice action="Réessayer" onAction={() => void ucpa.refreshOverview()}>
              {ucpa.online ? 'Impossible de joindre le serveur pour le moment.' : 'Hors ligne : reliez votre compte UCPA une fois le réseau revenu.'}
            </Notice>
          ) : (
            <Connect ucpa={ucpa} compact={reconnecting} onDone={() => setReconnecting(false)} />
          )}
          {reconnecting && (
            <Button variant="secondary" onClick={() => setReconnecting(false)}>
              Retour au QR code
            </Button>
          )}
          {!reconnecting && <PartnerSessions ucpa={ucpa} other={other} />}
        </div>
      </>
    )

  return (
    <SpaceTabs
      title="UCPA"
      onSettings={onSettings}
      tab={tab}
      onTab={(t) => !ucpa.writing && onTab(t)}
      tabs={[
        {
          id: 'seances',
          label: 'Séances',
          node: <Sessions ucpa={ucpa} other={other} onOpenDay={openDay} onReconnect={() => setReconnecting(true)} />,
        },
        {
          id: 'reserver',
          label: 'Réserver',
          bar: <PlannerBar ucpa={ucpa} date={date} />,
          node: <Planner ucpa={ucpa} other={other} date={date} active={visible && tab === 'reserver'} onReconnect={() => setReconnecting(true)} />,
        },
      ]}
    />
  )
}

// ───────── Relier son compte ─────────
function Connect({ ucpa, compact, onDone }: { ucpa: Ucpa; compact?: boolean; onDone?: () => void }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const reconnect = compact || ucpa.expired

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setMsg('')
    const pass = password
    // Le mot de passe quitte le champ tout de suite.
    setPassword('')
    try {
      await ucpa.login(email.trim(), pass)
      onDone?.()
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
            <p className="mt-1 text-sm text-[#5d6770]">Le QR d’accès, la réservation des cours, et les séances de l’autre pour y aller ensemble.</p>
          </div>
          <div className="sk-ticket-cut" />
          <p className="px-5 py-3 text-xs font-semibold tracking-[0.12em] text-[#5d6770] uppercase">Admis · 1 personne</p>
        </div>
      )}
      <Group title={reconnect ? 'Se reconnecter à UCPA' : 'Relier votre compte UCPA'}>
        <form onSubmit={submit} className="flex flex-col gap-3" aria-busy={busy}>
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">E-mail du compte UCPA</span>
            <input
              className={inputClass}
              type="email"
              autoComplete="username"
              inputMode="email"
              maxLength={254}
              required
              disabled={busy}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">Mot de passe UCPA</span>
            <PasswordInput
              className={cx(inputClass, 'w-full')}
              autoComplete="current-password"
              maxLength={1024}
              required
              disabled={busy}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          {msg && (
            <p role="alert" className="text-sm font-medium text-btn">
              {msg}
            </p>
          )}
          <Button type="submit" busy={busy} disabled={!ucpa.online}>
            {reconnect ? 'Se reconnecter' : 'Relier mon compte'}
          </Button>
          {!ucpa.online && <p className="text-sm text-ink-2">Hors ligne : la connexion attendra le retour du réseau.</p>}
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
function Sessions({ ucpa, other, onOpenDay, onReconnect }: { ucpa: Ucpa; other: string; onOpenDay: (date: string) => void; onReconnect: () => void }) {
  return (
    <div className="flex flex-col gap-6">
      {ucpa.expired && <ExpiredNotice ucpa={ucpa} onReconnect={onReconnect} />}
      <TicketCard ucpa={ucpa} />
      <MySessions ucpa={ucpa} other={other} onOpenDay={onOpenDay} />
      <PartnerSessions ucpa={ucpa} other={other} onOpen={onOpenDay} />
    </div>
  )
}

/** Session UCPA expirée : le QR et le planning restent, rien ne s'envoie avant reconnexion. */
function ExpiredNotice({ ucpa, onReconnect }: { ucpa: Ucpa; onReconnect: () => void }) {
  const [busy, setBusy] = useState(false)
  return (
    <div className="flex flex-col gap-2">
      <Notice action="Se reconnecter" onAction={onReconnect}>
        Session UCPA expirée. Le QR et le planning enregistrés restent consultables ; reconnectez-vous pour réserver ou annuler.
      </Notice>
      <Button
        variant="link"
        className="ml-1"
        busy={busy}
        onClick={() => {
          setBusy(true)
          void ucpa.logout().finally(() => setBusy(false))
        }}
      >
        Effacer le QR de cet appareil
      </Button>
    </div>
  )
}

function TicketCard({ ucpa }: { ucpa: Ucpa }) {
  const tickets = ucpa.tickets ?? []
  const index = Math.min(ucpa.ticket, Math.max(0, tickets.length - 1))
  const ticket = tickets[index]
  const now = useNow(60_000)
  const expiredTicket = ticket?.validUntil !== undefined && ticket.validUntil <= now

  if (!ticket) {
    if (ucpa.tickets === undefined && ucpa.ticketsLoad !== 'failed')
      return (
        <div className="sk-ticket" role="status" aria-label="Chargement du QR code…">
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
          {ucpa.online ? 'Impossible de récupérer votre billet pour le moment.' : 'Hors ligne : le QR s’affichera au retour du réseau.'}
        </Notice>
      )
    return (
      <Card>
        <p className="font-medium">Aucun QR disponible</p>
        <p className="mt-1 text-sm text-ink-2">UCPA ne renvoie aucun e-billet valable sur ce compte aujourd’hui.</p>
      </Card>
    )
  }

  return (
    <section aria-label="Billet d’accès" className="flex flex-col gap-2.5">
      {tickets.length > 1 && (
        <select className={inputClass} aria-label="Billet" value={index} onChange={(e) => ucpa.selectTicket(Number(e.target.value))}>
          {tickets.map((t, i) => (
            <option key={t.code} value={i}>
              {[t.label, t.holder].filter(Boolean).join(' · ') || `Billet ${i + 1}`}
            </option>
          ))}
        </select>
      )}
      <div className="sk-ticket" style={{ ['--cut' as string]: 'calc(100% - 2.85rem)' }}>
        <div className="sk-ticket-band flex items-center justify-between gap-3">
          <span className="sk-slash min-w-0 truncate">{ticket.label}</span>
        </div>
        <div className="px-4 pt-4 pb-3">
          <img className="sk-ticket-qr" width={768} height={768} src={ticket.qr} alt={`QR code du billet ${ticket.label}`} />
        </div>
        <div className="sk-ticket-cut" />
        <div className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
          <span className="min-w-0 truncate font-semibold">{ticket.holder}</span>
          {ticket.validUntil !== undefined && (
            <span className={cx('shrink-0 text-[#5d6770]', expiredTicket && 'font-semibold text-[#d53720]')}>
              {expiredTicket
                ? 'Expiré'
                : `Jusqu’au ${new Intl.DateTimeFormat('fr-FR', { timeZone: ZONE, day: 'numeric', month: 'short', year: 'numeric' }).format(ticket.validUntil)}`}
            </span>
          )}
        </div>
      </div>
      {ucpa.ticketsLoad === 'loading' && (
        <p role="status" className="text-center text-xs text-ink-2">
          Actualisation du QR code…
        </p>
      )}
      {ucpa.ticketsLoad === 'failed' && (
        <p className="text-center text-xs text-ink-2">
          {ucpa.online ? 'Billet non actualisé.' : 'Hors ligne.'} Copie gardée sur ce téléphone : elle ne garantit pas que le billet est encore valable.
        </p>
      )}
    </section>
  )
}

function Hours({ s }: { s: { start: number; end: number } }) {
  return (
    <span className="sk-hour">
      {hour(s.start)}
      <span className="block text-xs font-medium text-ink-2">{hour(endOf(s))}</span>
    </span>
  )
}

function SessionLine({ s, sub, aside, onClick, disabled }: { s: { name: string; start: number; end: number }; sub: ReactNode; aside?: ReactNode; onClick?: () => void; disabled?: boolean }) {
  const body = (
    <>
      <Hours s={s} />
      <span className="min-w-0 flex-1">
        <span className="block font-semibold break-words">{s.name}</span>
        <span className="block text-sm text-ink-2">{sub}</span>
      </span>
      {aside}
      {onClick && <Chevron className="text-ink-2" />}
    </>
  )
  return (
    <li>
      {onClick ? (
        <button type="button" disabled={disabled} onClick={onClick} className="flex w-full items-center gap-3 px-4 py-3 text-left active:bg-surface-2 disabled:opacity-60">
          {body}
        </button>
      ) : (
        <div className="flex items-center gap-3 px-4 py-3">{body}</div>
      )}
    </li>
  )
}

/**
 * Mes séances réservées à venir, déduites des jours gardés (lecture des 14 jours, lectures d'un
 * jour, confirmations) : elles s'affichent hors ligne et suivent tout de suite ce qui est fait dans
 * l'app. « Aucune réservation » n'est jamais une supposition : sans lecture des 14 jours de moins
 * de 10 minutes, la liste vide dit qu'elle n'est pas vérifiée. Vérifiée et vide, rien ne s'affiche.
 */
function MySessions({ ucpa, other, onOpenDay }: { ucpa: Ucpa; other: string; onOpenDay: (date: string) => void }) {
  const now = useNow(30_000)
  const today = parisDay(now)
  const sessions = ucpa.mine.filter((s) => endOf(s) > now)
  const partner = ucpa.overview?.partner?.bookings ?? []
  const verified = fresh(ucpa.upcomingAt, UPCOMING_TTL, now)
  const canRead = ucpa.online && ucpa.connected && !ucpa.writing && !ucpa.pending
  const verifying = !verified && (ucpa.upcomingLoad === 'loading' || (canRead && ucpa.upcomingLoad !== 'failed'))
  if (!sessions.length && verified) return null
  return (
    <section aria-busy={verifying}>
      <div className="flex items-baseline justify-between gap-3 px-1.5">
        <SectionTitle>Mes séances réservées</SectionTitle>
        {sessions.length > 0 && (verifying || !verified) && (
          <span role="status" className="text-xs text-ink-2">
            {verifying ? 'Mise à jour…' : 'Non vérifiées'}
          </span>
        )}
      </div>
      {sessions.length ? (
        <Card className="overflow-hidden p-0!">
          <ul className="sk-timetable">
            {sessions.map((s) => (
              <SessionLine
                key={s.id}
                s={s}
                disabled={ucpa.writing}
                onClick={() => onOpenDay(s.date)}
                sub={
                  <span className="inline-flex items-center gap-1 font-semibold text-accent">
                    <Check />
                    {s.start <= now ? 'En cours' : shortDay(s.date, today)}
                  </span>
                }
                aside={partner.some((p) => sameSlot(p, s)) ? <span className="sk-with">Avec {other}</span> : undefined}
              />
            ))}
          </ul>
        </Card>
      ) : (
        <Card className="flex min-h-14 flex-wrap items-center justify-between gap-x-3 gap-y-1 py-3!">
          <span role="status" className="text-sm text-ink-2">
            {verifying
              ? 'Vérification de vos réservations…'
              : !ucpa.online
                ? 'Hors ligne : réservations non vérifiées.'
                : ucpa.upcomingLoad === 'failed'
                  ? 'Impossible de vérifier vos réservations.'
                  : 'Réservations non vérifiées.'}
          </span>
          {!verifying && canRead && (
            <Button variant="link" onClick={() => void ucpa.refreshUpcoming().catch(() => {})}>
              Réessayer
            </Button>
          )}
        </Card>
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
  const now = useNow(30_000)
  const partner = ucpa.overview?.partner
  if (!partner) return null
  const today = parisDay(now)
  const bookings = partner.bookings.filter((b) => endOf(b) > now)
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
              const together = ucpa.mine.some((m) => sameSlot(m, b))
              return (
                <SessionLine
                  key={b.id}
                  s={b}
                  sub={b.start <= now ? 'En cours' : shortDay(b.day, today)}
                  disabled={ucpa.writing}
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

// ───────── Onglet « Réserver » ─────────

/**
 * Barre collée en haut du planning, quel que soit l'état de la liste (chargement, vide, erreur,
 * défilement) : billet (s'il y en a plusieurs), jour avec ses flèches et le calendrier natif,
 * activités à cocher.
 */
function PlannerBar({ ucpa, date }: { ucpa: Ucpa; date: string }) {
  const today = parisDay()
  const max = addDays(today, LAST_DAY)
  const locked = ucpa.writing || Boolean(ucpa.pending)
  const day = dayLabel(date, today)
  const go = (d: string) => {
    if (locked || d < today || d > max) return
    haptic()
    ucpa.setDate(d)
  }
  return (
    <div className="mt-2.5 flex flex-col gap-2">
      {ucpa.contracts.length > 1 && (
        <select className={inputClass} aria-label="Billet de réservation" disabled={locked} value={ucpa.contractId} onChange={(e) => ucpa.setContract(e.target.value)}>
          {ucpa.contracts.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>
      )}
      <div className="grid grid-cols-[44px_minmax(0,1fr)_44px] items-center gap-2">
        <button type="button" aria-label="Jour précédent" disabled={locked || date <= today} onClick={() => go(addDays(date, -1))} className="sk-round size-11! disabled:opacity-35">
          <Chevron dir="left" />
        </button>
        <label className="sk-card relative grid min-h-12 min-w-0 content-center rounded-[14px]! px-2 text-center has-[input:disabled]:opacity-60">
          <span className="block truncate text-[1.02rem] leading-tight font-semibold" aria-live="polite">
            {day.title}
          </span>
          <span className="block truncate text-xs text-ink-2">{day.detail}</span>
          <input
            type="date"
            aria-label="Date"
            className="absolute inset-0 h-full w-full opacity-0"
            min={today}
            max={max}
            value={date}
            disabled={locked}
            required
            onChange={(e) => e.target.value && go(e.target.value)}
          />
        </label>
        <button type="button" aria-label="Jour suivant" disabled={locked || date >= max} onClick={() => go(addDays(date, 1))} className="sk-round size-11! disabled:opacity-35">
          <Chevron />
        </button>
      </div>
      <ActivityFilter ucpa={ucpa} />
    </div>
  )
}

/** « Activités : Toutes » ; s'ouvre sur la liste à cocher (hauteur bornée : la barre collée tient toujours dans l'écran). */
function ActivityFilter({ ucpa }: { ucpa: Ucpa }) {
  const { filters, setFilters } = ucpa
  const names = [...new Set([...filters.known, ...filters.selected])].sort((a, b) => a.localeCompare(b, 'fr'))
  const summary = filters.selected.length ? [...filters.selected].sort((a, b) => a.localeCompare(b, 'fr')).join(', ') : 'Toutes'
  const toggle = (name: string, on: boolean) => setFilters((f) => ({ ...f, selected: on ? [...new Set([...f.selected, name])] : f.selected.filter((x) => x !== name) }))
  return (
    <details className="sk-card group min-w-0 rounded-[14px]!">
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-3 px-3.5 [&::-webkit-details-marker]:hidden">
        <span className="shrink-0 text-xs font-semibold tracking-[0.08em] text-ink-2 uppercase">Activités</span>
        <span className="min-w-0 flex-1 truncate text-right font-semibold text-accent">{summary}</span>
        <Chevron className="rotate-90 text-ink-2 transition-transform group-open:-rotate-90" />
      </summary>
      <fieldset className="grid max-h-[40svh] min-w-0 overflow-y-auto overscroll-contain border-t border-line px-3.5 py-1" disabled={ucpa.writing}>
        <legend className="sr-only">Activités qui m’intéressent</legend>
        {!names.length && <p className="py-2 text-sm text-ink-2">Les activités apparaissent dès qu’un jour est chargé.</p>}
        {names.map((name) => (
          <label key={name} className="flex min-h-11 min-w-0 cursor-pointer items-center gap-3">
            <input type="checkbox" className="size-5 shrink-0 accent-(--color-accent)" checked={filters.selected.includes(name)} onChange={(e) => toggle(name, e.target.checked)} />
            <span className="min-w-0 truncate">{name}</span>
          </label>
        ))}
      </fieldset>
      <div className="border-t border-line p-2">
        <Button variant="secondary" className="min-h-10 w-full text-sm" disabled={ucpa.writing || !filters.selected.length} onClick={() => setFilters((f) => ({ ...f, selected: [] }))}>
          Tout afficher
        </Button>
      </div>
      {!storageAvailable && <p className="px-3.5 pb-2 text-xs text-ink-2">Stockage indisponible : vos filtres ne seront pas conservés.</p>}
    </details>
  )
}

const ARMED_CANCEL = 4000
interface Feedback {
  sessionId: string
  date: string
  phase: 'confirmed' | 'rejected'
  action: 'reserve' | 'cancel'
  message: string
}

function Planner({ ucpa, other, date, active, onReconnect }: { ucpa: Ucpa; other: string; date: string; active: boolean; onReconnect: () => void }) {
  const today = parisDay()
  const entry = ucpa.days[date]
  const now = useNow(1000)
  const [armed, setArmed] = useState<string | null>(null)
  const [sending, setSending] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<Feedback | null>(null)
  const { loadDay, filters, pending } = ucpa
  const loading = ucpa.dayLoad[date] === 'loading'
  const readError = ucpa.dayLoad[date] === 'failed' ? ucpa.dayError[date] : ''
  const canRead = ucpa.online && ucpa.connected && !ucpa.writing && !armed
  const matches = (s: Session) => !filters.selected.length || filters.selected.includes(s.name)

  // Durée de fraîcheur selon ce qui est visible : 60 s si une séance à venir est affichée, sinon 6 h.
  const ttl = entry?.sessions.filter(matches).some((s) => s.start > Date.now()) ? AVAILABILITY_TTL : SCHEDULE_TTL
  const stale = !fresh(entry?.at, ttl)
  const lastAttempt = useRef<{ date: string; at: number }>({ date: '', at: 0 })
  useEffect(() => {
    if (!active || !canRead || loading || !stale) return
    // Après une erreur, pas de relecture automatique en boucle : seulement à la demande (ou après une minute).
    if (lastAttempt.current.date === date && Date.now() - lastAttempt.current.at < AVAILABILITY_TTL) return
    lastAttempt.current = { date, at: Date.now() }
    void loadDay(date).catch(() => {})
  }, [active, canRead, loading, stale, date, loadDay, now])

  // Annuler reste armé 4 s : un second appui confirme, sans boîte de dialogue.
  useEffect(() => {
    if (!armed) return
    const t = setTimeout(() => setArmed(null), ARMED_CANCEL)
    return () => clearTimeout(t)
  }, [armed])
  useEffect(() => {
    setArmed(null)
    setFeedback((f) => (f?.date === date ? f : null))
  }, [date])

  const refresh = () => {
    setArmed(null)
    lastAttempt.current = { date, at: Date.now() }
    void loadDay(date).catch(() => {})
  }

  const blocked = Boolean(pending) || ucpa.writing || !ucpa.online || !ucpa.connected
  const placesCurrent = fresh(entry?.at, PLACES_VALIDITY, now)
  const receipts = ucpa.receipts.filter((r) => r.date === date)
  const canSelect = (s: Session) =>
    s.start > now &&
    s.reserved !== null &&
    (receipts.some((r) => r.sessionId === s.id) || (s.reserved ? s.cancellable || !fresh(entry?.at, RESERVATION_VALIDITY, now) : s.available || !placesCurrent))

  const act = async (s: Session) => {
    if (blocked || !entry) return
    setFeedback(null)
    // Plus réservable d'après une liste ancienne : on vérifie d'abord.
    if (!s.reserved && !s.available) return refresh()
    if (s.reserved && armed !== s.id) {
      haptic()
      setArmed(s.id)
      return
    }
    haptic()
    setArmed(null)
    setSending(s.id)
    const action = s.reserved ? 'cancel' : 'reserve'
    try {
      await (action === 'cancel' ? ucpa.cancel(date, s) : ucpa.reserve(date, s))
      setFeedback({ sessionId: s.id, date, phase: 'confirmed', action, message: action === 'cancel' ? 'Annulée' : 'Réservée' })
    } catch (e) {
      const err = e as UcpaApiError
      // Une réponse incertaine est portée par le marqueur (pending) ; un refus net s'affiche sous la séance.
      if (!ucpa.pending && !/_UNCERTAIN$/.test(err.code) && err.status !== 0 && err.status < 500)
        setFeedback({ sessionId: s.id, date, phase: 'rejected', action, message: err.message })
    } finally {
      setSending(null)
    }
  }

  const live = (entry?.sessions ?? []).filter((s) => endOf(s) > now)
  const rows = live.filter(matches)
  const hidden = live.length - rows.length
  const pendingHere = pending && pending.date === date ? pending : null
  const noAvailability = Boolean(entry) && !ucpa.writing && !pending && !receipts.length && !rows.some((s) => s.available && s.start > now)
  const partner = ucpa.overview?.partner?.bookings ?? []

  const error = !ucpa.online
    ? 'Vous êtes hors ligne. Places non actualisées. Reconnexion nécessaire pour réserver ou annuler.'
    : ucpa.expired
      ? 'Session UCPA expirée. Reconnectez-vous pour réserver.'
      : readError

  // Le marqueur est posé avant l'envoi (il doit survivre à une coupure), mais tant que la
  // requête est en cours le résultat n'est pas incertain : la séance affiche « Envoi… », sans alerte.
  const recovery = pending && !ucpa.writing && (
    <Card className="flex flex-col items-start gap-2 bg-warn!">
      <p role="status" className="text-sm font-medium text-on-soon">
        {pending.action === 'cancel' ? 'Annulation' : 'Réservation'} de {pending.name}
        {pending.date !== date ? ` (${shortDay(pending.date, today).toLowerCase()})` : ''} non confirmée. Vérifiez sur UCPA avant toute nouvelle tentative.
      </p>
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {pendingHere && ucpa.online && ucpa.connected && (
          <Button variant="link" busy={loading} onClick={refresh}>
            Vérifier
          </Button>
        )}
        <a className="sk-btn-link text-sm font-semibold text-accent" href={UCPA_SITE} target="_blank" rel="noopener noreferrer">
          Vérifier sur UCPA
        </a>
      </div>
      <Button variant="secondary" className="min-h-10 text-sm" disabled={ucpa.writing} onClick={() => ucpa.clearPending()}>
        {pending.action === 'cancel' ? 'J’ai vérifié sur UCPA : la séance est toujours réservée' : 'J’ai vérifié sur UCPA : aucune réservation'}
      </Button>
    </Card>
  )

  return (
    <div className="flex flex-col gap-3">
      {(entry || error) && (
        <div className="flex min-h-10 items-center justify-between gap-3 px-1">
          {entry && (
            <p className="flex min-w-0 items-center gap-1 text-sm text-ink-2">
              {!placesCurrent && !receipts.length && <RefreshIcon />}
              {receipts.length ? 'Places à vérifier' : placesCurrent ? 'Places vérifiées' : 'Places à actualiser'} ·{' '}
              {new Intl.DateTimeFormat('fr-FR', { timeZone: ZONE, ...(parisDay(entry.at) === today ? {} : { day: 'numeric', month: 'short' }), hour: '2-digit', minute: '2-digit' }).format(entry.at)}
            </p>
          )}
          {!error && (
            <Button
              variant={!placesCurrent && !loading ? 'primary' : 'secondary'}
              className="ml-auto min-h-9 shrink-0 px-3 text-sm"
              busy={loading}
              disabled={ucpa.writing || !canRead}
              onClick={refresh}
            >
              Actualiser
            </Button>
          )}
        </div>
      )}

      {error && (
        <div className="flex flex-col gap-2">
          <p role="alert" className="px-1 text-sm font-medium text-btn">
            {error}
            {entry ? ' Liste conservée ; places non actualisées.' : ''}
          </p>
          {ucpa.expired ? (
            <Button onClick={onReconnect}>Se reconnecter</Button>
          ) : (
            ucpa.online && (
              <Button variant="secondary" busy={loading} disabled={ucpa.writing} onClick={refresh}>
                Réessayer
              </Button>
            )
          )}
        </div>
      )}

      {!entry && loading && (
        <Card className="flex flex-col gap-4" aria-busy>
          <p role="status" className="sr-only">
            Chargement des séances…
          </p>
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="flex items-center gap-3">
              <Blank className="w-10" />
              <Blank className="w-1/2" />
            </div>
          ))}
        </Card>
      )}

      {recovery && (!pendingHere || !rows.some((s) => s.id === pendingHere.sessionId)) && recovery}

      {hidden > 0 && (
        <Card className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-4! py-1.5!">
          <p role="status" className="py-1.5 text-sm text-ink-2">
            {hidden} séance{hidden > 1 ? 's' : ''} masquée{hidden > 1 ? 's' : ''} par vos filtres
          </p>
          <Button variant="link" disabled={ucpa.writing} onClick={() => ucpa.setFilters((f) => ({ ...f, selected: [] }))}>
            Tout afficher
          </Button>
        </Card>
      )}

      {rows.length > 0 && (
        <Card className="overflow-hidden p-0!">
          <ul className="sk-timetable">
            {rows.map((s) => (
              <PlanRow
                key={s.id}
                s={s}
                now={now}
                armed={armed === s.id}
                sending={sending === s.id}
                uncertain={pendingHere?.sessionId === s.id && sending !== s.id}
                receipt={receipts.find((r) => r.sessionId === s.id)?.action}
                feedback={feedback?.sessionId === s.id && feedback.date === date ? feedback : null}
                placesCurrent={placesCurrent}
                selectable={canSelect(s)}
                disabled={blocked || !entry}
                withOther={partner.some((p) => sameSlot(p, s)) ? other : undefined}
                recovery={pendingHere?.sessionId === s.id ? recovery : null}
                onAct={() => void act(s)}
              />
            ))}
          </ul>
        </Card>
      )}

      {entry && noAvailability && (
        <p className="py-4 text-center text-sm text-ink-2">{hidden ? 'Aucune séance réservable avec vos filtres à cette date.' : 'Aucune séance réservable à cette date.'}</p>
      )}
      {entry && noAvailability && date === today && (
        <Button disabled={ucpa.writing || Boolean(pending)} onClick={() => ucpa.setDate(addDays(today, 1))}>
          Voir les séances de demain
        </Button>
      )}
    </div>
  )
}

function PlanRow({
  s,
  now,
  armed,
  sending,
  uncertain,
  receipt,
  feedback,
  placesCurrent,
  selectable,
  disabled,
  withOther,
  recovery,
  onAct,
}: {
  s: Session
  now: number
  armed: boolean
  sending: boolean
  uncertain: boolean
  receipt?: 'reserve' | 'cancel'
  feedback: Feedback | null
  placesCurrent: boolean
  selectable: boolean
  disabled: boolean
  withOther?: string
  recovery: ReactNode
  onAct: () => void
}) {
  const started = s.start <= now
  const reserved = s.reserved === true
  const cancelled = !reserved && (receipt === 'cancel' || (feedback?.phase === 'confirmed' && feedback.action === 'cancel'))
  // Une confirmation ou une opération incertaine n'a pas de nombre de places à elle ; un ancien nombre reste, marqué.
  const counted = !receipt && !uncertain
  const stalePlaces = counted && !placesCurrent
  const places = !counted ? 'Places à vérifier' : !s.stock ? 'Complet' : `${s.stock} place${s.stock === 1 ? '' : 's'} restante${s.stock === 1 ? '' : 's'}`
  const status = reserved ? 'Réservée' : cancelled ? 'Annulée' : ''
  // Le bouton dit déjà « À vérifier », « En cours » ou « Complet » : pas de seconde ligne qui le répète.
  // Une séance réservée garde ses places jusqu'à son début : quelqu'un peut-il encore venir ?
  const showPlaces = !uncertain && (reserved ? !started : cancelled || (!started && (places !== 'Complet' || stalePlaces)))
  const label = uncertain
    ? 'À vérifier'
    : started
      ? 'En cours'
      : reserved
        ? selectable
          ? armed
            ? 'Confirmer ?'
            : 'Annuler'
          : 'Non annulable'
        : !s.available && selectable
          ? 'Vérifier'
          : !s.stock
            ? 'Complet'
            : s.available
              ? 'Réserver'
              : 'Indisponible'
  const variant = sending || uncertain ? 'secondary' : armed ? 'primary' : !reserved && s.available && selectable ? 'primary' : reserved && selectable ? 'outline' : 'secondary'
  const cal = reserved && !sending && !uncertain && !started ? calendarLink(s) : null
  return (
    <li
      data-state={sending ? 'sending' : uncertain ? 'uncertain' : reserved ? 'reserved' : cancelled ? 'cancelled' : 'open'}
      className={cx(
        'px-4 py-3',
        reserved && !uncertain && 'bg-[color-mix(in_srgb,var(--color-flow-1),transparent_50%)]',
        uncertain && 'bg-[color-mix(in_srgb,var(--color-warn),transparent_30%)]',
      )}
    >
      <div className="flex items-center gap-3">
        <Hours s={s} />
        <span className="min-w-0 flex-1">
          <span className="block font-semibold break-words">{s.name}</span>
          {(status || showPlaces || withOther) && (
            <span className="mt-0.5 flex flex-col items-start gap-y-1 text-[0.82rem]">
              {status && (
                <span className={cx('inline-flex items-center gap-1 font-semibold', reserved ? 'text-accent' : 'text-ink-2')}>
                  {reserved && <Check />}
                  {status}
                </span>
              )}
              {showPlaces && <Places stale={stalePlaces}>{places}</Places>}
              {withOther && <span className="sk-with">{withOther} y va</span>}
            </span>
          )}
        </span>
        <Button
          variant={variant}
          className={cx('min-h-10 min-w-[6.6rem] shrink-0 px-3 text-sm whitespace-nowrap', armed && 'bg-ink! text-bg!')}
          busy={sending}
          disabled={!selectable || disabled || uncertain}
          aria-label={sending ? 'Envoi en cours' : reserved && selectable ? (armed ? 'Confirmer l’annulation' : 'Annuler la réservation') : undefined}
          onClick={onAct}
        >
          {label}
        </Button>
      </div>
      {cal && (
        <a {...cal} rel="noopener" className="mt-1 ml-[4.35rem] inline-flex min-h-9 items-center gap-1.5 text-sm font-semibold text-accent" aria-label={`Ajouter ${s.name} de ${hour(s.start)} au calendrier`}>
          <CalendarPlus />
          Ajouter au calendrier
        </a>
      )}
      {feedback?.phase === 'rejected' && (
        <p role="alert" className="mt-2 ml-[4.35rem] text-sm font-medium text-btn">
          {feedback.message}
        </p>
      )}
      {recovery && <div className="mt-2">{recovery}</div>}
    </li>
  )
}

/** Places lues il y a plus de 5 minutes : toujours affichées, à part, avec la marque d'actualisation. */
function Places({ stale, children }: { stale: boolean; children: string }) {
  if (!stale) return <span className="text-ink-2">{children}</span>
  return (
    <span className="inline-flex items-center gap-1 rounded-sm bg-surface-2 px-1.5 text-ink-2">
      <RefreshIcon />
      {children}
      <span className="sr-only"> (à actualiser)</span>
    </span>
  )
}
function RefreshIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-3.5 shrink-0 fill-none stroke-current stroke-[2.4]" aria-hidden="true">
      <path d="M20 12a8 8 0 1 1-2.35-5.65L20 8.5M20 4v4.5h-4.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
function CalendarPlus() {
  return (
    <svg viewBox="0 0 24 24" className="size-[1.1rem] shrink-0 fill-none stroke-current stroke-2" aria-hidden="true">
      <path d="M8 3v3M16 3v3M4 9h16M12 13v5M9.5 15.5h5M5 5.5h14a1 1 0 0 1 1 1V19a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6.5a1 1 0 0 1 1-1z" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
function Check() {
  return (
    <svg viewBox="0 0 24 24" className="size-4 shrink-0 fill-none stroke-current stroke-[2.6]" aria-hidden="true">
      <path d="M5 12.5l4.5 4.5L19 7.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
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
      setMsg(
        confirmed
          ? 'Déconnecté. Le QR et le planning ont été effacés de ce téléphone.'
          : 'Déconnecté de l’app, QR et planning effacés. UCPA n’a pas confirmé la fermeture de sa session : elle expirera d’elle-même.',
      )
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
            <div className="mt-3 flex flex-col gap-2">
              <Button
                variant="secondary"
                busy={ucpa.ticketsLoad === 'loading'}
                disabled={ucpa.writing || !ucpa.online}
                onClick={() => void ucpa.refreshTickets().catch(() => {})}
              >
                Actualiser les billets
              </Button>
              <Button variant="outline" busy={busy} disabled={ucpa.writing || Boolean(ucpa.pending)} onClick={() => void logout()}>
                Se déconnecter d’UCPA
              </Button>
            </div>
            {ucpa.pending && !ucpa.writing && <p className="mt-2 text-sm text-ink-2">Une opération reste à vérifier dans « Réserver » avant de se déconnecter.</p>}
            {msg && <p className="mt-2 text-sm text-ink-2">{msg}</p>}
          </Group>
        ) : (
          <>
            {msg && <p className="px-1.5 text-sm text-ink-2">{msg}</p>}
            <Connect ucpa={ucpa} compact />
            {ucpa.expired && (
              <Button variant="link" className="ml-1.5" onClick={() => void ucpa.logout()}>
                Effacer le QR de cet appareil
              </Button>
            )}
          </>
        )}
        <NotificationSwitches items={[{ kind: 'sport', label: `Quand ${other} réserve ou annule une séance` }]} />
        <Group title="Confidentialité">
          <p className="text-sm text-ink-2">
            Votre mot de passe UCPA n’est jamais enregistré. La session UCPA est chiffrée sur le serveur et ne revient jamais sur le téléphone. Le QR et le
            planning sont gardés sur ce téléphone pour s’afficher hors ligne. {cap(other)} voit le nom et l’horaire de vos séances à venir, rien d’autre. Se
            déconnecter efface tout cela.
          </p>
        </Group>
      </div>
    </>
  )
}
