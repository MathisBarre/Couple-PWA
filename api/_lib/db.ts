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
  // Espace UCPA : la session UCPA de chacun, chiffrée (voir _lib/ucpa/session.ts). Jamais de mot de passe.
  `create table if not exists ucpa_accounts (
    user_id text primary key references users(id) on delete cascade,
    holder text not null default '',
    sealed text not null,
    version integer not null default 0,
    expires_at integer not null,
    synced_at integer,
    created_at text not null default (datetime('now'))
  )`,
  // Séances UCPA réservées par chacun (nom et horaires seulement), pour les montrer à l'autre.
  `create table if not exists ucpa_bookings (
    user_id text not null references users(id) on delete cascade,
    session_id text not null,
    day text not null,
    name text not null,
    start_ms integer not null,
    end_ms integer not null,
    primary key (user_id, session_id)
  )`,
  // Plusieurs cycles par espace (couple de femmes, sœurs…) : chaque cycle suivi a son nom et ses réglages.
  // Le premier cycle d'un espace porte l'id de l'espace (les caches des téléphones restent valables).
  `create table if not exists cycles (
    id text primary key,
    couple_id text not null references couples(id) on delete cascade,
    name text not null default '',
    default_cycle_length integer not null default 28,
    iud_inserted_on text,
    created_at text not null default (datetime('now'))
  )`,
  `create index if not exists cycles_couple on cycles (couple_id)`,
  // Journées notées, par cycle (remplace day_logs, gardée telle quelle comme sauvegarde).
  `create table if not exists cycle_logs (
    cycle_id text not null references cycles(id) on delete cascade,
    day text not null,
    flow integer check (flow between 0 and 5),
    pain integer check (pain between 0 and 3),
    symptoms text not null default '[]',
    note text,
    updated_by text,
    updated_at text not null default (datetime('now')),
    primary key (cycle_id, day)
  )`,
  // Rappel du jour déjà envoyé, par cycle (remplace reminder_log).
  `create table if not exists cycle_reminders (
    cycle_id text not null,
    day text not null,
    kind text not null,
    primary key (cycle_id, day)
  )`,
  // Calendrier commun de l'espace (dates et heures de Paris, voir shared/calendar.ts).
  `create table if not exists calendar_events (
    id text primary key,
    couple_id text not null references couples(id) on delete cascade,
    title text not null,
    start_day text not null,
    end_day text not null,
    start_time text,
    end_time text,
    location text,
    note text,
    created_by text,
    updated_by text,
    created_at text not null default (datetime('now')),
    updated_at text not null default (datetime('now'))
  )`,
  `create index if not exists calendar_events_couple on calendar_events (couple_id, start_day)`,
  `create table if not exists migrations (name text primary key, done_at text not null default (datetime('now')))`,
]

// Passage à plusieurs cycles : chaque espace existant reçoit un premier cycle (même id que l'espace,
// mêmes réglages) et ses journées y sont copiées. Une seule fois (table migrations), en une transaction.
const once = (name: string, sql: string) => `${sql} where not exists (select 1 from migrations where name = '${name}')`
const MIGRATIONS = [
  once(
    'cycles',
    `insert or ignore into cycles (id, couple_id, default_cycle_length, iud_inserted_on)
     select id, id, default_cycle_length, iud_inserted_on from couples`,
  ),
  once(
    'cycles',
    `insert or ignore into cycle_logs (cycle_id, day, flow, pain, symptoms, note, updated_by, updated_at)
     select couple_id, day, flow, pain, symptoms, note, updated_by, updated_at from day_logs`,
  ),
  once('cycles', `insert or ignore into cycle_reminders (cycle_id, day, kind) select couple_id, day, kind from reminder_log`),
  `insert or ignore into migrations (name) values ('cycles')`,
]

/** Colonnes ajoutées après coup (SQLite n'a pas « add column if not exists »). */
const COLUMNS: [table: string, column: string, type: string][] = [
  // Espaces (modules) activés : liste JSON d'ids ; null = tous (espaces créés avant le choix).
  ['couples', 'modules', 'text'],
  // Jeton secret du flux d'abonnement au calendrier commun (webcal), créé à la première demande.
  ['couples', 'calendar_token', 'text'],
  // Liste d'un article de l'espace « Listes » : 'courses' (liste de courses) ou 'todo' (choses à faire).
  ['grocery_items', 'list', "text not null default 'courses'"],
]

async function migrate(conn: Client) {
  await conn.batch(SCHEMA, 'write')
  for (const [table, column, type] of COLUMNS) {
    const { rows } = await conn.execute(`select 1 from pragma_table_info('${table}') where name = '${column}'`)
    if (rows.length) continue
    try {
      await conn.execute(`alter table ${table} add column ${column} ${type}`)
    } catch (e) {
      // Ajoutée entre-temps par une autre fonction qui démarrait en même temps.
      if (!/duplicate column/i.test(String((e as Error).message))) throw e
    }
  }
  await conn.batch(MIGRATIONS, 'write')
}

/** Client prêt à l'emploi ; crée les tables (et migre) au premier appel (aucune migration à lancer). */
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
  if (!ready)
    ready = migrate(client).catch((e) => {
      ready = null // on réessaiera au prochain appel
      throw e
    })
  await ready
  return client
}
