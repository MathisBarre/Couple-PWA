// Lien d'invitation /join?code=… : retrouve qui invite, pour personnaliser l'aperçu du lien partagé.
import { db } from './db.js'

const CODE = /^[A-Z0-9]{4,12}$/

export const cleanCode = (raw: string | null) => {
  const code = (raw ?? '').trim().toUpperCase()
  return CODE.test(code) ? code : null
}

/** Prénom de la première personne de l'espace (celle qui invite), ou null si le code est inconnu. */
export async function inviterName(code: string | null): Promise<string | null> {
  if (!code) return null
  try {
    const conn = await db()
    const { rows } = await conn.execute({
      sql: `select u.display_name as name from couples c join users u on u.couple_id = c.id
            where c.invite_code = ? order by u.created_at limit 1`,
      args: [code],
    })
    const name = String(rows[0]?.name ?? '').trim()
    return name ? name.slice(0, 40) : null
  } catch {
    return null
  }
}
