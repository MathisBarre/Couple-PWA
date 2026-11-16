import { Checkbox } from '@base-ui/react/checkbox'
import { useRef, useState } from 'react'
import type { GroceryItem } from '../lib/groceries'
import { Icon } from './icons'
import { Button, Card, cx, inputClass, SectionTitle } from './ui'

interface Props {
  items: GroceryItem[]
  names: Record<string, string>
  onAdd: (name: string) => void
  onToggle: (item: GroceryItem) => void
  onRemove: (item: GroceryItem) => void
  onClearDone: () => void
}

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
    <div className="flex flex-col gap-3.5">
      <form onSubmit={submit} className="flex gap-2.5">
        <input
          ref={input}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Ajouter… (lait, pain, œufs)"
          aria-label="Article à ajouter"
          enterKeyHint="done"
          autoComplete="off"
          autoCapitalize="sentences"
          className={inputClass}
        />
        <Button type="submit" disabled={!text.trim()} className="grid w-12 shrink-0 place-items-center !px-0" aria-label="Ajouter">
          <Icon name="plus" className="size-5.5" strokeWidth={2.2} />
        </Button>
      </form>

      {!items.length && (
        <Card className="flex flex-col items-center px-6 py-8 text-center text-ink-2">
          <span className="grid size-14 place-items-center rounded-2xl bg-accent-soft text-accent">
            <Icon name="basket" className="size-7" />
          </span>
          <p className="mt-3 text-sm">La liste est vide. Ce que l’un ajoute apparaît aussi chez l’autre.</p>
        </Card>
      )}

      {todo.length > 0 && (
        <section>
          <SectionTitle>À acheter · {todo.length}</SectionTitle>
          <ul className="card overflow-hidden">
            {todo.map((i) => (
              <Row key={i.id} item={i} by={i.added_by ? names[i.added_by] : undefined} onToggle={onToggle} onRemove={onRemove} />
            ))}
          </ul>
        </section>
      )}

      {done.length > 0 && (
        <section>
          <div className="flex items-baseline justify-between">
            <SectionTitle>Dans le panier · {done.length}</SectionTitle>
            <Button variant="link" onClick={onClearDone} className="mb-2 !self-auto text-sm">
              Vider
            </Button>
          </div>
          <ul className="card overflow-hidden">
            {done.map((i) => (
              <Row key={i.id} item={i} onToggle={onToggle} onRemove={onRemove} />
            ))}
          </ul>
          <p className="mt-2 text-xs text-ink-2">Toucher un article coché le remet dans la liste.</p>
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
    <li className="relative flex items-center after:absolute after:right-0 after:bottom-0 after:left-[3.25rem] after:h-px after:bg-line last:after:hidden">
      <label className="flex min-h-13.5 flex-1 items-center gap-3.5 py-2.5 pl-4 select-none">
        <Checkbox.Root
          checked={item.done}
          onCheckedChange={() => onToggle(item)}
          className="check well grid size-6 shrink-0 place-items-center rounded-full border-[1.5px] border-ink-2/35 transition-[background-color,box-shadow] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          <Checkbox.Indicator className="text-on-accent">
            <Icon name="check" className="size-3.5" strokeWidth={3.2} />
          </Checkbox.Indicator>
        </Checkbox.Root>
        <span className={cx('min-w-0 flex-1 font-medium break-words', item.done && 'text-ink-2/80 line-through decoration-ink-2/40')}>
          {item.name}
          {by && by !== 'vous' && <span className="ml-2 text-xs font-medium text-ink-2">par {by}</span>}
        </span>
      </label>
      <button
        type="button"
        onClick={() => onRemove(item)}
        aria-label={`Retirer ${item.name}`}
        className="grid size-12 shrink-0 place-items-center text-ink-2/55 transition-colors focus-visible:outline-2 focus-visible:outline-accent active:text-ink"
      >
        <Icon name="close" className="size-4" strokeWidth={1.9} />
      </button>
    </li>
  )
}
