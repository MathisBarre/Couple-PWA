import { Checkbox } from '@base-ui/react/checkbox'
import { useRef, useState } from 'react'
import type { GroceryItem } from '../lib/groceries'
import { Cross, Glyph } from './icons'
import { Button, cx } from './ui'

interface Props {
  items: GroceryItem[]
  names: Record<string, string>
  onAdd: (name: string) => void
  onToggle: (item: GroceryItem) => void
  onRemove: (item: GroceryItem) => void
  onClearDone: () => void
}

/**
 * La liste de courses, sur un bloc-notes ligné : tout tient sur des lignes de 44 px (`sk-ruled`),
 * l'écriture manuscrite se pose sur les lignes, les cases sont dans la marge.
 */
export function Groceries({ items, names, onAdd, onToggle, onRemove, onClearDone }: Props) {
  const [text, setText] = useState('')
  const input = useRef<HTMLInputElement>(null)
  // Les plus récents en haut : c'est ce qu'on vient d'ajouter qu'on cherche des yeux.
  const todo = items.filter((i) => !i.done).reverse()
  const done = items.filter((i) => i.done)

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    // Plusieurs articles d'un coup : « lait, œufs, pain »
    for (const part of text.split(/[,;\n]/)) onAdd(part)
    setText('')
    input.current?.focus()
  }

  return (
    <div className="sk-ruled">
      <form onSubmit={submit} className="sk-ruled-row pr-2.5 pl-14">
        <input
          ref={input}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Ajouter… (lait, pain, œufs)"
          aria-label="Article à ajouter"
          enterKeyHint="done"
          autoComplete="off"
          autoCapitalize="sentences"
          className="sk-ruled-input"
        />
        <Button type="submit" disabled={!text.trim()} className="mt-1 size-9 min-h-0 shrink-0 rounded-full p-0 font-sans text-2xl leading-none after:absolute after:-inset-1" aria-label="Ajouter">
          +
        </Button>
      </form>

      {!items.length && (
        <div className="px-6 pt-11 text-center text-ink-2">
          <Glyph icon="🛒" className="mx-auto size-11 opacity-60" />
          <p className="sk-hand">La liste est vide. Ce que l’un ajoute apparaît aussi chez l’autre.</p>
        </div>
      )}

      {todo.length > 0 && (
        <section className="mt-11">
          <h3 className="sk-ruled-title">
            <span>À acheter · {todo.length}</span>
          </h3>
          <ul>
            {todo.map((i) => (
              <Row key={i.id} item={i} by={i.added_by ? names[i.added_by] : undefined} onToggle={onToggle} onRemove={onRemove} />
            ))}
          </ul>
        </section>
      )}

      {done.length > 0 && (
        <section className="mt-11">
          <div className="flex items-start justify-between pr-4">
            <h3 className="sk-ruled-title">
              <span>Dans le panier · {done.length}</span>
            </h3>
            <Button variant="link" onClick={onClearDone} className="sk-hand h-11 px-1 font-hand text-[1.5rem] leading-none">
              Vider
            </Button>
          </div>
          <ul>
            {done.map((i) => (
              <Row key={i.id} item={i} onToggle={onToggle} onRemove={onRemove} />
            ))}
          </ul>
          <p className="sk-ruled-note pt-2">Toucher un article coché le remet dans la liste.</p>
        </section>
      )}
    </div>
  )
}

function Row({
  item,
  by,
  onToggle,
  onRemove,
}: {
  item: GroceryItem
  by?: string
  onToggle: (item: GroceryItem) => void
  onRemove: (item: GroceryItem) => void
}) {
  return (
    <li className="sk-ruled-row">
      <label className="flex min-w-0 flex-1 items-start select-none">
        <Checkbox.Root checked={item.done} onCheckedChange={() => onToggle(item)} className="sk-checkbox">
          <Checkbox.Indicator
            render={
              <svg aria-hidden viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth={3.2} strokeLinecap="round" strokeLinejoin="round">
                <path d="M6 19c2.5 2 4.5 4.5 6 7.5C15.5 17 21 9.5 29 3.5" />
              </svg>
            }
          />
        </Checkbox.Root>
        <span className={cx('sk-hand min-w-0 flex-1 pl-2.5 break-words', item.done && 'sk-struck')}>
          {item.name}
          {by && by !== 'vous' && <span className="ml-2.5 text-[1.15rem] text-ink-2">par {by}</span>}
        </span>
      </label>
      <button
        type="button"
        onClick={() => onRemove(item)}
        aria-label={`Retirer ${item.name}`}
        className="grid size-11 shrink-0 place-items-center text-ink-2/60 outline-none focus-visible:text-accent active:text-ink"
      >
        <Cross />
      </button>
    </li>
  )
}
