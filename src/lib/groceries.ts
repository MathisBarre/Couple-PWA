// Liste de courses partagée : même principe que les journées (cache local +
// file d'attente hors ligne), mais en opérations (ajout, coche, suppression)
// pour que deux personnes puissent modifier la liste en même temps.
import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from './api'

export interface GroceryItem {
  id: string
  name: string
  done: boolean
  added_by: string | null
  created_at: string
}

export type GroceryOp =
  | { op: 'add'; id: string; name: string }
  | { op: 'check'; id: string; done: boolean }
  | { op: 'delete'; id: string }

const cacheKey = (coupleId: string) => `groceries:${coupleId}`
const queueKey = (coupleId: string) => `groceries-queue:${coupleId}`

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}
function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* stockage plein ou indisponible */
  }
}

/** Applique des opérations sur une liste (côté app, pour un affichage immédiat). */
export function applyOps(items: GroceryItem[], ops: GroceryOp[], userId: string | null = null): GroceryItem[] {
  let next = items
  for (const o of ops) {
    if (o.op === 'add') {
      if (!next.some((i) => i.id === o.id))
        next = [...next, { id: o.id, name: o.name, done: false, added_by: userId, created_at: new Date().toISOString() }]
    } else if (o.op === 'check') next = next.map((i) => (i.id === o.id ? { ...i, done: o.done } : i))
    else next = next.filter((i) => i.id !== o.id)
  }
  return next
}

const newId = () =>
  typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`

export const normalize = (s: string) =>
  s
    .trim()
    .toLocaleLowerCase('fr')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/\s+/g, ' ')

export function useGroceries(coupleId: string, userId: string, active: boolean) {
  const [items, setItems] = useState<GroceryItem[]>(() => applyOps(read(cacheKey(coupleId), []), read(queueKey(coupleId), []), userId))
  const [pending, setPending] = useState(() => read<GroceryOp[]>(queueKey(coupleId), []).length)
  const itemsRef = useRef(items)
  useEffect(() => {
    itemsRef.current = items
  }, [items])

  /** Liste du serveur + modifications pas encore envoyées. */
  const adopt = useCallback(
    (server: GroceryItem[]) => {
      write(cacheKey(coupleId), server)
      const queue = read<GroceryOp[]>(queueKey(coupleId), [])
      setItems(applyOps(server, queue, userId))
      setPending(queue.length)
    },
    [coupleId, userId],
  )

  const sync = useCallback(async () => {
    const queue = read<GroceryOp[]>(queueKey(coupleId), [])
    try {
      if (queue.length && navigator.onLine) {
        const server = await api<GroceryItem[]>('groceries', { method: 'POST', body: { ops: queue } })
        // Ne retire que ce qui a été envoyé (une modification a pu arriver entre-temps).
        write(queueKey(coupleId), read<GroceryOp[]>(queueKey(coupleId), []).slice(queue.length))
        adopt(server)
      } else adopt(await api<GroceryItem[]>('groceries'))
    } catch {
      /* hors ligne : on garde le cache local et la file d'attente */
    }
  }, [coupleId, adopt])

  useEffect(() => {
    sync()
    const onOnline = () => sync()
    const onVisible = () => document.visibilityState === 'visible' && sync()
    window.addEventListener('online', onOnline)
    document.addEventListener('visibilitychange', onVisible)
    // Rafraîchissement plus fréquent quand la liste est affichée (au magasin, à deux).
    const timer = setInterval(() => document.visibilityState === 'visible' && sync(), active ? 8_000 : 60_000)
    return () => {
      window.removeEventListener('online', onOnline)
      document.removeEventListener('visibilitychange', onVisible)
      clearInterval(timer)
    }
  }, [sync, active])

  const run = useCallback(
    (ops: GroceryOp[]) => {
      if (!ops.length) return
      const queue = [...read<GroceryOp[]>(queueKey(coupleId), []), ...ops]
      write(queueKey(coupleId), queue)
      setItems((prev) => applyOps(prev, ops, userId))
      setPending(queue.length)
      sync()
    },
    [coupleId, userId, sync],
  )

  /** Ajoute un article ; s'il est déjà dans la liste (même coché), on le remet simplement à acheter. */
  const add = useCallback(
    (name: string) => {
      const trimmed = name.trim().replace(/\s+/g, ' ').slice(0, 120)
      if (!trimmed) return
      const clean = trimmed[0].toLocaleUpperCase('fr') + trimmed.slice(1)
      const existing = itemsRef.current.find((i) => normalize(i.name) === normalize(clean))
      if (existing) return run(existing.done ? [{ op: 'check', id: existing.id, done: false }] : [])
      run([{ op: 'add', id: newId(), name: clean }])
    },
    [run],
  )
  const toggle = useCallback((item: GroceryItem) => run([{ op: 'check', id: item.id, done: !item.done }]), [run])
  const remove = useCallback((item: GroceryItem) => run([{ op: 'delete', id: item.id }]), [run])
  const clearDone = useCallback(
    () => run(itemsRef.current.filter((i) => i.done).map((i) => ({ op: 'delete' as const, id: i.id }))),
    [run],
  )

  return { items, pending, add, toggle, remove, clearDone, refresh: sync }
}
