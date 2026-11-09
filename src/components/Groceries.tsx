import { Checkbox } from '@base-ui/react/checkbox'
import { useRef, useState } from 'react'
import type { GroceryItem } from '../lib/groceries'
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
      <form onSubmit={submit} className="flex gap-2">
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
        <Button type="submit" disabled={!text.trim()} className="shrink-0 px-5" aria-label="Ajouter">
          +
        </Button>
      </form>

      {!items.length && (
        <Card className="text-center text-ink-2">
          <p className="text-3xl">🛒</p>
          <p className="mt-1 text-sm">La liste est vide. Ce que l’un ajoute apparaît aussi chez l’autre.</p>
        </Card>
      )}

      {todo.length > 0 && (
        <section>
          <SectionTitle>À acheter · {todo.length}</SectionTitle>
          <ul className="overflow-hidden rounded-2xl border border-line bg-surface">
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
            <Button variant="link" onClick={onClearDone} className="mb-2 text-sm">
              Vider
            </Button>
          </div>
          <ul className="overflow-hidden rounded-2xl border border-line bg-surface">
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
    <li className="flex items-center border-b border-line last:border-b-0">
      <label className="flex min-h-13 flex-1 items-center gap-3 px-4 py-2.5 select-none">
        <Checkbox.Root
          checked={item.done}
          onCheckedChange={() => onToggle(item)}
          className="grid size-6 shrink-0 place-items-center rounded-full border-2 border-line bg-surface transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent data-checked:border-accent data-checked:bg-accent"
        >
          <Checkbox.Indicator className="text-sm font-bold text-on-accent">✓</Checkbox.Indicator>
        </Checkbox.Root>
        <span className={cx('flex-1 break-words', item.done && 'text-ink-2 line-through')}>
          {item.name}
          {by && by !== 'vous' && <span className="ml-2 text-xs text-ink-2">par {by}</span>}
        </span>
      </label>
      <button
        type="button"
        onClick={() => onRemove(item)}
        aria-label={`Retirer ${item.name}`}
        className="grid size-12 shrink-0 place-items-center text-lg text-ink-2/70 focus-visible:outline-2 focus-visible:outline-accent"
      >
        ×
      </button>
    </li>
  )
}
