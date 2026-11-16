import { Checkbox } from '@base-ui/react/checkbox'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { GroceryItem } from '../lib/groceries'
import { haptic } from '../lib/haptics'
import { reducedMotion, slideFrom } from '../lib/motion'
import { Cross, Glyph } from './icons'
import { Button, cx, Notice, SectionTitle } from './ui'

interface Props {
  items: GroceryItem[]
  names: Record<string, string>
  /** Articles dont la modification n'est pas encore partie (hors ligne). */
  waiting?: Set<string>
  /** Premier chargement, rien en cache : on ne sait pas encore ce qu'il y a sur la liste. */
  loading?: boolean
  /** Ce premier chargement a échoué (et rien en cache) : on le dit, avec de quoi réessayer. */
  failed?: boolean
  onRetry?: () => void
  onAdd: (name: string) => void
  onToggle: (item: GroceryItem) => void
  onRemove: (item: GroceryItem) => void
  onClearDone: () => void
}

type List = 'todo' | 'done'
/** Un trait de crayon par ligne de texte (position dans la rangée, en px). */
interface Stroke {
  x: number
  y: number
  w: number
}
/** Article qu'on vient de cocher ou décocher : il reste un instant à sa place, le temps du coup de crayon (ou de gomme). */
interface Linger {
  list: List
  mode: 'check' | 'uncheck'
  strokes: Stroke[]
}
/** Ligne qu'on vient de retirer : la bandelette déchirée, le temps qu'elle parte. `top` = posée par-dessus la liste (les lignes du dessous remontent déjà) ; sans `top`, elle garde sa place. */
interface Torn {
  item: GroceryItem
  list: List
  top?: number
  delay: number
  by?: string
}

function without<T>(map: Record<string, T>, id: string) {
  const next = { ...map }
  delete next[id]
  return next
}

const CHECK_MS = 400
const UNCHECK_MS = 280
const TEAR_MS = 330

/**
 * La liste de courses, sur un bloc-notes de papeterie (`sk-block sk-pad` : papier d'écriture,
 * reliure de toile verte, perforations) : on écrit sur la première ligne, la liste suit. Les
 * articles déjà pris sont sur une feuille à part, en dessous.
 * Les gestes sont ceux du papier : cocher = un coup de crayon, décocher = un coup de gomme,
 * retirer = la ligne se déchire. L'action part tout de suite (`onToggle`, `onRemove`) ; seul
 * l'affichage s'attarde le temps du geste.
 */
export function Groceries({ items, names, waiting, loading, failed, onRetry, onAdd, onToggle, onRemove, onClearDone }: Props) {
  const [text, setText] = useState('')
  const input = useRef<HTMLInputElement>(null)
  const root = useRef<HTMLDivElement>(null)
  const [linger, setLinger] = useState<Record<string, Linger>>({})
  const [torn, setTorn] = useState<Torn[]>([])
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>())
  /** Positions au rendu précédent, pour faire glisser ce qui a bougé. */
  const places = useRef<Map<string, number> | null>(null)
  /** Heure du dernier ajout fait ici : seuls ces articles-là « s'écrivent ». */
  const wroteAt = useRef(0)

  const later = (fn: () => void, ms: number) => {
    const t = setTimeout(() => {
      timers.current.delete(t)
      fn()
    }, ms)
    timers.current.add(t)
  }
  useEffect(() => {
    const all = timers.current
    return () => all.forEach(clearTimeout)
  }, [])

  const listOf = (i: GroceryItem): List => linger[i.id]?.list ?? (i.done ? 'done' : 'todo')
  // Les plus récents en haut : c'est ce qu'on vient d'ajouter qu'on cherche des yeux.
  const todo = items.filter((i) => listOf(i) === 'todo').reverse()
  const done = items.filter((i) => listOf(i) === 'done')
  const tornIn = (list: List) => torn.filter((t) => t.list === list)

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    wroteAt.current = performance.now()
    // Plusieurs articles d'un coup : « lait, œufs, pain »
    for (const part of text.split(/[,;\n]/)) onAdd(part)
    setText('')
    input.current?.focus()
  }

  const toggle = (item: GroceryItem, row: HTMLElement | null) => {
    haptic()
    const id = item.id
    const text = row?.querySelector('[data-text]')
    // Nouvel appui pendant le geste, ou animations réduites : l'article va droit à sa place.
    if (linger[id] || reducedMotion() || !row || !text) {
      setLinger((l) => without(l, id))
      return onToggle(item)
    }
    const box = row.getBoundingClientRect()
    const strokes = [...text.getClientRects()].map((r) => ({ x: r.left - box.left - 3, y: r.top - box.top + r.height * 0.56, w: r.width + 6 }))
    const entry: Linger = { list: item.done ? 'done' : 'todo', mode: item.done ? 'uncheck' : 'check', strokes }
    setLinger((l) => ({ ...l, [id]: entry }))
    onToggle(item)
    later(() => setLinger((l) => (l[id] === entry ? without(l, id) : l)), item.done ? UNCHECK_MS : CHECK_MS)
  }

  const tear = (pieces: Torn[]) => {
    if (!pieces.length) return
    setTorn((t) => [...t, ...pieces])
    later(() => setTorn((t) => t.filter((p) => !pieces.includes(p))), TEAR_MS + Math.max(...pieces.map((p) => p.delay)))
  }

  const remove = (item: GroceryItem, row: HTMLElement | null) => {
    haptic()
    if (row && !reducedMotion()) {
      const list = listOf(item)
      // Des lignes en dessous : la bandelette part par-dessus pendant qu'elles remontent.
      const top = row.nextElementSibling ? row.offsetTop : undefined
      tear([{ item, list, top, delay: 0, by: list === 'todo' && item.added_by ? names[item.added_by] : undefined }])
    }
    onRemove(item)
  }

  const clearDone = () => {
    haptic()
    // Tout le panier : les lignes se déchirent l'une après l'autre, vite.
    if (!reducedMotion()) tear(done.map((item, k) => ({ item, list: 'done' as const, delay: Math.min(k * 45, 270) })))
    onClearDone()
  }

  // Après chaque rendu : ce qui a changé de place y glisse (les lignes remontent, l'article coché
  // rejoint le panier), et ce qu'on vient d'ajouter s'écrit sur sa ligne.
  useLayoutEffect(() => {
    const base = root.current
    if (!base) return
    const top = (el: HTMLElement) => {
      let y = 0
      for (let e: HTMLElement | null = el; e && e !== base && base.contains(e); e = e.offsetParent as HTMLElement | null) y += e.offsetTop
      return y
    }
    const now = new Map<string, number>()
    const els = [...base.querySelectorAll<HTMLElement>('[data-flip]')]
    for (const el of els) now.set(el.dataset.flip!, top(el))
    const before = places.current
    places.current = now
    if (!before || reducedMotion()) return
    const writing = performance.now() - wroteAt.current < 1000
    const moved = new Map<HTMLElement, number>()
    for (const el of els) {
      const key = el.dataset.flip!
      const was = before.get(key)
      const section = key.startsWith('s:')
      if (was == null) {
        if (section) el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200, easing: 'ease-out' })
        else if (writing) write(el)
        continue
      }
      // Une ligne suit déjà le déplacement de sa feuille : on ne compte que le sien.
      const own = was - now.get(key)! - (section ? 0 : (moved.get(el.closest<HTMLElement>('[data-flip^="s:"]')!) ?? 0))
      if (section) moved.set(el, own)
      slideFrom(el, own)
    }
  })

  return (
    <div ref={root} className="relative flex flex-col gap-6 pt-1">
      {failed && (
        <Notice action="Réessayer" onAction={onRetry}>
          La liste n’a pas pu être chargée. Vérifiez la connexion : ce que vous ajoutez en attendant est gardé sur ce téléphone.
        </Notice>
      )}
      <div data-flip="s:todo" className="sk-block sk-pad [--binding:14px]" aria-busy={loading || undefined}>
        <div aria-hidden className="sk-perfs" />
        <form onSubmit={submit} className="sk-row gap-2 pr-2.5 pl-5">
          <input
            ref={input}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Ajouter… (lait, pain, œufs)"
            aria-label="Article à ajouter"
            enterKeyHint="done"
            autoComplete="off"
            autoCapitalize="sentences"
            maxLength={600}
            className="sk-bare-input"
          />
          <Button type="submit" disabled={!text.trim()} className="size-10 min-h-0 shrink-0 rounded-full p-0 text-2xl leading-none font-normal after:absolute after:-inset-0.5" aria-label="Ajouter">
            +
          </Button>
        </form>

        {loading ? (
          // Lignes vierges du bloc : la place de la liste, sans faux contenu.
          <ul aria-hidden className="sk-rows sk-rows-blank border-t border-line pb-1.5">
            {[0, 1, 2, 3].map((k) => (
              <li key={k} className="sk-row">
                <i className="sk-checkbox" />
              </li>
            ))}
          </ul>
        ) : (
          !items.length &&
          !torn.length &&
          !failed && (
            <div className="border-t border-line px-6 py-8 text-center text-ink-2">
              <Glyph icon="🛒" className="mx-auto size-9 opacity-70" />
              <p className="mt-2 text-sm">La liste est vide. Ce que l’un ajoute apparaît aussi chez l’autre.</p>
            </div>
          )
        )}

        {(todo.length > 0 || tornIn('todo').length > 0) && (
          <section className="border-t border-line pb-1.5">
            <SectionTitle className="mb-0 px-5 pt-4 pb-1">À acheter · {todo.length}</SectionTitle>
            <ul className="sk-rows relative">
              {todo.map((i) => (
                <Row key={i.id} item={i} by={i.added_by ? names[i.added_by] : undefined} waiting={waiting?.has(i.id)} linger={linger[i.id]} onToggle={toggle} onRemove={remove} />
              ))}
              {tornIn('todo').map((t) => (
                <TornRow key={t.item.id} piece={t} />
              ))}
            </ul>
          </section>
        )}
      </div>

      {(done.length > 0 || tornIn('done').length > 0) && (
        <section data-flip="s:done">
          <div className="flex items-center justify-between px-1.5">
            <SectionTitle className="mb-0">Dans le panier · {done.length}</SectionTitle>
            <Button variant="link" onClick={clearDone} disabled={!done.length} className="text-sm">
              Vider
            </Button>
          </div>
          <ul className="sk-card sk-rows relative py-0.5">
            {done.map((i) => (
              <Row key={i.id} item={i} waiting={waiting?.has(i.id)} linger={linger[i.id]} onToggle={toggle} onRemove={remove} />
            ))}
            {tornIn('done').map((t) => (
              <TornRow key={t.item.id} piece={t} />
            ))}
          </ul>
          <p className="mt-3 px-1.5 text-xs text-ink-2">Toucher un article coché le remet dans la liste.</p>
        </section>
      )}
    </div>
  )
}

/** L'article s'écrit sur sa ligne : une fenêtre découvre le texte de gauche à droite (deux glissements opposés, rien d'autre). */
function write(row: HTMLElement) {
  const name = row.querySelector<HTMLElement>('[data-name]')
  const inner = name?.firstElementChild
  if (!name || !inner) return
  const opts: KeyframeAnimationOptions = { duration: 300, easing: 'cubic-bezier(0.3, 0, 0.4, 1)' }
  name.animate([{ transform: 'translateX(-100%)' }, { transform: 'translateX(0)' }], opts)
  inner.animate([{ transform: 'translateX(100%)' }, { transform: 'translateX(0)' }], opts)
  row.querySelector('.sk-checkbox')?.animate([{ transform: 'scale(0.4)', opacity: 0 }, { transform: 'scale(1)', opacity: 1 }], { duration: 220, easing: 'cubic-bezier(0.3, 1.4, 0.5, 1)' })
}

function Row({
  item,
  by,
  waiting,
  linger,
  onToggle,
  onRemove,
}: {
  item: GroceryItem
  by?: string
  waiting?: boolean
  linger?: Linger
  onToggle: (item: GroceryItem, row: HTMLElement | null) => void
  onRemove: (item: GroceryItem, row: HTMLElement | null) => void
}) {
  const row = useRef<HTMLLIElement>(null)
  return (
    <li ref={row} data-flip={`r:${item.id}`} data-gesture={linger?.mode} className="sk-row">
      <label className="flex min-h-[54px] min-w-0 flex-1 items-center py-2.5 select-none">
        <Checkbox.Root checked={item.done} onCheckedChange={() => onToggle(item, row.current)} className="sk-checkbox">
          <Checkbox.Indicator render={<Tick />} />
        </Checkbox.Root>
        <Name item={item} by={by} waiting={waiting} struck={item.done && !linger} />
      </label>
      {/* Le coup de crayon (ou de gomme) : un trait par ligne de texte, là où le texte se trouve. */}
      {linger && (
        <svg aria-hidden className="sk-pencil" width="100%" height="100%">
          {linger.strokes.map((s, k) => (
            <path key={k} pathLength={1} style={{ animationDelay: `${k * 90}ms` }} d={`M${s.x} ${s.y}q${s.w * 0.22} -2.2 ${s.w * 0.5} -0.4t${s.w * 0.5} 0.9`} />
          ))}
        </svg>
      )}
      <button
        type="button"
        onClick={() => onRemove(item, row.current)}
        aria-label={`Retirer ${item.name}`}
        className="grid size-11 shrink-0 place-items-center text-ink-2/55 outline-none focus-visible:text-accent active:text-ink"
      >
        <Cross />
      </button>
    </li>
  )
}

const Tick = (props: React.ComponentProps<'svg'>) => (
  <svg aria-hidden viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path pathLength={1} d="M3.5 8.5l3 3 6-6.5" />
  </svg>
)

function Name({ item, by, waiting, struck }: { item: GroceryItem; by?: string; waiting?: boolean; struck?: boolean }) {
  return (
    <span data-name className="min-w-0 flex-1 overflow-hidden text-[1.06rem] leading-snug [overflow-wrap:anywhere]">
      <span className="block">
        <span data-text className={cx(item.done && 'text-ink-2', struck && 'sk-struck')}>
          {item.name}
        </span>
        {by && by !== 'vous' && <span className="ml-2 text-[0.8rem] text-ink-2">par {by}</span>}
        {waiting && <span className="sk-waiting">en attente</span>}
      </span>
    </span>
  )
}

/** La bandelette déchirée : la ligne telle qu'elle était, bords dentelés, qui part sur le côté. */
function TornRow({ piece }: { piece: Torn }) {
  const { item, top, delay, by } = piece
  return (
    <li aria-hidden className="sk-row sk-torn" data-over={top != null || undefined} style={{ top, animationDelay: `${delay}ms` }}>
      <div className="sk-torn-strip">
        <span className="flex min-h-[54px] min-w-0 flex-1 items-center py-2.5">
          <i className="sk-checkbox" data-checked={item.done || undefined}>
            {item.done && <Tick />}
          </i>
          <Name item={item} by={by} struck={item.done} />
        </span>
        <span className="grid size-11 shrink-0 place-items-center text-ink-2/55">
          <Cross />
        </span>
      </div>
    </li>
  )
}
