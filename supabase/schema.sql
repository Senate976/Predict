-- Predict — tables `profiles` et `predictions`, et politiques RLS
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

-- Le `create table if not exists` ci-dessus est un no-op si la table existe
-- déjà — y compris si son `id` n'est pas un uuid (cas d'une table créée via le
-- Table Editor, qui met un `bigint identity` par défaut). Les policies de la
-- section 3 comparent alors auth.uid() (uuid) à cet id et échouent sur un
-- « operator does not exist: uuid = bigint » qui ne dit pas d'où vient le
-- problème. On arrête ici, avec un message qui le dit.
do $$
declare
  id_type text;
begin
  select data_type into id_type
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'profiles'
    and column_name = 'id';

  if id_type is not null and id_type <> 'uuid' then
    raise exception
      'public.profiles.id est de type "%" alors que le schéma attend uuid '
      '(clé étrangère vers auth.users.id). Migre la colonne avant de relancer '
      'ce script.', id_type;
  end if;
end;
$$;

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
-- 5. Création du profil côté base
-- ---------------------------------------------------------------------------
--
-- ACTIF, et valable que la confirmation d'email soit activée ou non.
--
-- Confirmation ACTIVÉE : signUp ne renvoie pas de session, donc l'insert fait
-- par le client ne peut pas passer la RLS. C'est ce trigger qui crée le profil,
-- en lisant le username dans les user_metadata que login.tsx renseigne déjà.
--
-- Confirmation DÉSACTIVÉE (le cas en développement, cf. README) : la session
-- est ouverte immédiatement et l'upsert client de login.tsx passe. Le trigger a
-- déjà créé la ligne, l'upsert bascule alors en update — d'où la policy
-- profiles_update_own. `on conflict (id) do nothing` rend les deux chemins
-- compatibles dans les deux sens.
--
-- `security definer` est nécessaire : le trigger tourne hors session utilisateur.
--
-- ATTENTION — si le pseudo est déjà pris, l'insert viole
-- profiles_username_lower_key ; l'exception remonte, annule la création de la
-- ligne dans auth.users, et signUp échoue avec un `unexpected_failure` opaque.
-- La vérification faite par login.tsx avant signUp évite ce cas ; la section 6
-- fournit la fonction qu'elle appelle.
--
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, username)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'username', 'joueur_' || left(new.id::text, 8))
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- 6. Disponibilité du pseudo, testable avant inscription
-- ---------------------------------------------------------------------------
--
-- login.tsx vérifie le pseudo AVANT signUp, donc avec le rôle `anon`. Or
-- `profiles_select_authenticated` réserve la lecture aux connectés : un select
-- direct sur profiles renverrait 0 ligne quel que soit le pseudo, et les
-- annoncerait donc tous comme libres. D'où cette fonction.
--
-- `security definer` contourne la RLS, mais l'exposition reste limitée à un
-- booléen pour un pseudo donné : le rôle anon peut tester « toto est-il pris ? »
-- sans pouvoir énumérer la table, ce qu'un `to anon` sur la policy de select
-- aurait permis.
--
-- `lower(trim(...))` reproduit exactement profiles_username_lower_key et le
-- trim fait par le client, sinon la vérification et la contrainte pourraient
-- ne pas être d'accord.

create or replace function public.is_username_available(candidate text)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select not exists (
    select 1
    from public.profiles
    where lower(username) = lower(trim(candidate))
  );
$$;

-- `security definer` + EXECUTE ouvert à tous par défaut : on restreint aux deux
-- rôles qui en ont besoin.
revoke all on function public.is_username_available(text) from public;
grant execute on function public.is_username_available(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 7. Table `predictions`
-- ---------------------------------------------------------------------------

-- `author_id` référence public.profiles et non auth.users, alors que les deux
-- donneraient la même intégrité (profiles.id est lui-même une clé étrangère
-- vers auth.users). C'est ce qui permettra au fil d'actualité de récupérer le
-- pseudo de l'auteur en une requête — PostgREST ne sait embarquer
-- `profiles(username)` que s'il voit une clé étrangère vers cette table :
--
--   select('*, author:profiles(username)')
--
-- Une référence vers auth.users obligerait à une seconde requête. La cascade
-- reste complète : suppression du compte → du profil → de ses prédictions.
create table if not exists public.predictions (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles (id) on delete cascade,
  content text not null,
  reveal_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- `drop` puis `add` : Postgres n'a pas d'`add constraint if not exists`, c'est
-- ce qui rend la ligne relançable.
--
-- `btrim` et non `char_length(content)` seul : sans ça, une prédiction faite
-- uniquement d'espaces passerait la contrainte. Le client trim aussi, la
-- contrainte est le garde-fou si un jour il oublie.
alter table public.predictions drop constraint if exists predictions_content_length;
alter table public.predictions add constraint predictions_content_length
  check (char_length(btrim(content)) between 1 and 280);

-- La liste « mes prédictions » filtre sur author_id et trie sur reveal_at ;
-- l'index couvre les deux d'un coup.
create index if not exists predictions_author_reveal_idx
  on public.predictions (author_id, reveal_at desc);

-- Pour le futur fil d'actualité, qui lira les prédictions révélées les plus
-- récentes sans filtrer par auteur.
create index if not exists predictions_reveal_at_idx
  on public.predictions (reveal_at desc);

drop trigger if exists predictions_set_updated_at on public.predictions;
create trigger predictions_set_updated_at
  before update on public.predictions
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 8. Row Level Security des prédictions
-- ---------------------------------------------------------------------------

alter table public.predictions enable row level security;

-- LE MÉCANISME DE RÉVÉLATION EST ICI, et nulle part ailleurs.
--
-- Une prédiction non révélée n'est lisible que par son auteur. C'est la base
-- qui compare reveal_at à son horloge : le client ne peut pas voir la
-- prédiction d'un autre avant l'heure, même en forgeant la requête à la main
-- avec la clé anon. Ne jamais déplacer ce filtre côté client — ce serait
-- masquer un contenu que l'API renverrait quand même.
drop policy if exists "predictions_select_visible" on public.predictions;
create policy "predictions_select_visible"
  on public.predictions
  for select
  to authenticated
  using (author_id = auth.uid() or reveal_at <= now());

-- `reveal_at > now()` : on ne peut pas créer une prédiction déjà révélée, ce
-- qui reviendrait à publier après coup en se donnant l'air d'avoir prédit.
-- C'est aussi ce qui remonte en 42501 côté client si la date saisie est
-- passée ; d'où la marge d'une minute imposée à la saisie.
drop policy if exists "predictions_insert_own" on public.predictions;
create policy "predictions_insert_own"
  on public.predictions
  for insert
  to authenticated
  with check (author_id = auth.uid() and reveal_at > now());

-- Modification réservée à l'auteur, et seulement avant révélation : une fois
-- dévoilée, une prédiction est un engagement, la réécrire n'aurait pas de sens.
-- Le `using` porte sur la ligne avant modification, le `with check` sur la
-- ligne après : les deux sont nécessaires, sinon on pourrait repousser
-- reveal_at indéfiniment ou changer d'auteur.
drop policy if exists "predictions_update_own_before_reveal" on public.predictions;
create policy "predictions_update_own_before_reveal"
  on public.predictions
  for update
  to authenticated
  using (author_id = auth.uid() and reveal_at > now())
  with check (author_id = auth.uid() and reveal_at > now());

-- Suppression autorisée à tout moment, y compris après révélation : c'est le
-- seul recours de l'auteur sur un contenu qui parle de quelqu'un d'autre.
drop policy if exists "predictions_delete_own" on public.predictions;
create policy "predictions_delete_own"
  on public.predictions
  for delete
  to authenticated
  using (author_id = auth.uid());
