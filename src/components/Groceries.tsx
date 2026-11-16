import { Checkbox } from '@base-ui/react/checkbox'
import { useRef, useState } from 'react'
import type { GroceryItem } from '../lib/groceries'
import { Icon } from './icons'
import { Button, cx, inputClass, SectionTitle } from './ui'

interface Props {
  items: GroceryItem[]
  names: Record<string, string>
  onAdd: (name: string) => void
  onToggle: (item: GroceryItem) => void
  onRemove: (item: GroceryItem) => void
  onClearDone: () => void
}

/**
 * La liste comme un ticket de caisse : articles en caractères de machine, une ligne par article
 * séparée par un pointillé, et les articles cochés barrés d'un trait d'encre.
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
    <div className="flex flex-col gap-7">
      <form onSubmit={submit} className="flex">
        <input
          ref={input}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Ajouter… (lait, pain, œufs)"
          aria-label="Article à ajouter"
          enterKeyHint="done"
          autoComplete="off"
          autoCapitalize="sentences"
          className={cx(inputClass, 'min-w-0 border-r-0 text-[1.05rem]')}
        />
        <Button type="submit" disabled={!text.trim()} className="grid w-13 shrink-0 place-items-center !p-0 disabled:!opacity-100" aria-label="Ajouter">
          <Icon name="plus" className="size-6" />
        </Button>
      </form>

      {!items.length && (
        <div className="flex flex-col items-center border-y border-ink py-8 text-center text-ink-2">
          <Icon name="basket" className="size-12 text-ink" strokeWidth={1} />
          <p className="mt-3 max-w-64 italic">La liste est vide. Ce que l’un ajoute apparaît aussi chez l’autre.</p>
        </div>
      )}

      {todo.length > 0 && (
        <section>
          <div className="border-b-2 border-ink">
            <SectionTitle>À acheter · {todo.length}</SectionTitle>
          </div>
          <ul>
            {todo.map((i) => (
              <Row key={i.id} item={i} by={i.added_by ? names[i.added_by] : undefined} onToggle={onToggle} onRemove={onRemove} />
            ))}
          </ul>
        </section>
      )}

      {done.length > 0 && (
        <section>
          <div className="flex items-center justify-between border-b-2 border-ink">
            <SectionTitle>Dans le panier · {done.length}</SectionTitle>
            <Button variant="link" onClick={onClearDone} className="etiquette -my-1.5 !self-auto">
              Vider
            </Button>
          </div>
          <ul>
            {done.map((i) => (
              <Row key={i.id} item={i} onToggle={onToggle} onRemove={onRemove} />
            ))}
          </ul>
          <p className="mt-3 text-sm text-ink-2 italic">Toucher un article coché le remet dans la liste.</p>
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
    <li className="flex items-center border-b border-dashed border-ink-2/70">
      <label className="flex min-h-13 min-w-0 flex-1 items-center gap-3.5 py-2.5 select-none">
        <Checkbox.Root
          checked={item.done}
          onCheckedChange={() => onToggle(item)}
          className="grid size-5.5 shrink-0 place-items-center border-[1.5px] border-ink transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent data-checked:border-accent data-checked:bg-accent"
        >
          <Checkbox.Indicator className="text-on-accent">
            <Icon name="check" className="size-4" strokeWidth={2.5} />
          </Checkbox.Indicator>
        </Checkbox.Root>
        <span className="min-w-0 flex-1 break-words">
          <span className={cx('font-mono text-[0.95rem]', item.done && 'text-ink-2 line-through decoration-ink decoration-[1.5px]')}>{item.name}</span>
          {by && by !== 'vous' && <span className="ml-2.5 text-sm whitespace-nowrap text-ink-2 italic">par {by}</span>}
        </span>
      </label>
      <button
        type="button"
        onClick={() => onRemove(item)}
        aria-label={`Retirer ${item.name}`}
        className="-mr-3 grid size-12 shrink-0 place-items-center text-ink-2 active:opacity-50 focus-visible:outline-2 focus-visible:outline-accent"
      >
        <Icon name="close" className="size-4" strokeWidth={1.25} />
      </button>
    </li>
  )
}
