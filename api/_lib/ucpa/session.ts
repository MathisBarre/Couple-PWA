// Où vit la session UCPA de chacun : dans la base, chiffrée et authentifiée (AES-256-GCM).
//
// - Le mot de passe UCPA ne sert qu'à la connexion ; il n'est jamais écrit nulle part.
// - Ce qui est gardé (jetons Cognito, cookies UCPA) est chiffré avec une clé dérivée de
//   UCPA_SESSION_SECRET (à défaut AUTH_SECRET), qui ne vit que dans les variables d'environnement
//   de Vercel : une copie de la base seule ne permet pas de se servir du compte.
// - Le chiffré est lié au compte de l'app (données associées = id du compte) : on ne peut pas
//   le recopier sur la ligne de quelqu'un d'autre.
// - Rien de tout ça ne repart vers le téléphone.
import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto'
import { deflateRawSync, inflateRawSync } from 'node:zlib'
import { db } from '../db.js'
import { jarFrom, UcpaClient } from './client.js'

function key() {
  const secret = process.env.UCPA_SESSION_SECRET ?? process.env.AUTH_SECRET
  if (!secret && process.env.VERCEL) throw new Error('UCPA_SESSION_SECRET manquant')
  return Buffer.from(hkdfSync('sha256', secret ?? 'dev-secret', 'a-deux', 'ucpa-session-v1', 32))
}

export function seal(value: unknown, userId: string) {
  const nonce = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key(), nonce)
  cipher.setAAD(Buffer.from(userId))
  const ciphertext = Buffer.concat([cipher.update(deflateRawSync(Buffer.from(JSON.stringify(value)))), cipher.final()])
  return Buffer.concat([nonce, cipher.getAuthTag(), ciphertext]).toString('base64url')
}

export function unseal(value: string, userId: string): unknown {
  try {
    const bytes = Buffer.from(value, 'base64url')
    if (bytes.length < 29) return null
    const decipher = createDecipheriv('aes-256-gcm', key(), bytes.subarray(0, 12))
    decipher.setAAD(Buffer.from(userId))
    decipher.setAuthTag(bytes.subarray(12, 28))
    const payload = Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()])
    return JSON.parse(inflateRawSync(payload, { maxOutputLength: 500_000 }).toString())
  } catch {
    return null
  }
}

interface Stored {
  expiresAt: number
  auth: UcpaClient['auth']
  jar: unknown
}

export interface Account {
  client: UcpaClient
  holder: string
  syncedAt: number | null
  version: number
  /** Refresh token au chargement : s'il a changé, la nouvelle valeur doit être gardée coûte que coûte. */
  refreshToken: string | undefined
}

/** Session UCPA du compte, ou null (jamais connecté, expirée, illisible). */
export async function loadAccount(userId: string): Promise<Account | null> {
  const { rows } = await (await db()).execute({
    sql: 'select holder, sealed, version, synced_at from ucpa_accounts where user_id = ?',
    args: [userId],
  })
  const row = rows[0]
  if (!row) return null
  const state = unseal(String(row.sealed), userId) as Stored | null
  if (!state || !Number.isFinite(state.expiresAt) || state.expiresAt <= Date.now() || !state.jar) {
    await forget(userId)
    return null
  }
  const client = new UcpaClient()
  client.jar = await jarFrom(state.jar)
  client.expiresAt = state.expiresAt
  client.auth = state.auth || null
  return {
    client,
    holder: String(row.holder),
    syncedAt: row.synced_at == null ? null : Number(row.synced_at),
    version: Number(row.version),
    refreshToken: client.auth?.tokens.refreshToken,
  }
}

async function sealedState(client: UcpaClient, userId: string) {
  return seal({ expiresAt: client.expiresAt, auth: client.auth, jar: await client.jar.serialize() } satisfies Stored, userId)
}

/** Première connexion (ou reconnexion) : remplace la session gardée. */
export async function createAccount(userId: string, client: UcpaClient, holder: string) {
  await (await db()).execute({
    sql: `insert into ucpa_accounts (user_id, holder, sealed, version, expires_at) values (?, ?, ?, 0, ?)
          on conflict (user_id) do update set holder = excluded.holder, sealed = excluded.sealed,
          version = ucpa_accounts.version + 1, expires_at = excluded.expires_at`,
    args: [userId, holder.slice(0, 120), await sealedState(client, userId), client.expiresAt],
  })
}

/**
 * Garde la session après usage (cookies et jetons éventuellement renouvelés).
 * Deux requêtes peuvent se croiser : la plus ancienne n'écrase pas la plus récente, sauf si
 * elle seule détient un refresh token renouvelé (sinon il serait perdu).
 */
export async function saveAccount(userId: string, account: Account) {
  const conn = await db()
  const sealed = await sealedState(account.client, userId)
  const res = await conn.execute({
    sql: 'update ucpa_accounts set sealed = ?, version = version + 1, expires_at = ? where user_id = ? and version = ?',
    args: [sealed, account.client.expiresAt, userId, account.version],
  })
  if (res.rowsAffected) {
    account.version++
    return
  }
  if (account.client.auth?.tokens.refreshToken !== account.refreshToken) {
    await conn.execute({
      sql: 'update ucpa_accounts set sealed = ?, version = version + 1, expires_at = ? where user_id = ?',
      args: [sealed, account.client.expiresAt, userId],
    })
  }
}

/** Oublie la session et les séances partagées de ce compte. */
export async function forget(userId: string) {
  await (await db()).batch(
    [
      { sql: 'delete from ucpa_accounts where user_id = ?', args: [userId] },
      { sql: 'delete from ucpa_bookings where user_id = ?', args: [userId] },
    ],
    'write',
  )
}
