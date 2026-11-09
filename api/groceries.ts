// GET  /api/groceries                -> la liste de courses du couple
// POST /api/groceries { ops: [...] } -> applique des modifications (ajout, coche, suppression)
//      puis renvoie la liste à jour. Les opérations sont rejouables sans risque :
//      l'app les met en file d'attente hors ligne et les renvoie au retour du réseau.
import { requireCouple } from './_lib/auth.js'
import { db } from './_lib/db.js'
import { body, error, json } from './_lib/http.js'

export type GroceryOp =
  | { op: 'add'; id: string; name: string }
  | { op: 'check'; id: string; done: boolean }
  | { op: 'delete'; id: string }

const ID = /^[\w-]{8,64}$/
const MAX_NAME = 120

async function list(coupleId: string) {
  const { rows } = await (await db()).execute({
    sql: 'select id, name, done, added_by, created_at from grocery_items where couple_id = ? order by created_at, rowid',
    args: [coupleId],
  })
  return rows.map((r) => ({ id: r.id, name: r.name, done: Boolean(r.done), added_by: r.added_by, created_at: r.created_at }))
}

export async function GET(req: Request) {
  const user = await requireCouple(req)
  if (user instanceof Response) return user
  return json(await list(user.couple_id))
}

export async function POST(req: Request) {
  const user = await requireCouple(req)
  if (user instanceof Response) return user
  const { ops } = await body<{ ops?: GroceryOp[] }>(req)
  if (!Array.isArray(ops) || !ops.length || ops.length > 500) return error('Données invalides')
  const statements = []
  for (const o of ops) {
    if (!o || typeof o.id !== 'string' || !ID.test(o.id)) return error('Article invalide')
    if (o.op === 'add') {
      const name = typeof o.name === 'string' ? o.name.trim().slice(0, MAX_NAME) : ''
      if (!name) return error('Nom d’article vide')
      statements.push({
        // « or ignore » : renvoyer deux fois le même ajout ne crée pas de doublon.
        sql: 'insert or ignore into grocery_items (id, couple_id, name, added_by) values (?, ?, ?, ?)',
        args: [o.id, user.couple_id, name, user.id],
      })
    } else if (o.op === 'check') {
      statements.push({
        // Un article supprimé entre-temps par l'autre n'est pas recréé.
        sql: "update grocery_items set done = ?, updated_at = datetime('now') where id = ? and couple_id = ?",
        args: [o.done ? 1 : 0, o.id, user.couple_id],
      })
    } else if (o.op === 'delete') {
      statements.push({ sql: 'delete from grocery_items where id = ? and couple_id = ?', args: [o.id, user.couple_id] })
    } else return error('Opération inconnue')
  }
  await (await db()).batch(statements, 'write')
  return json(await list(user.couple_id))
}
