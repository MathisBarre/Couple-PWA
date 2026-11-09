-- Schéma de l'app de suivi de cycle partagée à deux.
-- À exécuter dans Supabase > SQL Editor (ou `supabase db push`).

create extension if not exists pgcrypto;

-- Un "couple" regroupe les données partagées.
create table public.couples (
  id uuid primary key default gen_random_uuid(),
  invite_code text not null unique default upper(substr(encode(gen_random_bytes(6), 'hex'), 1, 6)),
  time_zone text not null default 'Europe/Paris',
  reminder_hour smallint not null default 20 check (reminder_hour between 0 and 23),
  default_cycle_length smallint not null default 28 check (default_cycle_length between 15 and 60),
  iud_inserted_on date,
  created_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users on delete cascade,
  couple_id uuid references public.couples on delete set null,
  display_name text not null default '',
  created_at timestamptz not null default now()
);

-- Une ligne par jour noté.
create table public.day_logs (
  couple_id uuid not null references public.couples on delete cascade,
  day date not null,
  flow smallint check (flow between 0 and 5),       -- 0 rien … 5 très abondant
  pain smallint check (pain between 0 and 3),       -- 0 aucune … 3 forte
  symptoms text[] not null default '{}',
  note text,
  updated_by uuid references auth.users on delete set null,
  updated_at timestamptz not null default now(),
  primary key (couple_id, day)
);

create table public.push_subscriptions (
  endpoint text primary key,
  user_id uuid not null references auth.users on delete cascade,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);

-- Évite d'envoyer deux rappels le même jour au même couple.
create table public.reminder_log (
  couple_id uuid not null references public.couples on delete cascade,
  day date not null,
  kind text not null,
  sent_at timestamptz not null default now(),
  primary key (couple_id, day)
);

-- Profil créé automatiquement à l'inscription.
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)));
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Couple de l'utilisateur courant (utilisé par les règles RLS).
create function public.my_couple_id() returns uuid
language sql stable security definer set search_path = public as $$
  select couple_id from public.profiles where id = auth.uid()
$$;

-- Créer un couple et s'y rattacher.
create function public.create_couple() returns public.couples
language plpgsql security definer set search_path = public as $$
declare c public.couples;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  insert into public.couples default values returning * into c;
  update public.profiles set couple_id = c.id where id = auth.uid();
  return c;
end $$;

-- Rejoindre le couple de son/sa partenaire avec le code d'invitation.
create function public.join_couple(code text) returns public.couples
language plpgsql security definer set search_path = public as $$
declare c public.couples;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  select * into c from public.couples where invite_code = upper(trim(code));
  if c.id is null then raise exception 'Code invalide'; end if;
  if (select count(*) from public.profiles where couple_id = c.id) >= 2 then
    raise exception 'Ce couple a déjà deux membres';
  end if;
  update public.profiles set couple_id = c.id where id = auth.uid();
  return c;
end $$;

-- Sécurité : chacun ne voit que les données de son couple.
alter table public.couples enable row level security;
alter table public.profiles enable row level security;
alter table public.day_logs enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.reminder_log enable row level security;

create policy "couple: lecture" on public.couples for select using (id = public.my_couple_id());
create policy "couple: modification" on public.couples for update using (id = public.my_couple_id());

create policy "profils: lecture du couple" on public.profiles for select
  using (id = auth.uid() or couple_id = public.my_couple_id());
create policy "profils: modifier le sien" on public.profiles for update using (id = auth.uid())
  with check (id = auth.uid() and couple_id is not distinct from public.my_couple_id());

create policy "jours: tout pour le couple" on public.day_logs for all
  using (couple_id = public.my_couple_id())
  with check (couple_id = public.my_couple_id());

create policy "push: les siennes" on public.push_subscriptions for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Temps réel : l'autre voit les saisies instantanément.
alter publication supabase_realtime add table public.day_logs;
