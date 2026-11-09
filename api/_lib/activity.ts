// Prévient les autres membres de l'espace quand quelqu'un saisit une info (cycle, courses).
//
// Pour ne pas envoyer une notification à chaque appui (chaque appui enregistre), on attend
// un peu après la dernière saisie : chaque requête enregistre son événement puis, une fois la
// réponse partie (waitUntil), patiente DEBOUNCE_MS. Seule la requête dont l'événement est
// toujours le plus récent envoie la notification, qui résume tout ce que l'auteur a saisi
// dans les WINDOW_MIN dernières minutes (« Léa a ajouté 3 articles »). Son tag remplace la
// notification précédente du même auteur au lieu d'en empiler une nouvelle.
import { waitUntil } from '@vercel/functions'
import { FLOW_LABELS, PAIN_LABELS, todayIn } from '../../shared/cycles.js'
import type { User } from './auth.js'
import { db } from './db.js'
import { sendToUsers, type Payload } from './push.js'

const DEBOUNCE_MS = Number(process.env.ACTIVITY_DEBOUNCE_MS ?? 20_000)
const WINDOW_MIN = 30
const TIME_ZONE = 'Europe/Paris'

export interface CycleActivity {
  saved?: string[]
  deleted?: string[]
}
export interface GroceryActivity {
  added?: string[]
  checked?: number
  removed?: number
}
type Activity = { kind: 'cycle'; data: CycleActivity } | { kind: 'groceries'; data: GroceryActivity }

/** À appeler après une saisie réussie ; ne bloque pas la réponse. */
export function notifyActivity(user: User & { couple_id: string }, activity: Activity) {
  const task = record(user, activity).catch((e) => console.error('activity', e))
  // Hors Vercel (npm run dev) il n'y a pas de contexte : la promesse tourne quand même.
  waitUntil(task)
}

async function record(user: User & { couple_id: string }, { kind, data }: Activity) {
  const conn = await db()
  const others = await conn.execute({ sql: 'select id from users where couple_id = ? and id != ?', args: [user.couple_id, user.id] })
  if (!others.rows.length) return
  const res = await conn.execute({
    sql: 'insert into activity_events (couple_id, author_id, kind, payload) values (?, ?, ?, ?)',
    args: [user.couple_id, user.id, kind, JSON.stringify(data)],
  })
  const id = Number(res.lastInsertRowid)

  await new Promise((r) => setTimeout(r, DEBOUNCE_MS))

  const latest = await conn.execute({
    sql: 'select max(id) as id from activity_events where couple_id = ? and author_id = ? and kind = ?',
    args: [user.couple_id, user.id, kind],
  })
  if (Number(latest.rows[0]?.id) !== id) return // une saisie plus récente s'en chargera

  const { rows } = await conn.execute({
    sql: `select payload from activity_events where couple_id = ? and author_id = ? and kind = ?
          and created_at >= datetime('now', ?) order by id`,
    args: [user.couple_id, user.id, kind, `-${WINDOW_MIN} minutes`],
  })
  const payloads = rows.map((r) => JSON.parse(String(r.payload)))
  const name = user.display_name.trim() || 'Votre partenaire'
  const message = kind === 'cycle' ? await cycleMessage(user.couple_id, name, payloads) : groceryMessage(name, payloads)
  if (message) {
    await sendToUsers(
      others.rows.map((r) => String(r.id)),
      { ...message, kind: `activity-${kind}`, tag: `activity-${kind}-${user.id}` },
      kind,
    )
  }
  await conn.execute("delete from activity_events where created_at < datetime('now', '-1 day')")
}

const plural = (n: number, word: string) => `${n} ${word}${n > 1 ? 's' : ''}`

/** « lait, pain et œufs », « lait, pain, œufs et 2 autres » */
function list(items: string[], max = 4) {
  if (items.length <= 1) return items[0] ?? ''
  if (items.length > max) return `${items.slice(0, max - 1).join(', ')} et ${items.length - max + 1} autres`
  return `${items.slice(0, -1).join(', ')} et ${items.at(-1)}`
}

export function groceryMessage(name: string, payloads: GroceryActivity[]): Omit<Payload, 'kind'> | null {
  const added = [...new Set(payloads.flatMap((p) => p.added ?? []))]
  const checked = payloads.reduce((n, p) => n + (p.checked ?? 0), 0)
  const removed = payloads.reduce((n, p) => n + (p.removed ?? 0), 0)
  const others = [checked && `${plural(checked, 'article')} coché${checked > 1 ? 's' : ''}`, removed && `${removed} retiré${removed > 1 ? 's' : ''}`].filter(
    Boolean,
  ) as string[]
  const url = '/?open=groceries'
  if (added.length) {
    const body = [list(added), ...others].join(' · ')
    return { title: `🛒 ${name} a ajouté ${added.length > 1 ? plural(added.length, 'article') : 'un article'}`, body: body[0].toUpperCase() + body.slice(1), url }
  }
  if (checked) return { title: `🛒 ${name} fait les courses`, body: others.join(' · ').replace(/^./, (c) => c.toUpperCase()), url }
  if (removed) return { title: `🛒 ${name} a modifié la liste de courses`, body: `${plural(removed, 'article')} retiré${removed > 1 ? 's' : ''}`, url }
  return null
}

const MONTHS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.']
const dateFr = (day: string) => `${Number(day.slice(8, 10))} ${MONTHS[Number(day.slice(5, 7)) - 1]}`

function dayLabel(day: string, today: string) {
  const yesterday = new Date(`${today}T12:00:00Z`)
  yesterday.setUTCDate(yesterday.getUTCDate() - 1)
  if (day === today) return 'aujourd’hui'
  if (day === yesterday.toISOString().slice(0, 10)) return 'hier'
  return `le ${dateFr(day)}`
}

async function cycleMessage(coupleId: string, name: string, payloads: CycleActivity[]): Promise<Omit<Payload, 'kind'> | null> {
  // Le dernier geste sur un jour l'emporte (noté puis effacé = effacé).
  const last = new Map<string, 'saved' | 'deleted'>()
  for (const p of payloads) {
    for (const d of p.saved ?? []) last.set(d, 'saved')
    for (const d of p.deleted ?? []) last.set(d, 'deleted')
  }
  const saved = [...last].filter(([, v]) => v === 'saved').map(([d]) => d).sort()
  const deleted = [...last].filter(([, v]) => v === 'deleted').map(([d]) => d).sort()
  const today = todayIn(TIME_ZONE)
  const url = '/?log=today'

  if (saved.length === 1 && !deleted.length) {
    const { rows } = await (await db()).execute({
      sql: 'select flow, pain, symptoms, note from day_logs where couple_id = ? and day = ?',
      args: [coupleId, saved[0]],
    })
    const r = rows[0]
    const parts: string[] = []
    if (r) {
      if (r.flow !== null) parts.push(`Flux : ${FLOW_LABELS[Number(r.flow)].toLowerCase()}`)
      if (r.pain !== null && Number(r.pain) > 0) parts.push(`douleur ${PAIN_LABELS[Number(r.pain)].toLowerCase()}`)
      const symptoms = JSON.parse(String(r.symptoms ?? '[]')) as string[]
      if (symptoms.length) parts.push(list(symptoms.map((s) => s.toLowerCase()), 3))
      if (r.note) parts.push(`« ${String(r.note).slice(0, 80)} »`)
    }
    const body = parts.join(' · ') || 'Journée mise à jour'
    return { title: `💧 ${name} a noté ${dayLabel(saved[0], today)}`, body: body[0].toUpperCase() + body.slice(1), url }
  }
  if (saved.length) {
    const extra = deleted.length ? ` · ${plural(deleted.length, 'jour')} effacé${deleted.length > 1 ? 's' : ''}` : ''
    return { title: `💧 ${name} a mis à jour le cycle`, body: `${plural(saved.length, 'jour')} : ${list(saved.map(dateFr))}${extra}`, url }
  }
  if (deleted.length) {
    const title = deleted.length === 1 ? 'une journée' : plural(deleted.length, 'journée')
    return { title: `💧 ${name} a effacé ${title}`, body: `Du suivi du cycle : ${list(deleted.map(dateFr))}`, url }
  }
  return null
}
