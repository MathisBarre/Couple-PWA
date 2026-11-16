// Cycles suivis dans un espace. Le premier (créé avec l'espace) porte l'id de l'espace.
import type { Client } from '@libsql/client'

export interface CycleRow {
  id: string
  name: string
  default_cycle_length: number
  iud_inserted_on: string | null
}

/** Cycles de l'espace, le premier d'abord puis par ordre d'ajout. En crée un s'il n'y en a aucun. */
export async function cyclesOf(conn: Client, coupleId: string): Promise<CycleRow[]> {
  const read = () =>
    conn.execute({
      sql: `select id, name, default_cycle_length, iud_inserted_on from cycles where couple_id = ?
            order by (id = couple_id) desc, created_at, id`,
      args: [coupleId],
    })
  let { rows } = await read()
  if (!rows.length) {
    await conn.execute({
      sql: `insert or ignore into cycles (id, couple_id, default_cycle_length, iud_inserted_on)
            select id, id, default_cycle_length, iud_inserted_on from couples where id = ?`,
      args: [coupleId],
    })
    rows = (await read()).rows
  }
  return rows.map((r) => ({
    id: String(r.id),
    name: String(r.name ?? ''),
    default_cycle_length: Number(r.default_cycle_length),
    iud_inserted_on: r.iud_inserted_on == null ? null : String(r.iud_inserted_on),
  }))
}

/**
 * Cycle visé par une requête (`?cycle=…`), s'il appartient bien à l'espace. Sans précision
 * (app d'avant les cycles multiples, encore en cache sur un téléphone) : le premier cycle.
 */
export async function cycleFor(conn: Client, coupleId: string, requested: string | null): Promise<string | null> {
  if (!requested) return (await cyclesOf(conn, coupleId))[0]?.id ?? null
  const { rows } = await conn.execute({ sql: 'select id from cycles where id = ? and couple_id = ?', args: [requested, coupleId] })
  return rows[0] ? String(rows[0].id) : null
}
