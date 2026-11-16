import { Checkbox } from '@base-ui/react/checkbox'
import { useRef, useState } from 'react'
import type { GroceryItem } from '../lib/groceries'
import { Cross, Glyph } from './icons'
import { Button, cx, SectionTitle } from './ui'

interface Props {
  items: GroceryItem[]
  names: Record<string, string>
  onAdd: (name: string) => void
  onToggle: (item: GroceryItem) => void
  onRemove: (item: GroceryItem) => void
  onClearDone: () => void
}

/**
 * La liste de courses, sur un bloc-notes de papeterie (`sk-block` : papier épais, reliure de toile
 * verte, perforations) : on écrit sur la première ligne, la liste suit. Les articles déjà pris
 * sont sur une feuille à part, en dessous.
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
    <div className="flex flex-col gap-6 pt-1">
      <div className="sk-block [--binding:14px]">
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
            className="sk-bare-input"
          />
          <Button type="submit" disabled={!text.trim()} className="size-10 min-h-0 shrink-0 rounded-full p-0 text-2xl leading-none font-normal after:absolute after:-inset-0.5" aria-label="Ajouter">
            +
          </Button>
        </form>

        {!items.length && (
          <div className="border-t border-line px-6 py-8 text-center text-ink-2">
            <Glyph icon="🛒" className="mx-auto size-9 opacity-70" />
            <p className="mt-2 text-sm">La liste est vide. Ce que l’un ajoute apparaît aussi chez l’autre.</p>
          </div>
        )}

        {todo.length > 0 && (
          <section className="border-t border-line pb-1.5">
            <SectionTitle className="mb-0 px-5 pt-4 pb-1">À acheter · {todo.length}</SectionTitle>
            <ul className="sk-rows">
              {todo.map((i) => (
                <Row key={i.id} item={i} by={i.added_by ? names[i.added_by] : undefined} onToggle={onToggle} onRemove={onRemove} />
              ))}
            </ul>
          </section>
        )}
      </div>

      {done.length > 0 && (
        <section>
          <div className="flex items-center justify-between px-1.5">
            <SectionTitle className="mb-0">Dans le panier · {done.length}</SectionTitle>
            <Button variant="link" onClick={onClearDone} className="text-sm">
              Vider
            </Button>
          </div>
          <ul className="sk-card sk-rows py-0.5">
            {done.map((i) => (
              <Row key={i.id} item={i} onToggle={onToggle} onRemove={onRemove} />
            ))}
          </ul>
          <p className="mt-3 px-1.5 text-xs text-ink-2">Toucher un article coché le remet dans la liste.</p>
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
    <li className="sk-row">
      <label className="flex min-h-[54px] min-w-0 flex-1 items-center py-2.5 select-none">
        <Checkbox.Root checked={item.done} onCheckedChange={() => onToggle(item)} className="sk-checkbox">
          <Checkbox.Indicator
            render={
              <svg aria-hidden viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
                <path d="M3.5 8.5l3 3 6-6.5" />
              </svg>
            }
          />
        </Checkbox.Root>
        <span className={cx('min-w-0 flex-1 text-[1.06rem] leading-snug break-words', item.done && 'sk-struck')}>
          {item.name}
          {by && by !== 'vous' && <span className="ml-2 text-[0.8rem] text-ink-2">par {by}</span>}
        </span>
      </label>
      <button
        type="button"
        onClick={() => onRemove(item)}
        aria-label={`Retirer ${item.name}`}
        className="grid size-11 shrink-0 place-items-center text-ink-2/55 outline-none focus-visible:text-accent active:text-ink"
      >
        <Cross />
      </button>
    </li>
  )
}
