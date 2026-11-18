import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { addDay, eventSpan, type CalEvent, type StoredEvent } from '../../shared/calendar'
import { toDate } from '../../shared/cycles'
import { addToPhoneLink, feedUrl, googleSubscribeUrl, newEventId, webcalUrl, type Calendar } from '../lib/calendar'
import { formatLong, formatMonth } from '../lib/dates'
import { haptic } from '../lib/haptics'
import { turnPage } from '../lib/motion'
import { isIOS } from '../lib/push'
import { Chevron } from './icons'
import { DayInk, InkToday } from './ink'
import { Button, Card, cx, Group, inputClass, Notice, SectionTitle, Sheet, Switch } from './ui'

const WEEKDAYS = ['L', 'M', 'M', 'J', 'V', 'S', 'D']
const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1)
const hm = (t: string) => t.replace(':', 'h')

/** « 20h30 – 22h », « Toute la journée », « Jusqu'au 28 déc. » */
function timeLabel(e: CalEvent, day?: string) {
  if (!e.start_time) {
    if (e.end_day === e.start_day) return 'Toute la journée'
    return `Du ${formatShortDay(e.start_day)} au ${formatShortDay(e.end_day)}`
  }
  const start = day && day !== e.start_day ? 'Suite' : hm(e.start_time)
  if (!e.end_time) return start
  const endDay = e.end_day !== e.start_day && (!day || day !== e.end_day) ? ` (${formatShortDay(e.end_day)})` : ''
  return `${start} – ${hm(e.end_time)}${endDay}`
}
const shortFmt = new Intl.DateTimeFormat('fr-FR', { timeZone: 'UTC', day: 'numeric', month: 'short' })
const formatShortDay = (day: string) => shortFmt.format(toDate(day))

/** Les jours que couvre un événement (au plus 60, pour un long séjour). */
function daysOf(e: CalEvent) {
  const out: string[] = []
  for (let d = e.start_day; d <= e.end_day && out.length < 60; d = addDay(d, 1)) out.push(d)
  return out
}

function dayTitle(day: string, today: string) {
  if (day === today) return `Aujourd’hui · ${formatLong(day)}`
  if (day === addDay(today, 1)) return `Demain · ${formatLong(day)}`
  return cap(formatLong(day))
}

interface Props {
  calendar: Calendar
  today: string
  names: Record<string, string>
  /** Premier chargement, rien en cache. */
  loading?: boolean
  failed?: boolean
}

/**
 * Le calendrier commun : la feuille du mois (un point par événement), les événements du jour
 * touché, puis ce qui arrive. On ajoute d'un appui ; chaque ajout, modification ou suppression
 * prévient l'autre. En bas : s'abonner depuis le calendrier du téléphone (synchro automatique).
 */
export function SharedCalendar({ calendar, today, names, loading, failed }: Props) {
  const { events } = calendar
  const [month, setMonth] = useState(today.slice(0, 7) + '-01')
  const [selected, setSelected] = useState(today)
  const [editing, setEditing] = useState<CalEvent | null>(null)
  const [isNew, setIsNew] = useState(false)
  const [flip, setFlip] = useState<{ from: string; dir: 1 | -1; id: number } | null>(null)
  const flipId = useRef(0)
  const pageRef = useRef<HTMLDivElement>(null)
  const ghostRef = useRef<HTMLDivElement>(null)

  const byDay = useMemo(() => {
    const map = new Map<string, StoredEvent[]>()
    for (const e of events) for (const d of daysOf(e)) map.set(d, [...(map.get(d) ?? []), e])
    return map
  }, [events])

  const upcoming = useMemo(() => events.filter((e) => e.end_day >= today).slice(0, 40), [events, today])
  const upcomingByDay = useMemo(() => {
    const groups: { day: string; events: StoredEvent[] }[] = []
    for (const e of upcoming) {
      const day = e.start_day < today ? today : e.start_day
      const g = groups.find((x) => x.day === day)
      if (g) g.events.push(e)
      else groups.push({ day, events: [e] })
    }
    return groups.sort((a, b) => a.day.localeCompare(b.day))
  }, [upcoming, today])

  const shift = (n: 1 | -1) => {
    const d = toDate(month)
    d.setUTCMonth(d.getUTCMonth() + n)
    haptic()
    setFlip({ from: month, dir: n, id: ++flipId.current })
    setMonth(d.toISOString().slice(0, 10))
  }
  useLayoutEffect(() => {
    if (!flip || !pageRef.current || !ghostRef.current) return
    const id = flip.id
    return turnPage(pageRef.current, ghostRef.current, flip.dir, () => setFlip((f) => (f?.id === id ? null : f)))
  }, [flip])

  const create = (day: string) => {
    haptic()
    setIsNew(true)
    setEditing({ id: newEventId(), title: '', start_day: day, end_day: day, start_time: null, end_time: null, location: null, note: null })
  }
  const open = (e: CalEvent) => {
    setIsNew(false)
    setEditing(e)
  }

  const page = (m: string, ghost: boolean) => (
    <MonthPage month={m} today={today} byDay={byDay} picked={ghost ? null : selected} still={ghost || loading} onPick={setSelected} />
  )
  const dayEvents = byDay.get(selected) ?? []

  return (
    <div className="flex flex-col gap-5 pt-1">
      {failed && <Notice action="Réessayer" onAction={calendar.refresh}>Le calendrier n’a pas pu être chargé. Vérifiez la connexion.</Notice>}
      {calendar.error && <Notice>Une modification a été refusée : {calendar.error}</Notice>}

      <div className="sk-block" aria-busy={loading || undefined}>
        <div className="sk-pages">
          {flip && (
            <div key={flip.id} ref={ghostRef} aria-hidden inert className="sk-page sk-page-ghost" data-dir={flip.dir}>
              {page(flip.from, true)}
              <div data-shade className="sk-page-shade" />
            </div>
          )}
          <div ref={pageRef} className="sk-page">
            {page(month, false)}
            <div data-shade className="sk-page-shade" />
          </div>
        </div>
        <div data-binding-shade aria-hidden className="sk-binding-shade" />
        <div className="absolute top-[26px] right-4 z-[4] flex gap-2">
          <button type="button" className="sk-round" onClick={() => shift(-1)} aria-label="Mois précédent">
            <Chevron dir="left" />
          </button>
          <button type="button" className="sk-round" onClick={() => shift(1)} aria-label="Mois suivant">
            <Chevron />
          </button>
        </div>
      </div>

      <section aria-live="polite">
        <div className="mb-2 flex items-end justify-between gap-3">
          <SectionTitle className="mb-0">{dayTitle(selected, today)}</SectionTitle>
        </div>
        <div className="sk-card">
          {dayEvents.length ? (
            <EventList events={dayEvents} day={selected} names={names} waiting={calendar.waiting} onOpen={open} />
          ) : (
            <p className="px-4 pt-4 pb-1 text-ink-2">Rien de prévu ce jour-là.</p>
          )}
          <div className="px-4 pt-2 pb-4">
            <Button className="w-full" onClick={() => create(selected)}>
              + Ajouter un événement
            </Button>
          </div>
        </div>
      </section>

      <section>
        <SectionTitle>À venir</SectionTitle>
        {upcomingByDay.length ? (
          <div className="flex flex-col gap-3">
            {upcomingByDay.map((g) => (
              <div key={g.day} className="sk-card">
                <button
                  type="button"
                  className="block w-full px-4 pt-3 text-left text-sm font-semibold text-accent"
                  onClick={() => {
                    setSelected(g.day)
                    setMonth(g.day.slice(0, 7) + '-01')
                  }}
                >
                  {dayTitle(g.day, today)}
                </button>
                <EventList events={g.events} day={g.day} names={names} waiting={calendar.waiting} onOpen={open} />
              </div>
            ))}
          </div>
        ) : (
          <p className="px-1 text-ink-2">{loading ? 'Chargement…' : 'Aucun événement à venir. Touchez un jour pour en ajouter un.'}</p>
        )}
      </section>

      <Subscribe token={calendar.feed} />

      <Sheet open={editing !== null} onClose={() => setEditing(null)} title={isNew ? 'Nouvel événement' : 'Événement'}>
        {editing && (
          <EventEditor
            key={editing.id}
            event={editing}
            isNew={isNew}
            token={calendar.feed}
            author={!isNew ? authorOf(events.find((e) => e.id === editing.id), names) : undefined}
            onSave={(e) => {
              haptic()
              calendar.save(e)
              setSelected(e.start_day)
              setMonth(e.start_day.slice(0, 7) + '-01')
              setEditing(null)
            }}
            onDelete={() => {
              calendar.remove(editing.id)
              setEditing(null)
            }}
          />
        )}
      </Sheet>
    </div>
  )
}

function authorOf(e: StoredEvent | undefined, names: Record<string, string>) {
  if (!e) return undefined
  const by = e.updated_by ?? e.created_by
  const name = by ? names[by] : undefined
  if (!name) return undefined
  return e.updated_by && e.created_by && e.updated_by !== e.created_by ? `Modifié par ${name}` : `Ajouté par ${name}`
}

function EventList({
  events,
  day,
  names,
  waiting,
  onOpen,
}: {
  events: StoredEvent[]
  day: string
  names: Record<string, string>
  waiting: Set<string>
  onOpen: (e: StoredEvent) => void
}) {
  return (
    <ul className="sk-list">
      {events.map((e) => {
        const by = e.created_by ? names[e.created_by] : undefined
        return (
          <li key={e.id}>
            <button type="button" onClick={() => onOpen(e)} className="flex min-h-14 w-full items-start gap-3 px-4 py-3 text-left active:bg-surface-2">
              <span aria-hidden className="mt-1.5 size-2.5 shrink-0 rounded-full bg-btn" />
              <span className="min-w-0 flex-1">
                <span className="block font-semibold break-words">{e.title}</span>
                <span className="block text-sm text-ink-2">
                  {timeLabel(e, day)}
                  {e.location && ` · ${e.location}`}
                </span>
                {(by || waiting.has(e.id)) && (
                  <span className="block text-xs text-ink-2">
                    {waiting.has(e.id) ? 'En attente de réseau…' : by === 'vous' ? 'Ajouté par vous' : `Ajouté par ${by}`}
                  </span>
                )}
              </span>
              <Chevron className="mt-1.5 shrink-0 text-ink-2" />
            </button>
          </li>
        )
      })}
    </ul>
  )
}

/** La feuille d'un mois : un point (ou trois au plus) sous le chiffre des jours qui ont un événement. */
function MonthPage({
  month,
  today,
  byDay,
  picked,
  still,
  onPick,
}: {
  month: string
  today: string
  byDay: Map<string, StoredEvent[]>
  picked: string | null
  still?: boolean
  onPick: (day: string) => void
}) {
  const cells = useMemo(() => {
    const offset = (toDate(month).getUTCDay() + 6) % 7
    return Array.from({ length: 42 }, (_, i) => addDay(month, i - offset))
  }, [month])
  return (
    <>
      <div className="sk-cal-head">
        <h2 className="first-letter:uppercase">{formatMonth(month)}</h2>
      </div>
      <div className="sk-cal-grid">
        {WEEKDAYS.map((w, i) => (
          <div key={i} className="sk-cal-week">
            {w}
          </div>
        ))}
      </div>
      <div className="sk-cal-grid pb-3">
        {cells.map((d) => {
          const n = byDay.get(d)?.length ?? 0
          return (
            <button
              key={d}
              type="button"
              onClick={() => {
                haptic()
                onPick(d)
              }}
              aria-label={`${formatLong(d)}${n ? `, ${n} événement${n > 1 ? 's' : ''}` : ''}`}
              className={cx('sk-day', d.slice(0, 7) !== month.slice(0, 7) && 'opacity-35', d === today && 'sk-day-today', d === picked && 'sk-day-picked')}
            >
              {d === today && (
                <DayInk>
                  <InkToday still={still} />
                </DayInk>
              )}
              <span className="relative">{Number(d.slice(8))}</span>
              {n > 0 && (
                <span aria-hidden className="absolute bottom-[14%] left-1/2 flex -translate-x-1/2 gap-[3px]">
                  {Array.from({ length: Math.min(n, 3) }, (_, i) => (
                    <span key={i} className="size-[5px] rounded-full bg-btn" />
                  ))}
                </span>
              )}
            </button>
          )
        })}
      </div>
    </>
  )
}

function EventEditor({
  event,
  isNew,
  token,
  author,
  onSave,
  onDelete,
}: {
  event: CalEvent
  isNew: boolean
  token: string
  author?: string
  onSave: (e: CalEvent) => void
  onDelete: () => void
}) {
  const [title, setTitle] = useState(event.title)
  const [allDay, setAllDay] = useState(!event.start_time)
  const [startDay, setStartDay] = useState(event.start_day)
  const [endDay, setEndDay] = useState(event.end_day)
  const [startTime, setStartTime] = useState(event.start_time ?? '19:00')
  const [endTime, setEndTime] = useState(event.end_time ?? '')
  const [location, setLocation] = useState(event.location ?? '')
  const [note, setNote] = useState(event.note ?? '')
  const [msg, setMsg] = useState('')
  const [armed, setArmed] = useState(false)

  const submit = (ev: React.FormEvent) => {
    ev.preventDefault()
    const end = endDay < startDay ? startDay : endDay
    if (!title.trim()) return setMsg('Donnez un titre à l’événement.')
    if (!allDay && endTime && end === startDay && endTime < startTime) return setMsg('L’heure de fin est avant le début.')
    onSave({
      id: event.id,
      title: title.trim(),
      start_day: startDay,
      end_day: end,
      start_time: allDay ? null : startTime,
      end_time: allDay || !endTime ? null : endTime,
      location: location.trim() || null,
      note: note.trim() || null,
    })
  }

  const label = 'mb-1 block text-sm font-medium text-ink-2'
  const phone = !isNew && token ? addToPhoneLink(event, token, eventSpan(event)) : null

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <label>
        <span className={label}>Titre</span>
        <input
          className={inputClass}
          value={title}
          enterKeyHint="done"
          maxLength={120}
          placeholder="Ex. dîner chez Paul, train pour Lyon…"
          onChange={(e) => setTitle(e.target.value)}
        />
      </label>

      <Card className="py-1">
        <Switch label="Toute la journée" checked={allDay} onChange={setAllDay} />
      </Card>

      <div className="grid grid-cols-2 gap-3">
        <label>
          <span className={label}>{allDay ? 'Du' : 'Le'}</span>
          <input
            type="date"
            required
            className={inputClass}
            value={startDay}
            onChange={(e) => {
              const v = e.target.value
              if (!v) return
              // La fin suit le début (même durée).
              const span = Math.round((toDate(endDay).getTime() - toDate(startDay).getTime()) / 86400_000)
              setStartDay(v)
              setEndDay(addDay(v, Math.max(span, 0)))
            }}
          />
        </label>
        <label>
          <span className={label}>{allDay ? 'Au' : 'Fin le'}</span>
          <input type="date" required className={inputClass} value={endDay} min={startDay} onChange={(e) => e.target.value && setEndDay(e.target.value)} />
        </label>
        {!allDay && (
          <>
            <label>
              <span className={label}>Début</span>
              <input type="time" required className={inputClass} value={startTime} onChange={(e) => e.target.value && setStartTime(e.target.value)} />
            </label>
            <label>
              <span className={label}>Fin (facultatif)</span>
              <input type="time" className={inputClass} value={endTime} onChange={(e) => setEndTime(e.target.value)} />
            </label>
          </>
        )}
      </div>

      <label>
        <span className={label}>Lieu (facultatif)</span>
        <input className={inputClass} value={location} maxLength={200} onChange={(e) => setLocation(e.target.value)} />
      </label>
      <label>
        <span className={label}>Note (facultatif)</span>
        <textarea className={cx(inputClass, 'resize-y')} rows={2} value={note} maxLength={2000} onChange={(e) => setNote(e.target.value)} />
      </label>

      {msg && (
        <p role="alert" className="text-sm font-medium text-accent">
          {msg}
        </p>
      )}
      <Button type="submit" className="w-full">
        {isNew ? 'Ajouter' : 'Enregistrer'}
      </Button>
      <p className="-mt-2 text-center text-xs text-ink-2">{isNew ? 'L’autre sera prévenu par une notification.' : author}</p>

      {phone && (
        <a {...phone} rel="noopener" className="sk-btn sk-btn-secondary flex min-h-11 items-center justify-center gap-2 font-semibold">
          <CalendarPlus />
          Ajouter à mon calendrier
        </a>
      )}
      {!isNew && (
        <Button
          type="button"
          variant="ghost"
          className={cx('self-center', armed && 'font-semibold text-accent')}
          onClick={() => {
            if (!armed) return setArmed(true)
            onDelete()
          }}
        >
          {armed ? 'Confirmer la suppression' : 'Supprimer l’événement'}
        </Button>
      )}
    </form>
  )
}

/** S'abonner au calendrier commun depuis le calendrier du téléphone : il s'y met à jour tout seul. */
function Subscribe({ token }: { token: string }) {
  const [copied, setCopied] = useState(false)
  if (!token) return null
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(feedUrl(token))
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    } catch {
      prompt('Lien du calendrier', feedUrl(token))
    }
  }
  const apple = (
    <a href={webcalUrl(token)} className="sk-btn sk-btn-primary flex min-h-11 items-center justify-center gap-2 font-semibold">
      <CalendarPlus />
      Ajouter au calendrier de l’iPhone
    </a>
  )
  const google = (
    <a href={googleSubscribeUrl(token)} target="_blank" rel="noopener" className={cx('sk-btn flex min-h-11 items-center justify-center gap-2 font-semibold', isIOS ? 'sk-btn-secondary' : 'sk-btn-primary')}>
      <CalendarPlus />
      Ajouter à Google Agenda
    </a>
  )
  return (
    <Group title="Dans mon calendrier">
      <p className="mb-3 text-sm text-ink-2">
        Abonnez-vous une fois : les événements apparaissent dans le calendrier de votre téléphone et s’y mettent à jour tout seuls (ajouts, changements,
        suppressions).
      </p>
      <div className="flex flex-col gap-2.5">
        {isIOS ? (
          <>
            {apple}
            {google}
          </>
        ) : (
          <>
            {google}
            {apple}
          </>
        )}
        <Button variant="link" className="self-center" onClick={copy}>
          {copied ? 'Lien copié ✓' : 'Copier le lien (Outlook, autre agenda)'}
        </Button>
      </div>
      <p className="mt-2 text-xs text-ink-2">
        iPhone : les nouveautés arrivent en quelques minutes. Google Agenda relit le calendrier toutes les quelques heures (règle de Google).
      </p>
    </Group>
  )
}

function CalendarPlus() {
  return (
    <svg viewBox="0 0 24 24" className="size-[1.1rem] shrink-0 fill-none stroke-current stroke-2" aria-hidden="true">
      <path d="M8 3v3M16 3v3M4 9h16M12 13v5M9.5 15.5h5M5 5.5h14a1 1 0 0 1 1 1V19a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6.5a1 1 0 0 1 1-1z" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

/** Réglages de l'espace Calendrier : notifications, et nouveau lien d'abonnement si l'ancien a fuité. */
export function CalendarFeedReset({ calendar }: { calendar: Calendar }) {
  const [busy, setBusy] = useState(false)
  const [armed, setArmed] = useState(false)
  const [msg, setMsg] = useState('')
  return (
    <Group title="Lien d’abonnement">
      <p className="text-sm text-ink-2">
        Toute personne qui a le lien peut lire le calendrier. Si vous l’avez partagé par erreur, créez-en un nouveau : l’ancien cessera de marcher et il faudra
        se réabonner sur chaque téléphone.
      </p>
      <Button
        variant={armed ? 'primary' : 'secondary'}
        className="mt-3 w-full"
        busy={busy}
        onClick={async () => {
          if (!armed) return setArmed(true)
          setBusy(true)
          setMsg('')
          try {
            await calendar.resetFeed()
            setMsg('Nouveau lien créé. Réabonnez-vous depuis l’onglet Calendrier.')
          } catch (e) {
            setMsg((e as Error).message)
          } finally {
            setBusy(false)
            setArmed(false)
          }
        }}
      >
        {armed ? 'Confirmer : nouveau lien' : 'Créer un nouveau lien'}
      </Button>
      {msg && <p className="mt-2 text-sm text-accent">{msg}</p>}
    </Group>
  )
}
