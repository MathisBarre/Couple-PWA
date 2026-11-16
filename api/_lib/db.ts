// Base SQLite hébergée (Turso / libSQL). En local : fichier SQLite (file:local.db).
import type { Client } from '@libsql/client'

let client: Client | null = null
let ready: Promise<void> | null = null

const SCHEMA = [
  `create table if not exists couples (
    id text primary key,
    invite_code text not null unique,
    default_cycle_length integer not null default 28,
    iud_inserted_on text,
    created_at text not null default (datetime('now'))
  )`,
  `create table if not exists users (
    id text primary key,
    email text not null unique collate nocase,
    password_hash text not null,
    display_name text not null default '',
    couple_id text references couples(id) on delete set null,
    created_at text not null default (datetime('now'))
  )`,
  `create table if not exists day_logs (
    couple_id text not null references couples(id) on delete cascade,
    day text not null,
    flow integer check (flow between 0 and 5),
    pain integer check (pain between 0 and 3),
    symptoms text not null default '[]',
    note text,
    updated_by text,
    updated_at text not null default (datetime('now')),
    primary key (couple_id, day)
  )`,
  `create table if not exists push_subscriptions (
    endpoint text primary key,
    user_id text not null references users(id) on delete cascade,
    p256dh text not null,
    auth text not null
  )`,
  `create table if not exists reminder_log (
    couple_id text not null,
    day text not null,
    kind text not null,
    primary key (couple_id, day)
  )`,
  `create table if not exists grocery_items (
    id text primary key,
    couple_id text not null references couples(id) on delete cascade,
    name text not null,
    done integer not null default 0,
    added_by text,
    created_at text not null default (datetime('now')),
    updated_at text not null default (datetime('now'))
  )`,
  `create index if not exists grocery_items_couple on grocery_items (couple_id)`,
  // Choix de chaque membre : quels types de notifications il reçoit (absence de ligne = oui).
  `create table if not exists notification_prefs (
    user_id text not null references users(id) on delete cascade,
    kind text not null,
    enabled integer not null,
    primary key (user_id, kind)
  )`,
  // Ce que chacun vient de saisir, pour prévenir les autres en une seule notification (voir _lib/activity.ts).
  `create table if not exists activity_events (
    id integer primary key autoincrement,
    couple_id text not null,
    author_id text not null,
    kind text not null,
    payload text not null,
    created_at text not null default (datetime('now'))
  )`,
  `create index if not exists activity_events_key on activity_events (couple_id, author_id, kind, id)`,
]

/** Client prêt à l'emploi ; crée les tables au premier appel (aucune migration à lancer). */
export async function db(): Promise<Client> {
  if (!client) {
    const url = process.env.TURSO_DATABASE_URL ?? process.env.TURSO_URL ?? process.env.DATABASE_URL ?? 'file:local.db'
    // Turso : client « web » (HTTP pur). Le client Node complet charge au démarrage un module natif
    // de ~9 Mo (inutile pour une base distante), ce qui alourdit chaque démarrage à froid des fonctions.
    // Le nom du module complet est dans une variable pour qu'il ne soit pas embarqué sur Vercel :
    // il ne sert qu'en local (fichier SQLite).
    const local = '@libsql/client'
    const { createClient } = (url.startsWith('file:') ? await import(local) : await import('@libsql/client/web')) as typeof import('@libsql/client/web')
    client = createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN })
  }
  if (!ready) ready = client.batch(SCHEMA, 'write').then(() => undefined)
  await ready
  return client
}
