-- Predict — table `profiles` et politiques RLS
--
-- À exécuter dans le SQL Editor du dashboard Supabase.
--
-- Ce script est idempotent et additif : il peut être relancé sans risque et ne
-- supprime aucune donnée. Il ne fait que créer ce qui manque.
--
-- AVANT DE LANCER : si ta table contient déjà des données, vérifie qu'il n'y a
-- pas de doublons de pseudo, sinon la création de l'index unique échouera.
--
--   select lower(username), count(*)
--   from public.profiles
--   group by lower(username)
--   having count(*) > 1;
--
-- Si cette requête renvoie des lignes, corrige-les d'abord.

-- ---------------------------------------------------------------------------
-- 1. Table
-- ---------------------------------------------------------------------------

-- No-op si la table existe déjà.
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Rattrape les colonnes manquantes si la table préexistait avec un autre
-- schéma. `if not exists` rend chaque ligne sans effet si la colonne est là.
alter table public.profiles add column if not exists username text;
alter table public.profiles add column if not exists created_at timestamptz not null default now();
alter table public.profiles add column if not exists updated_at timestamptz not null default now();

-- ---------------------------------------------------------------------------
-- 2. Unicité du pseudo
-- ---------------------------------------------------------------------------

-- Index sur lower(username) et non contrainte unique simple : sans ça,
-- « Toto » et « toto » seraient deux pseudos distincts.
--
-- C'est cet index qui fait remonter l'erreur Postgres 23505, que
-- app/(auth)/login.tsx traduit en « Ce pseudo est déjà pris ». Sans lui, ce
-- message ne se déclenche jamais et les doublons passent.
create unique index if not exists profiles_username_lower_key
  on public.profiles (lower(username));

-- ---------------------------------------------------------------------------
-- 3. Row Level Security
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;

-- `drop policy if exists` avant chaque `create policy` : Postgres n'a pas de
-- `create policy if not exists`, c'est ce qui rend le script relançable.

-- Lecture réservée aux utilisateurs connectés. Le fil d'actualité aura besoin
-- de lire les pseudos des autres, d'où la portée large.
-- Pour rendre les profils lisibles sans être connecté (deep links publics,
-- SEO), remplacer `to authenticated` par `to anon, authenticated` — mais
-- n'importe qui pourrait alors énumérer tous les pseudos avec la clé anon.
drop policy if exists "profiles_select_authenticated" on public.profiles;
create policy "profiles_select_authenticated"
  on public.profiles
  for select
  to authenticated
  using (true);

-- Chacun ne peut créer que son propre profil. C'est ce qui autorise l'insert
-- fait par le client juste après signUp.
drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own"
  on public.profiles
  for insert
  to authenticated
  with check (auth.uid() = id);

-- Nécessaire pour l'`upsert` du client : en cas de conflit il bascule en
-- update, ce qu'une policy insert seule ne couvre pas.
drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
  on public.profiles
  for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- Pas de policy `delete` : la suppression du compte dans auth.users supprime le
-- profil par cascade. Un utilisateur n'a pas à supprimer son profil seul.

-- ---------------------------------------------------------------------------
-- 4. Tenue à jour de updated_at
-- ---------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 5. OPTIONNEL — création du profil côté base
-- ---------------------------------------------------------------------------
--
-- Le client insère déjà le profil après signUp, ce qui suffit quand la
-- confirmation d'email est DÉSACTIVÉE (une session est ouverte immédiatement).
--
-- Si tu ACTIVES la confirmation d'email, signUp ne renvoie pas de session :
-- l'insert client ne peut pas passer la RLS, et le profil n'est créé qu'au
-- premier login. Décommente ce bloc pour que la base s'en charge — il lit le
-- username dans les user_metadata, que login.tsx renseigne déjà.
--
-- `security definer` est nécessaire : le trigger tourne hors session utilisateur.
--
-- create or replace function public.handle_new_user()
-- returns trigger
-- language plpgsql
-- security definer
-- set search_path = ''
-- as $$
-- begin
--   insert into public.profiles (id, username)
--   values (
--     new.id,
--     coalesce(new.raw_user_meta_data ->> 'username', 'joueur_' || left(new.id::text, 8))
--   )
--   on conflict (id) do nothing;
--   return new;
-- end;
-- $$;
--
-- drop trigger if exists on_auth_user_created on auth.users;
-- create trigger on_auth_user_created
--   after insert on auth.users
--   for each row execute function public.handle_new_user();
