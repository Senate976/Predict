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
-- `false` par défaut : c'est ce qui déclenche l'écran de bienvenue juste
-- après l'inscription (lib/auth.tsx), avant que l'utilisateur ne le ferme.
alter table public.profiles add column if not exists onboarded boolean not null default false;
-- Facultatif — visible par tout le monde au même titre que le pseudo/avatar
-- (`profiles_select_authenticated`, section 3, ne distingue pas les colonnes).
alter table public.profiles add column if not exists phone text;

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
-- `content` n'apparaît plus ici : le contenu secret vit dans
-- `public.prediction_contents` (section 10), une table à part dont la RLS
-- masque vraiment la ligne avant `reveal_at`. Sur un projet neuf, cette table
-- est donc créée sans lui ; sur un projet existant, la section 10 migre la
-- colonne `content` si elle existe encore puis la supprime.
create table if not exists public.predictions (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles (id) on delete cascade,
  reveal_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- La liste « mes prédictions » filtre sur author_id et trie sur reveal_at ;
-- l'index couvre les deux d'un coup.
create index if not exists predictions_author_reveal_idx
  on public.predictions (author_id, reveal_at desc);

-- Pour le futur fil d'actualité, qui lira les prédictions révélées les plus
-- récentes sans filtrer par auteur.
create index if not exists predictions_reveal_at_idx
  on public.predictions (reveal_at desc);

-- `true` : l'auteur n'a pas fixé de date, `reveal_at` porte alors une valeur
-- lointaine posée par le client à la création — un simple repère technique,
-- jamais affiché tel quel (section 24, `reveal_prediction_now`). Purement
-- déclaratif pour l'affichage : ne change rien au calcul de `is_revealed`,
-- qui reste `reveal_at <= now()` partout, sans exception.
alter table public.predictions add column if not exists open_ended boolean not null default false;

-- Catégorie choisie à la création, pour classer/filtrer le Fil (section 26).
alter table public.predictions add column if not exists category text not null default 'autre';
alter table public.predictions drop constraint if exists predictions_category_valid;
alter table public.predictions add constraint predictions_category_valid
  check (category in ('politique', 'sport', 'amour', 'star', 'business', 'culture', 'amis', 'autre'));

drop trigger if exists predictions_set_updated_at on public.predictions;
create trigger predictions_set_updated_at
  before update on public.predictions
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 8. Row Level Security des prédictions
-- ---------------------------------------------------------------------------

alter table public.predictions enable row level security;

-- La policy de lecture (`predictions_select_visible`) est définie section 11,
-- avec le reste de l'audience du Cercle : elle a besoin de `prediction_access`,
-- qui n'existe pas encore à ce stade du script.

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

-- ---------------------------------------------------------------------------
-- 9. Le Cercle — amis
-- ---------------------------------------------------------------------------
--
-- Une seule ligne par relation, quel que soit qui a demandé à qui.
-- `requester_id` = celui qui a envoyé la demande, `addressee_id` = celui qui la
-- reçoit. Statut 'pending' tant qu'elle n'est pas acceptée, 'accepted' une fois
-- que l'addressee a répondu. Pas de statut 'declined' : refuser ou annuler une
-- demande supprime la ligne (policy delete plus bas), pour permettre de
-- redemander plus tard sans ligne fantôme.
create table if not exists public.friendships (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.profiles (id) on delete cascade,
  addressee_id uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Si une table `friendships` existait déjà avec d'autres noms de colonnes
-- (`user_id`/`friend_id`, plan initial avant cette migration), le `create
-- table if not exists` ci-dessus est un no-op et laisse ces anciens noms en
-- place. On les renomme ici plutôt que d'obliger à tout supprimer — chaque
-- renommage ne s'exécute que si l'ancienne colonne existe et la nouvelle pas
-- encore, donc sans effet sur une table déjà à jour.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'friendships' and column_name = 'user_id'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'friendships' and column_name = 'requester_id'
  ) then
    execute 'alter table public.friendships rename column user_id to requester_id';
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'friendships' and column_name = 'friend_id'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'friendships' and column_name = 'addressee_id'
  ) then
    execute 'alter table public.friendships rename column friend_id to addressee_id';
  end if;
end;
$$;

-- Rattrape les colonnes manquantes si la table préexistante n'avait que
-- `user_id`/`friend_id`/`status` (plan initial), sans `created_at`/`updated_at`.
alter table public.friendships add column if not exists status text not null default 'pending';
alter table public.friendships add column if not exists created_at timestamptz not null default now();
alter table public.friendships add column if not exists updated_at timestamptz not null default now();

-- Renomme les contraintes de clé étrangère héritées de l'ancien schéma
-- (`user_id`/`friend_id`) vers les noms attendus par lib/friends.ts
-- (`profiles!friendships_requester_id_fkey` / `..._addressee_id_fkey`).
-- Renommer une COLONNE (juste au-dessus) ne renomme pas la CONTRAINTE qui
-- porte dessus : elle garde son nom d'origine (ex. `friendships_user_id_fkey`).
-- PostgREST a besoin du nom exact pour résoudre l'embed demandé par le
-- client, d'où l'erreur « could not find a relationship between friendships
-- and profiles » tant que ce renommage n'a pas eu lieu.
do $$
declare
  old_name text;
begin
  select conname into old_name
  from pg_constraint
  where conrelid = 'public.friendships'::regclass
    and contype = 'f'
    and pg_get_constraintdef(oid) like 'FOREIGN KEY (requester_id)%';

  if old_name is not null and old_name <> 'friendships_requester_id_fkey' then
    execute format('alter table public.friendships rename constraint %I to friendships_requester_id_fkey', old_name);
  end if;

  select conname into old_name
  from pg_constraint
  where conrelid = 'public.friendships'::regclass
    and contype = 'f'
    and pg_get_constraintdef(oid) like 'FOREIGN KEY (addressee_id)%';

  if old_name is not null and old_name <> 'friendships_addressee_id_fkey' then
    execute format('alter table public.friendships rename constraint %I to friendships_addressee_id_fkey', old_name);
  end if;
end;
$$;

-- Filet de sécurité si l'une des deux contraintes n'existe pas du tout
-- (table créée sans clé étrangère inline, ou contrainte supprimée entre-temps).
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.friendships'::regclass and conname = 'friendships_requester_id_fkey'
  ) then
    alter table public.friendships add constraint friendships_requester_id_fkey
      foreign key (requester_id) references public.profiles (id) on delete cascade;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.friendships'::regclass and conname = 'friendships_addressee_id_fkey'
  ) then
    alter table public.friendships add constraint friendships_addressee_id_fkey
      foreign key (addressee_id) references public.profiles (id) on delete cascade;
  end if;
end;
$$;

alter table public.friendships drop constraint if exists friendships_no_self;
alter table public.friendships add constraint friendships_no_self
  check (requester_id <> addressee_id);

alter table public.friendships drop constraint if exists friendships_status_valid;
alter table public.friendships add constraint friendships_status_valid
  check (status in ('pending', 'accepted'));

-- Une seule relation entre deux personnes, indépendamment du sens : sans ce
-- `least`/`greatest`, Alice pourrait demander Bob alors que Bob a déjà demandé
-- Alice, et on se retrouverait avec deux lignes contradictoires.
create unique index if not exists friendships_pair_key
  on public.friendships (least(requester_id, addressee_id), greatest(requester_id, addressee_id));

drop trigger if exists friendships_set_updated_at on public.friendships;
create trigger friendships_set_updated_at
  before update on public.friendships
  for each row execute function public.set_updated_at();

alter table public.friendships enable row level security;

-- Chacun voit les relations où il apparaît, dans un sens ou dans l'autre —
-- c'est ce qui alimente à la fois « mes amis », « demandes reçues » et
-- « demandes envoyées ».
drop policy if exists "friendships_select_own" on public.friendships;
create policy "friendships_select_own"
  on public.friendships
  for select
  to authenticated
  using (auth.uid() = requester_id or auth.uid() = addressee_id);

-- On ne peut créer une demande qu'en son propre nom, et seulement à l'état
-- 'pending' — personne ne peut se déclarer déjà ami de force.
drop policy if exists "friendships_insert_own" on public.friendships;
create policy "friendships_insert_own"
  on public.friendships
  for insert
  to authenticated
  with check (auth.uid() = requester_id and status = 'pending');

-- Seul le destinataire peut faire passer une demande de 'pending' à
-- 'accepted' — c'est l'acceptation. Le `using` vérifie l'état avant
-- modification, le `with check` l'état après, pour empêcher toute autre
-- transition (repasser accepted -> pending, changer les id...).
drop policy if exists "friendships_accept" on public.friendships;
create policy "friendships_accept"
  on public.friendships
  for update
  to authenticated
  using (auth.uid() = addressee_id and status = 'pending')
  with check (auth.uid() = addressee_id and status = 'accepted');

-- Suppression par l'une ou l'autre partie : annuler une demande envoyée,
-- refuser une demande reçue, ou mettre fin à une amitié acceptée.
drop policy if exists "friendships_delete_own" on public.friendships;
create policy "friendships_delete_own"
  on public.friendships
  for delete
  to authenticated
  using (auth.uid() = requester_id or auth.uid() = addressee_id);

-- ---------------------------------------------------------------------------
-- 10. Prédictions scellées — teaser, audience
-- ---------------------------------------------------------------------------
--
-- Le contenu secret quitte la table `predictions` pour vivre dans
-- `prediction_contents`, une table à part avec sa propre RLS. Raison : la RLS
-- Postgres filtre des LIGNES, pas des colonnes — si `content` restait dans
-- `predictions` et que la policy de lecture autorisait un destinataire à voir
-- la ligne (pour lire le teaser), n'importe quel `select('content')` sur cette
-- même ligne renverrait aussi le contenu secret avant l'heure. En le séparant,
-- la ligne de `prediction_contents` a sa propre policy qui, elle, vérifie
-- vraiment `reveal_at`. C'est le même principe que pour `predictions` :
-- le mécanisme de révélation doit rester en base, jamais côté client.
alter table public.predictions add column if not exists teaser text;
alter table public.predictions add column if not exists scope text;

-- Pas de titre séparé : uniquement un teaser et le contenu scellé. Si une
-- exécution précédente de ce script avait ajouté `title` (avant ce
-- changement), on la retire — sans perte pour le teaser ou le contenu, qui
-- vivent chacun dans leur propre colonne/table. `cascade` : la vue
-- `predictions_feed` (section 13) dépend de cette colonne ; elle est de toute
-- façon recréée plus bas, sans `title`.
alter table public.predictions drop column if exists title cascade;

-- Le contenu secret lui-même. Une ligne par prédiction (clé primaire =
-- clé étrangère), jamais créée ni lue en dehors de la fonction
-- `create_prediction` et de la vue `predictions_feed` plus bas. Créée avant la
-- migration ci-dessous, qui a besoin qu'elle existe pour y déplacer les
-- éventuelles données.
create table if not exists public.prediction_contents (
  prediction_id uuid primary key references public.predictions (id) on delete cascade,
  content text not null,
  created_at timestamptz not null default now()
);

-- Migre le contenu déjà présent dans `predictions.content` (schéma d'avant
-- cette migration) vers la nouvelle table, et backfille teaser/scope au
-- passage — avant de retirer la colonne. `execute` en dynamique : sur un
-- projet neuf, la colonne `content` n'a jamais existé, et y référencer
-- directement dans une requête statique échouerait à la compilation même si
-- la branche ne s'exécute pas.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'predictions' and column_name = 'content'
  ) then
    execute $sql$
      insert into public.prediction_contents (prediction_id, content)
      select id, content from public.predictions
      on conflict (prediction_id) do nothing
    $sql$;

    execute $sql$
      update public.predictions
      set
        teaser = coalesce(teaser, left(btrim(content), 80)),
        scope = coalesce(scope, 'circle')
      where teaser is null or scope is null
    $sql$;

    execute 'alter table public.predictions drop column content';
  end if;
end;
$$;

-- Filet de sécurité si, pour une autre raison, teaser/scope restaient null
-- (ex : colonnes ajoutées sans ligne `content` préexistante).
update public.predictions
set
  teaser = coalesce(teaser, 'Une prédiction est en cours…'),
  scope = coalesce(scope, 'circle')
where teaser is null or scope is null;

alter table public.predictions alter column teaser set not null;
alter table public.predictions alter column scope set not null;
alter table public.predictions alter column scope set default 'circle';

alter table public.predictions drop constraint if exists predictions_teaser_length;
alter table public.predictions add constraint predictions_teaser_length
  check (char_length(btrim(teaser)) between 1 and 160);

alter table public.prediction_contents drop constraint if exists prediction_contents_length;
alter table public.prediction_contents add constraint prediction_contents_length
  check (char_length(btrim(content)) between 1 and 560);

-- Qui peut voir une prédiction — indépendamment de la révélation. Peuplée à la
-- création par `create_prediction`, jamais éditée à la main ensuite.
create table if not exists public.prediction_access (
  prediction_id uuid not null references public.predictions (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (prediction_id, user_id)
);

create index if not exists prediction_access_user_idx
  on public.prediction_access (user_id);

-- ---------------------------------------------------------------------------
-- 11. RLS de l'audience et du contenu scellé
-- ---------------------------------------------------------------------------

-- `security definer` : tourne avec les droits de son propriétaire et non de
-- l'appelant, donc son `select` sur `prediction_access` ne redéclenche pas la
-- RLS de cette table. Utilisée uniquement par `predictions_select_visible`
-- ci-dessous, pour casser le cycle expliqué dans son commentaire.
create or replace function public.has_prediction_access(p_prediction_id uuid, p_user_id uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1 from public.prediction_access
    where prediction_id = p_prediction_id and user_id = p_user_id
  );
$$;

revoke all on function public.has_prediction_access(uuid, uuid) from public;
grant execute on function public.has_prediction_access(uuid, uuid) to authenticated;

-- Un destinataire doit pouvoir voir la ligne `predictions` (titre, teaser,
-- date) dès la création, sans attendre reveal_at : c'est le Teaser, censé être
-- lisible immédiatement. Remplace l'ancienne policy qui rendait toute
-- prédiction révélée visible à n'importe quel utilisateur connecté — avec Le
-- Cercle, la visibilité est restreinte à l'audience choisie par l'auteur.
--
-- Passe par `has_prediction_access` (fonction `security definer` définie
-- juste en dessous) plutôt que par un `exists (select ... from
-- prediction_access ...)` direct : `prediction_access_select` (section
-- suivante) interroge elle-même `predictions` pour savoir si l'appelant en
-- est l'auteur. Les deux policies s'appelant l'une l'autre en direct forment
-- un cycle — Postgres l'a signalé par « infinite recursion detected in
-- policy for relation "predictions" ». `has_prediction_access` tourne avec
-- les droits de son propriétaire (le rôle qui a exécuté ce script), qui n'a
-- pas la RLS forcée sur ses propres tables : elle lit `prediction_access`
-- sans redéclencher sa policy, ce qui casse le cycle.
drop policy if exists "predictions_select_visible" on public.predictions;
create policy "predictions_select_visible"
  on public.predictions
  for select
  to authenticated
  using (
    author_id = auth.uid()
    or public.has_prediction_access(id, auth.uid())
  );

alter table public.prediction_access enable row level security;

-- L'auteur voit qui a accès à ses prédictions, et n'importe quel destinataire
-- voit le reste de l'audience de la même prédiction (pas seulement sa propre
-- ligne) — ouvrir une prédiction doit montrer qui d'autre la reçoit, pas
-- seulement à l'auteur. Passe par `has_prediction_access` plutôt qu'un
-- second `exists (select ... from prediction_access ...)` direct sur la
-- table elle-même : cette fonction tourne `security definer`, donc son
-- propre `select` ne redéclenche pas cette policy.
drop policy if exists "prediction_access_select" on public.prediction_access;
create policy "prediction_access_select"
  on public.prediction_access
  for select
  to authenticated
  using (
    exists (
      select 1 from public.predictions p
      where p.id = prediction_access.prediction_id and p.author_id = auth.uid()
    )
    or public.has_prediction_access(prediction_access.prediction_id, auth.uid())
  );

-- Seul l'auteur de la prédiction peut accorder un accès, et seulement à un ami
-- accepté — jamais à n'importe qui. C'est ce qui empêche un client de forger
-- un accès pour un inconnu même en connaissant son id.
drop policy if exists "prediction_access_insert" on public.prediction_access;
create policy "prediction_access_insert"
  on public.prediction_access
  for insert
  to authenticated
  with check (
    exists (
      select 1 from public.predictions p
      where p.id = prediction_access.prediction_id and p.author_id = auth.uid()
    )
    and exists (
      select 1 from public.friendships f
      where f.status = 'accepted'
        and (
          (f.requester_id = auth.uid() and f.addressee_id = prediction_access.user_id)
          or (f.addressee_id = auth.uid() and f.requester_id = prediction_access.user_id)
        )
    )
  );

-- L'auteur gère ses destinataires à tout moment, y compris après révélation :
-- contrairement au contenu (figé, c'est un engagement passé), l'audience
-- reste à la main de l'auteur — il doit pouvoir retirer quelqu'un même après
-- coup.
drop policy if exists "prediction_access_delete" on public.prediction_access;
create policy "prediction_access_delete"
  on public.prediction_access
  for delete
  to authenticated
  using (
    exists (
      select 1 from public.predictions p
      where p.id = prediction_access.prediction_id
        and p.author_id = auth.uid()
    )
  );

alter table public.prediction_contents enable row level security;

-- LE VRAI VERROU DU CONTENU SCELLÉ, et nulle part ailleurs.
--
-- L'auteur voit toujours son propre contenu. Un destinataire ne le voit que
-- s'il a un accès *et* que reveal_at est passé. Avant l'heure, cette table ne
-- renvoie tout simplement aucune ligne pour lui — pas une ligne masquée côté
-- client, une ligne que Postgres refuse de rendre.
drop policy if exists "prediction_contents_select" on public.prediction_contents;
create policy "prediction_contents_select"
  on public.prediction_contents
  for select
  to authenticated
  using (
    exists (
      select 1 from public.predictions p
      where p.id = prediction_contents.prediction_id and p.author_id = auth.uid()
    )
    or exists (
      select 1 from public.predictions p
      join public.prediction_access pa on pa.prediction_id = p.id
      where p.id = prediction_contents.prediction_id
        and pa.user_id = auth.uid()
        and p.reveal_at <= now()
    )
  );

-- Écriture réservée à la fonction `create_prediction` (elle tourne avec les
-- droits de l'appelant, donc ces policies s'appliquent aussi à elle) : seul
-- l'auteur, et seulement avant la révélation.
drop policy if exists "prediction_contents_insert" on public.prediction_contents;
create policy "prediction_contents_insert"
  on public.prediction_contents
  for insert
  to authenticated
  with check (
    exists (
      select 1 from public.predictions p
      where p.id = prediction_contents.prediction_id
        and p.author_id = auth.uid()
        and p.reveal_at > now()
    )
  );

drop policy if exists "prediction_contents_update_before_reveal" on public.prediction_contents;
create policy "prediction_contents_update_before_reveal"
  on public.prediction_contents
  for update
  to authenticated
  using (
    exists (
      select 1 from public.predictions p
      where p.id = prediction_contents.prediction_id
        and p.author_id = auth.uid()
        and p.reveal_at > now()
    )
  )
  with check (
    exists (
      select 1 from public.predictions p
      where p.id = prediction_contents.prediction_id
        and p.author_id = auth.uid()
        and p.reveal_at > now()
    )
  );

-- ---------------------------------------------------------------------------
-- 12. Création atomique d'une prédiction scellée
-- ---------------------------------------------------------------------------
--
-- `security invoker` (le défaut) et non `definer` : cette fonction ne
-- contourne aucune des policies ci-dessus, elle regroupe juste trois inserts
-- qui, sinon, demanderaient au client de gérer une transaction lui-même. Si
-- une des policies refuse (ex : ami non accepté dans `p_friend_ids`), toute la
-- fonction échoue et rien n'est créé — jamais de prédiction à moitié posée.
--
-- `drop function` avant : Postgres refuse un `create or replace` qui change
-- la liste des paramètres (ici, `p_title` en moins par rapport à une version
-- antérieure de ce script).
drop function if exists public.create_prediction(text, text, text, timestamptz, text, uuid[]);

create or replace function public.create_prediction(
  p_teaser text,
  p_content text,
  p_reveal_at timestamptz,
  p_scope text,
  p_friend_ids uuid[] default array[]::uuid[]
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid;
  v_recipient uuid;
begin
  insert into public.predictions (author_id, teaser, reveal_at, scope)
  values (auth.uid(), p_teaser, p_reveal_at, p_scope)
  returning id into v_id;

  insert into public.prediction_contents (prediction_id, content)
  values (v_id, p_content);

  if p_scope = 'circle' then
    -- Tout le cercle actuel : tous les amis acceptés au moment de la création.
    -- L'audience est figée ici — un ami ajouté plus tard ne voit pas les
    -- prédictions passées.
    insert into public.prediction_access (prediction_id, user_id)
    select
      v_id,
      case when f.requester_id = auth.uid() then f.addressee_id else f.requester_id end
    from public.friendships f
    where f.status = 'accepted'
      and (f.requester_id = auth.uid() or f.addressee_id = auth.uid());
  else
    foreach v_recipient in array coalesce(p_friend_ids, array[]::uuid[]) loop
      insert into public.prediction_access (prediction_id, user_id)
      values (v_id, v_recipient)
      on conflict (prediction_id, user_id) do nothing;
    end loop;
  end if;

  return v_id;
end;
$$;

revoke all on function public.create_prediction(text, text, timestamptz, text, uuid[]) from public;
grant execute on function public.create_prediction(text, text, timestamptz, text, uuid[]) to authenticated;

-- ---------------------------------------------------------------------------
-- 13. Vue de lecture — teaser toujours visible, contenu masqué avant reveal_at
-- ---------------------------------------------------------------------------
--
-- `security_invoker = true` : la vue s'exécute avec les droits de qui la
-- lit, pas ceux du créateur du script. Sans ça, la RLS des tables sous-jacentes
-- s'appliquerait avec les droits du propriétaire de la vue, ce qui la
-- désactiverait de fait.
--
-- Le `left join` fait tout le travail : `prediction_contents_select` ne rend
-- la ligne de contenu que si l'appelant y a droit. Si elle est refusée, le
-- `left join` ne fabrique pas une erreur mais un `content` à `null` — c'est
-- exactement le comportement voulu : teaser lisible, contenu absent.
-- `drop view` avant : Postgres refuse qu'un `create or replace view` retire
-- une colonne (ici `title`) d'une vue déjà créée par une version antérieure de
-- ce script.
drop view if exists public.predictions_feed;

create view public.predictions_feed
with (security_invoker = true) as
select
  p.id,
  p.author_id,
  p.teaser,
  pc.content,
  p.reveal_at,
  p.scope,
  p.created_at,
  (p.reveal_at <= now()) as is_revealed
from public.predictions p
left join public.prediction_contents pc on pc.prediction_id = p.id;

grant select on public.predictions_feed to authenticated;

-- ---------------------------------------------------------------------------
-- 14. Notifications
-- ---------------------------------------------------------------------------
--
-- Deux types : 'new_teaser' (un accès vient d'être accordé — à la création
-- d'une prédiction ou quand l'auteur ajoute un destinataire plus tard) et
-- 'prediction_revealed' (le contenu vient de se débloquer). Jamais insérées
-- directement par le client : uniquement par le trigger et la fonction
-- `security definer` plus bas, pour qu'un utilisateur ne puisse pas se
-- fabriquer de fausses notifications ni en écrire pour quelqu'un d'autre.
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  prediction_id uuid not null references public.predictions (id) on delete cascade,
  type text not null check (type in ('new_teaser', 'prediction_revealed')),
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

-- Une invitation de groupe (section 19, plus bas) ne concerne pas une
-- prédiction : la colonne devient optionnelle. `group_id` (ajoutée section 19,
-- une fois la table `groups` créée) la complète, avec une contrainte imposant
-- que l'une exactement des deux soit renseignée selon le type.
alter table public.notifications alter column prediction_id drop not null;

-- Empêche les doublons (même utilisateur, même prédiction, même type) — sert
-- aussi de garde-fou pour `generate_reveal_notifications`, qui s'appuie
-- dessus via `on conflict do nothing` plutôt qu'une sous-requête d'exclusion.
create unique index if not exists notifications_unique_key
  on public.notifications (user_id, prediction_id, type);

-- Le fil de notifications d'un utilisateur : les plus récentes en tête.
create index if not exists notifications_user_created_idx
  on public.notifications (user_id, created_at desc);

alter table public.notifications enable row level security;

drop policy if exists "notifications_select_own" on public.notifications;
create policy "notifications_select_own"
  on public.notifications
  for select
  to authenticated
  using (user_id = auth.uid());

-- Seule modification légitime côté client : marquer une notification comme
-- lue. Le `with check` empêche de faire glisser la ligne vers quelqu'un
-- d'autre au passage.
drop policy if exists "notifications_update_own" on public.notifications;
create policy "notifications_update_own"
  on public.notifications
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Chacun peut supprimer ses propres notifications (bouton poubelle côté UI).
drop policy if exists "notifications_delete_own" on public.notifications;
create policy "notifications_delete_own"
  on public.notifications
  for delete
  to authenticated
  using (user_id = auth.uid());

-- Pas de policy insert pour `authenticated` : la création est réservée aux
-- fonctions `security definer` ci-dessous.

-- Un accès accordé (à la création d'une prédiction, ou plus tard quand
-- l'auteur ajoute quelqu'un) déclenche immédiatement la notification. Couvre
-- les trois cas d'un coup, puisqu'ils passent tous par un insert dans
-- `prediction_access` : la portée « tout le Cercle » à la création, la
-- sélection d'amis à la création, et un ajout ultérieur par l'auteur.
--
-- `security definer` : le trigger doit pouvoir écrire une notification pour
-- le destinataire (`new.user_id`), qui n'est pas l'utilisateur en train
-- d'agir (l'auteur) — une notification pour quelqu'un d'autre que soi est
-- justement ce que la policy insert normale interdirait.
create or replace function public.notify_new_teaser()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.notifications (user_id, prediction_id, type)
  values (new.user_id, new.prediction_id, 'new_teaser')
  on conflict (user_id, prediction_id, type) do nothing;
  return new;
end;
$$;

drop trigger if exists prediction_access_notify_new_teaser on public.prediction_access;
create trigger prediction_access_notify_new_teaser
  after insert on public.prediction_access
  for each row execute function public.notify_new_teaser();

-- Notifications de révélation : Postgres n'a pas de déclencheur qui se
-- déclenche seul quand une horloge dépasse `reveal_at`, il faut qu'une requête
-- vienne le constater. Cette fonction insère les notifications manquantes
-- pour toutes les prédictions déjà révélées ; le client l'appelle à chaque
-- chargement du fil (lib/notifications.ts), ce qui suffit à les faire
-- apparaître dans la minute qui suit la révélation sans dépendre d'une tâche
-- planifiée (pg_cron n'est pas garanti disponible selon le plan Supabase).
--
-- `security definer` : elle écrit pour tous les destinataires concernés,
-- pas seulement l'appelant. Aucun paramètre fourni par le client — elle ne
-- fait que rattraper un état entièrement déterminé par la base
-- (`reveal_at <= now()`), donc rien à exploiter côté sécurité.
create or replace function public.generate_reveal_notifications()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.notifications (user_id, prediction_id, type)
  select pa.user_id, p.id, 'prediction_revealed'
  from public.predictions p
  join public.prediction_access pa on pa.prediction_id = p.id
  where p.reveal_at <= now()
  on conflict (user_id, prediction_id, type) do nothing;
end;
$$;

revoke all on function public.generate_reveal_notifications() from public;
grant execute on function public.generate_reveal_notifications() to authenticated;

-- ---------------------------------------------------------------------------
-- 15. Votes et commentaires après révélation
-- ---------------------------------------------------------------------------
--
-- Un vote par destinataire (contrainte unique). L'auteur ne vote pas : il
-- n'est jamais dans `prediction_access`, et la policy d'insert plus bas exige
-- d'y être — un auteur ne peut donc pas juger sa propre prédiction.
create table if not exists public.prediction_votes (
  id uuid primary key default gen_random_uuid(),
  prediction_id uuid not null references public.predictions (id) on delete cascade,
  voter_id uuid not null references public.profiles (id) on delete cascade,
  vote_value text not null check (vote_value in ('realized', 'missed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists prediction_votes_unique_voter
  on public.prediction_votes (prediction_id, voter_id);

drop trigger if exists prediction_votes_set_updated_at on public.prediction_votes;
create trigger prediction_votes_set_updated_at
  before update on public.prediction_votes
  for each row execute function public.set_updated_at();

alter table public.prediction_votes enable row level security;

-- Lecture ouverte à l'auteur et aux destinataires : le débat est transparent
-- dans le Cercle, personne ne vote dans le noir face à un simple total caché.
drop policy if exists "prediction_votes_select" on public.prediction_votes;
create policy "prediction_votes_select"
  on public.prediction_votes
  for select
  to authenticated
  using (
    exists (
      select 1 from public.prediction_access pa
      where pa.prediction_id = prediction_votes.prediction_id and pa.user_id = auth.uid()
    )
    or exists (
      select 1 from public.predictions p
      where p.id = prediction_votes.prediction_id and p.author_id = auth.uid()
    )
  );

-- Voter : seulement un destinataire (present dans prediction_access), sur son
-- propre id, et seulement une fois révélée — avant, il n'y a rien à juger.
drop policy if exists "prediction_votes_insert" on public.prediction_votes;
create policy "prediction_votes_insert"
  on public.prediction_votes
  for insert
  to authenticated
  with check (
    voter_id = auth.uid()
    and exists (
      select 1 from public.prediction_access pa
      where pa.prediction_id = prediction_votes.prediction_id and pa.user_id = auth.uid()
    )
    and exists (
      select 1 from public.predictions p
      where p.id = prediction_votes.prediction_id and p.reveal_at <= now()
    )
  );

-- Changer son propre vote reste possible (l'unique porte sur une ligne par
-- destinataire, pas sur son contenu) — un débat peut faire changer d'avis.
drop policy if exists "prediction_votes_update_own" on public.prediction_votes;
create policy "prediction_votes_update_own"
  on public.prediction_votes
  for update
  to authenticated
  using (voter_id = auth.uid())
  with check (voter_id = auth.uid());

-- Les commentaires suivent la même logique d'accès que les votes : auteur et
-- destinataires, seulement après révélation.
create table if not exists public.prediction_comments (
  id uuid primary key default gen_random_uuid(),
  prediction_id uuid not null references public.predictions (id) on delete cascade,
  author_id uuid not null references public.profiles (id) on delete cascade,
  content text not null,
  created_at timestamptz not null default now()
);

alter table public.prediction_comments drop constraint if exists prediction_comments_length;
alter table public.prediction_comments add constraint prediction_comments_length
  check (char_length(btrim(content)) between 1 and 500);

-- Réponse à un commentaire précis — `on delete set null` plutôt que `cascade` :
-- supprimer le commentaire original ne doit pas emporter ses réponses, qui
-- restent lisibles (juste sans plus de citation précise à afficher).
alter table public.prediction_comments
  add column if not exists reply_to_id uuid references public.prediction_comments (id) on delete set null;

create index if not exists prediction_comments_prediction_idx
  on public.prediction_comments (prediction_id, created_at);

alter table public.prediction_comments enable row level security;

drop policy if exists "prediction_comments_select" on public.prediction_comments;
create policy "prediction_comments_select"
  on public.prediction_comments
  for select
  to authenticated
  using (
    exists (
      select 1 from public.prediction_access pa
      where pa.prediction_id = prediction_comments.prediction_id and pa.user_id = auth.uid()
    )
    or exists (
      select 1 from public.predictions p
      where p.id = prediction_comments.prediction_id and p.author_id = auth.uid()
    )
  );

-- Commenter : auteur ou destinataire, à tout moment — y compris avant
-- révélation, pour réagir au teaser (façon fil d'actualité). Seul le contenu
-- scellé reste caché avant `reveal_at` ; la discussion, elle, est ouverte dès
-- la création.
drop policy if exists "prediction_comments_insert" on public.prediction_comments;
create policy "prediction_comments_insert"
  on public.prediction_comments
  for insert
  to authenticated
  with check (
    author_id = auth.uid()
    and (
      exists (
        select 1 from public.prediction_access pa
        where pa.prediction_id = prediction_comments.prediction_id and pa.user_id = auth.uid()
      )
      or exists (
        select 1 from public.predictions p
        where p.id = prediction_comments.prediction_id and p.author_id = auth.uid()
      )
    )
  );

-- Chacun peut retirer son propre commentaire ; l'auteur de la prédiction peut
-- aussi modérer les commentaires laissés par d'autres sur ses propres scellés.
drop policy if exists "prediction_comments_delete_own" on public.prediction_comments;
create policy "prediction_comments_delete_own"
  on public.prediction_comments
  for delete
  to authenticated
  using (
    author_id = auth.uid()
    or exists (
      select 1 from public.predictions p
      where p.id = prediction_comments.prediction_id and p.author_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- 16. Statut final d'une prédiction — majorité des votes des destinataires
-- ---------------------------------------------------------------------------
--
-- 'pending' tant qu'elle n'est pas révélée, ou révélée mais sans majorité
-- claire (aucun vote, ou égalité) ; 'realized'/'missed' dès qu'un camp
-- l'emporte. Alimente les 4 compteurs du Profil (Total/Réalisées/Manquées/
-- En cours) et l'affichage du verdict sur l'écran détail.
--
-- `security_invoker = true` : la RLS de `predictions` et `prediction_votes`
-- s'applique avec les droits de qui lit la vue, pas ceux qui l'ont créée —
-- un auteur ne voit les votes en détail que sur ses propres prédictions,
-- exactement comme en interrogeant les tables directement.
drop view if exists public.prediction_outcomes;

create view public.prediction_outcomes
with (security_invoker = true) as
select
  p.id as prediction_id,
  p.author_id,
  p.teaser,
  p.reveal_at,
  p.created_at,
  (p.reveal_at <= now()) as is_revealed,
  coalesce(sum((v.vote_value = 'realized')::int), 0) as realized_votes,
  coalesce(sum((v.vote_value = 'missed')::int), 0) as missed_votes,
  case
    when p.reveal_at > now() then 'pending'
    when coalesce(sum((v.vote_value = 'realized')::int), 0)
       > coalesce(sum((v.vote_value = 'missed')::int), 0) then 'realized'
    when coalesce(sum((v.vote_value = 'missed')::int), 0)
       > coalesce(sum((v.vote_value = 'realized')::int), 0) then 'missed'
    else 'pending'
  end as final_status
from public.predictions p
left join public.prediction_votes v on v.prediction_id = p.id
group by p.id, p.author_id, p.teaser, p.reveal_at, p.created_at;

grant select on public.prediction_outcomes to authenticated;

-- ---------------------------------------------------------------------------
-- 17. Gamification — célébration de prédiction approuvée
-- ---------------------------------------------------------------------------

-- Nouveau type de notification, réservé à l'auteur (les précédents sont tous
-- pour un destinataire) : le moment où sa prédiction bascule sur « Réalisée ».
-- (La contrainte `notifications_type_check` elle-même n'est (re)posée qu'une
-- fois, plus bas, une fois tous les types connus.)

-- Se déclenche à chaque vote (pose ou changement), recalcule la majorité, et
-- notifie l'auteur la première fois qu'elle penche pour 'realized'. La
-- contrainte unique de la table absorbe les appels suivants (`on conflict do
-- nothing`) : un vote qui repasse ensuite côté 'missed' puis revient sur
-- 'realized' ne redéclenche pas une deuxième célébration.
--
-- `security definer` : la notification est pour l'auteur, pas pour qui vote —
-- exactement ce que la policy insert normale de `notifications` interdit.
create or replace function public.notify_prediction_approved()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_realized int;
  v_missed int;
  v_author uuid;
begin
  select
    coalesce(sum((vote_value = 'realized')::int), 0),
    coalesce(sum((vote_value = 'missed')::int), 0)
  into v_realized, v_missed
  from public.prediction_votes
  where prediction_id = new.prediction_id;

  if v_realized > v_missed then
    select author_id into v_author from public.predictions where id = new.prediction_id;

    insert into public.notifications (user_id, prediction_id, type)
    values (v_author, new.prediction_id, 'prediction_approved')
    on conflict (user_id, prediction_id, type) do nothing;
  end if;

  return new;
end;
$$;

drop trigger if exists prediction_votes_notify_approved on public.prediction_votes;
create trigger prediction_votes_notify_approved
  after insert or update on public.prediction_votes
  for each row execute function public.notify_prediction_approved();

-- Le système de badges de prestige (fer/bronze/argent/or, sur ce compte à
-- 30 jours) est retiré au profit du Prediscore pondéré (section 23) — cette
-- fonction n'a plus aucun appelant côté client, on la supprime de la base.
drop function if exists public.get_realized_count_30d(uuid);

-- ---------------------------------------------------------------------------
-- 18. Prédictions vocales — bucket de stockage et politiques
-- ---------------------------------------------------------------------------
--
-- Un bucket privé (`public: false`) : les fichiers ne sont accessibles que via
-- les policies ci-dessous, jamais par une URL publique devinable.
insert into storage.buckets (id, name, public)
values ('prediction-audio', 'prediction-audio', false)
on conflict (id) do nothing;

-- Chemin de stockage attendu : `<prediction_id>/<fichier>`. C'est ce premier
-- segment (`storage.foldername(name)`) que les policies comparent à
-- `predictions.id` pour appliquer exactement les mêmes règles de visibilité
-- que le contenu texte.
alter table public.prediction_contents add column if not exists audio_path text;

-- La RLS de `storage.objects` est déjà activée par Supabase (table gérée par
-- `supabase_storage_admin` — notre rôle n'en est pas propriétaire et ne peut
-- pas exécuter `alter table ... enable row level security` dessus). On ajoute
-- seulement nos policies.
drop policy if exists "prediction_audio_select" on storage.objects;
create policy "prediction_audio_select"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'prediction-audio'
    and exists (
      select 1 from public.predictions p
      where p.id::text = (storage.foldername(name))[1]
        and (
          p.author_id = auth.uid()
          or exists (
            select 1 from public.prediction_access pa
            where pa.prediction_id = p.id
              and pa.user_id = auth.uid()
              and p.reveal_at <= now()
          )
        )
    )
  );

-- Écriture réservée à l'auteur, et seulement avant la révélation — même
-- fenêtre que la modification du contenu texte
-- (`prediction_contents_update_before_reveal`).
drop policy if exists "prediction_audio_insert" on storage.objects;
create policy "prediction_audio_insert"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'prediction-audio'
    and exists (
      select 1 from public.predictions p
      where p.id::text = (storage.foldername(name))[1]
        and p.author_id = auth.uid()
        and p.reveal_at > now()
    )
  );

drop policy if exists "prediction_audio_delete" on storage.objects;
create policy "prediction_audio_delete"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'prediction-audio'
    and exists (
      select 1 from public.predictions p
      where p.id::text = (storage.foldername(name))[1]
        and p.author_id = auth.uid()
    )
  );

-- La vue expose le chemin du fichier (pas son contenu) : c'est au client de
-- demander une URL signée, qui elle-même repasse par les policies ci-dessus.
--
-- `realized_votes`/`missed_votes`/`final_status` : même calcul que la vue
-- `prediction_outcomes` (majorité des votants effectifs), dupliqué ici plutôt
-- que réutilisé pour éviter une seconde requête par carte du Fil — le badge
-- de verdict (Réalisée/Manquée) a besoin de cette info dès le premier
-- chargement du fil.
drop view if exists public.predictions_feed;

create view public.predictions_feed
with (security_invoker = true) as
select
  p.id,
  p.author_id,
  p.teaser,
  pc.content,
  pc.audio_path,
  p.reveal_at,
  p.scope,
  p.open_ended,
  p.created_at,
  (p.reveal_at <= now()) as is_revealed,
  coalesce(sum((v.vote_value = 'realized')::int), 0) as realized_votes,
  coalesce(sum((v.vote_value = 'missed')::int), 0) as missed_votes,
  case
    when p.reveal_at > now() then 'pending'
    when coalesce(sum((v.vote_value = 'realized')::int), 0)
       > coalesce(sum((v.vote_value = 'missed')::int), 0) then 'realized'
    when coalesce(sum((v.vote_value = 'missed')::int), 0)
       > coalesce(sum((v.vote_value = 'realized')::int), 0) then 'missed'
    else 'pending'
  end as final_status
from public.predictions p
left join public.prediction_contents pc on pc.prediction_id = p.id
left join public.prediction_votes v on v.prediction_id = p.id
group by p.id, p.author_id, p.teaser, pc.content, pc.audio_path, p.reveal_at, p.scope, p.open_ended, p.created_at;

grant select on public.predictions_feed to authenticated;

-- ---------------------------------------------------------------------------
-- 19. Groupes d'amis privés
-- ---------------------------------------------------------------------------
--
-- Un regroupement nommé d'amis ("Les Intimes", "Potes de Promo"), propre à
-- son créateur, pour cibler une prédiction sans repasser par « tout le
-- Cercle » ni une sélection individuelle à chaque fois.
create table if not exists public.groups (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.groups drop constraint if exists groups_name_length;
alter table public.groups add constraint groups_name_length
  check (char_length(btrim(name)) between 1 and 40);

-- 'private' (par défaut) : seuls les membres le voient. 'public' : visible
-- par tout le Cercle du créateur — les membres en font de toute façon partie
-- (l'insertion dans group_members exige un ami accepté du propriétaire), donc
-- « Cercle du créateur et des membres » se résume à « Cercle du créateur ».
alter table public.groups add column if not exists visibility text not null default 'private';
alter table public.groups drop constraint if exists groups_visibility_valid;
alter table public.groups add constraint groups_visibility_valid
  check (visibility in ('private', 'public'));

create index if not exists groups_owner_idx on public.groups (owner_id);

drop trigger if exists groups_set_updated_at on public.groups;
create trigger groups_set_updated_at
  before update on public.groups
  for each row execute function public.set_updated_at();

-- Membres d'un groupe : uniquement des amis acceptés du propriétaire, vérifié
-- à l'insertion — même garde-fou que `prediction_access_insert` pour la
-- portée « Amis spécifiques ». Créée ici (structure minimale), avant les
-- policies de `groups` qui la référencent, pour que ces `create policy`
-- trouvent bien la table au moment de leur exécution.
create table if not exists public.group_members (
  group_id uuid not null references public.groups (id) on delete cascade,
  friend_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (group_id, friend_id)
);

-- 'pending' par défaut : ajouter un membre crée une invitation, pas une
-- adhésion immédiate — l'invité doit l'accepter (depuis ses notifications)
-- avant de compter comme un vrai membre (ciblage d'une prédiction, etc.).
alter table public.group_members add column if not exists status text not null default 'pending';
alter table public.group_members drop constraint if exists group_members_status_valid;
alter table public.group_members add constraint group_members_status_valid
  check (status in ('pending', 'accepted'));

create index if not exists group_members_friend_idx on public.group_members (friend_id);

-- `security definer` : tourne avec les droits de son propriétaire, donc son
-- `select` sur `group_members` ne redéclenche pas la RLS de cette table.
-- Utilisée uniquement par `groups_select_own` ci-dessous, pour casser le
-- cycle expliqué dans son commentaire (même principe que
-- `has_prediction_access`, section 11).
create or replace function public.is_group_member(p_group_id uuid, p_user_id uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1 from public.group_members
    where group_id = p_group_id and friend_id = p_user_id
  );
$$;

revoke all on function public.is_group_member(uuid, uuid) from public;
grant execute on function public.is_group_member(uuid, uuid) to authenticated;

-- Miroir de `is_group_member` : tourne avec les droits de son propriétaire,
-- donc son `select` sur `groups` ne redéclenche pas la RLS de cette table.
-- Utilisée par les policies de `group_members` ci-dessous, qui doivent
-- vérifier si l'appelant possède le groupe sans interroger `groups`
-- directement (voir le commentaire de `groups_select_own`).
create or replace function public.is_group_owner(p_group_id uuid, p_user_id uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1 from public.groups
    where id = p_group_id and owner_id = p_user_id
  );
$$;

revoke all on function public.is_group_owner(uuid, uuid) from public;
grant execute on function public.is_group_owner(uuid, uuid) to authenticated;

alter table public.groups enable row level security;

-- Visible par : le propriétaire, tout membre (même invité en attente — il
-- doit pouvoir lire le nom du groupe pour décider d'accepter ou non, y
-- compris si le groupe est privé), et, si le groupe est public, n'importe
-- quel ami accepté du propriétaire.
--
-- Passe par `is_group_member` (fonction `security definer` définie
-- juste au-dessus) plutôt que par un `exists (select ... from
-- group_members ...)` direct : `group_members_select_own` interroge
-- elle-même `groups` pour savoir si l'appelant en est le propriétaire. Les
-- deux policies s'appelant l'une l'autre en direct forment un cycle —
-- Postgres l'a signalé par « infinite recursion detected in policy for
-- relation "groups" ». `is_group_member` tourne avec les droits de son
-- propriétaire, qui n'a pas la RLS forcée sur ses propres tables : elle lit
-- `group_members` sans redéclencher sa policy, ce qui casse le cycle.
drop policy if exists "groups_select_own" on public.groups;
create policy "groups_select_own"
  on public.groups
  for select
  to authenticated
  using (
    owner_id = auth.uid()
    or public.is_group_member(id, auth.uid())
    or (
      visibility = 'public'
      and exists (
        select 1 from public.friendships f
        where f.status = 'accepted'
          and (
            (f.requester_id = auth.uid() and f.addressee_id = groups.owner_id)
            or (f.addressee_id = auth.uid() and f.requester_id = groups.owner_id)
          )
      )
    )
  );

drop policy if exists "groups_insert_own" on public.groups;
create policy "groups_insert_own"
  on public.groups
  for insert
  to authenticated
  with check (owner_id = auth.uid());

drop policy if exists "groups_update_own" on public.groups;
create policy "groups_update_own"
  on public.groups
  for update
  to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

drop policy if exists "groups_delete_own" on public.groups;
create policy "groups_delete_own"
  on public.groups
  for delete
  to authenticated
  using (owner_id = auth.uid());

alter table public.group_members enable row level security;

-- Le propriétaire voit tous les membres/invités de ses groupes ; un invité
-- voit sa propre ligne (pending ou accepted), pour savoir à quoi il a été
-- convié et y répondre. Passe par `is_group_owner` plutôt qu'un `exists`
-- direct sur `groups` — même raison que `groups_select_own` ci-dessus.
drop policy if exists "group_members_select_own" on public.group_members;
create policy "group_members_select_own"
  on public.group_members
  for select
  to authenticated
  using (
    friend_id = auth.uid()
    or public.is_group_owner(group_id, auth.uid())
  );

-- Seul le propriétaire invite, et seulement un ami accepté — jamais
-- directement à l'état 'accepted' : la ligne commence en 'pending', c'est
-- l'invité qui la fait basculer (policy suivante).
drop policy if exists "group_members_insert_own" on public.group_members;
create policy "group_members_insert_own"
  on public.group_members
  for insert
  to authenticated
  with check (
    status = 'pending'
    and public.is_group_owner(group_id, auth.uid())
    and exists (
      select 1 from public.friendships f
      where f.status = 'accepted'
        and (
          (f.requester_id = auth.uid() and f.addressee_id = group_members.friend_id)
          or (f.addressee_id = auth.uid() and f.requester_id = group_members.friend_id)
        )
    )
  );

-- Accepter une invitation : seul l'invité, et seulement 'pending' -> 'accepted'.
drop policy if exists "group_members_respond_own" on public.group_members;
create policy "group_members_respond_own"
  on public.group_members
  for update
  to authenticated
  using (friend_id = auth.uid() and status = 'pending')
  with check (friend_id = auth.uid() and status = 'accepted');

-- Le propriétaire retire qui il veut ; l'invité refuse une invitation ou
-- quitte un groupe qu'il a déjà rejoint — dans les deux cas, une suppression
-- de sa propre ligne.
drop policy if exists "group_members_delete_own" on public.group_members;
create policy "group_members_delete_own"
  on public.group_members
  for delete
  to authenticated
  using (
    friend_id = auth.uid()
    or public.is_group_owner(group_id, auth.uid())
  );

-- Notification d'invitation à un groupe. `groups` existe maintenant, donc
-- `group_id` (annoncée section 14) peut être ajoutée ici.
alter table public.notifications add column if not exists group_id uuid references public.groups (id) on delete cascade;

-- Même rôle que `notifications_unique_key`, mais pour les invitations de
-- groupe : index partiel, puisque `prediction_id` est toujours nul pour
-- elles (un index unique classique n'aurait pas détecté les doublons, deux
-- `null` n'étant jamais égaux entre eux).
create unique index if not exists notifications_group_invite_unique_key
  on public.notifications (user_id, group_id, type)
  where type = 'group_invite';

alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type in ('new_teaser', 'prediction_revealed', 'prediction_approved', 'group_invite'));

-- Exactement l'un des deux selon le type : jamais les deux, jamais aucun.
alter table public.notifications drop constraint if exists notifications_target_consistency;
alter table public.notifications add constraint notifications_target_consistency
  check (
    (type = 'group_invite' and group_id is not null and prediction_id is null)
    or (type <> 'group_invite' and prediction_id is not null and group_id is null)
  );

-- `security definer` : la notification est pour l'invité, pas pour qui
-- invite — exactement ce que la policy insert normale de `notifications`
-- interdit (même raison que `notify_new_teaser`).
create or replace function public.notify_group_invite()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'pending' then
    insert into public.notifications (user_id, group_id, type)
    values (new.friend_id, new.group_id, 'group_invite')
    on conflict (user_id, group_id, type) where (type = 'group_invite') do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists group_members_notify_invite on public.group_members;
create trigger group_members_notify_invite
  after insert on public.group_members
  for each row execute function public.notify_group_invite();

-- Élargit la portée d'une prédiction à un groupe nommé, en plus de « tout le
-- Cercle » et « sélection individuelle ».
alter table public.predictions drop constraint if exists predictions_scope_valid;
alter table public.predictions add constraint predictions_scope_valid
  check (scope in ('circle', 'selected', 'group'));

-- `create_prediction` gagne un paramètre optionnel `p_category`, ajouté en
-- fin de liste pour ne pas casser les appels existants. Signature différente
-- de celle créée section 12 -> `drop function` d'abord.
drop function if exists public.create_prediction(text, text, timestamptz, text, uuid[]);
drop function if exists public.create_prediction(text, text, timestamptz, text, uuid[], uuid);
drop function if exists public.create_prediction(text, text, timestamptz, text, uuid[], uuid, uuid[], boolean);

create or replace function public.create_prediction(
  p_teaser text,
  p_content text,
  p_reveal_at timestamptz,
  p_scope text,
  p_friend_ids uuid[] default array[]::uuid[],
  p_group_id uuid default null,
  p_mentioned_ids uuid[] default array[]::uuid[],
  p_open_ended boolean default false,
  p_category text default 'autre'
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid;
  v_recipient uuid;
begin
  insert into public.predictions (author_id, teaser, reveal_at, scope, open_ended, category)
  values (auth.uid(), p_teaser, p_reveal_at, p_scope, p_open_ended, p_category)
  returning id into v_id;

  insert into public.prediction_contents (prediction_id, content)
  values (v_id, p_content);

  if p_scope = 'circle' then
    -- Tout le cercle actuel : tous les amis acceptés au moment de la création.
    insert into public.prediction_access (prediction_id, user_id)
    select
      v_id,
      case when f.requester_id = auth.uid() then f.addressee_id else f.requester_id end
    from public.friendships f
    where f.status = 'accepted'
      and (f.requester_id = auth.uid() or f.addressee_id = auth.uid());
  elsif p_scope = 'group' then
    -- Le groupe doit appartenir à l'appelant : la RLS de `groups`/`group_members`
    -- ne renverrait de toute façon rien d'autre, mais le check explicite évite
    -- qu'un `p_group_id` invalide passe silencieusement inaperçu (0
    -- destinataire, prédiction créée sans personne pour la voir). Seuls les
    -- membres ayant accepté l'invitation comptent — un invité encore
    -- 'pending' ne doit rien voir tant qu'il n'a pas répondu.
    insert into public.prediction_access (prediction_id, user_id)
    select v_id, gm.friend_id
    from public.group_members gm
    join public.groups g on g.id = gm.group_id
    where gm.group_id = p_group_id and g.owner_id = auth.uid() and gm.status = 'accepted';
  else
    foreach v_recipient in array coalesce(p_friend_ids, array[]::uuid[]) loop
      insert into public.prediction_access (prediction_id, user_id)
      values (v_id, v_recipient)
      on conflict (prediction_id, user_id) do nothing;
    end loop;
  end if;

  -- Mentions « @pseudo » repérées dans le teaser : accès garanti même hors du
  -- scope choisi (ex. mentionner un ami hors du groupe ciblé). Revérifié ici
  -- plutôt que de faire confiance au tri déjà fait côté client : seul un ami
  -- accepté peut être ajouté, jamais n'importe quel id passé en paramètre.
  foreach v_recipient in array coalesce(p_mentioned_ids, array[]::uuid[]) loop
    if exists (
      select 1 from public.friendships f
      where f.status = 'accepted'
        and (
          (f.requester_id = auth.uid() and f.addressee_id = v_recipient)
          or (f.addressee_id = auth.uid() and f.requester_id = v_recipient)
        )
    ) then
      insert into public.prediction_access (prediction_id, user_id)
      values (v_id, v_recipient)
      on conflict (prediction_id, user_id) do nothing;
    end if;
  end loop;

  return v_id;
end;
$$;

revoke all on function public.create_prediction(text, text, timestamptz, text, uuid[], uuid, uuid[], boolean, text) from public;
grant execute on function public.create_prediction(text, text, timestamptz, text, uuid[], uuid, uuid[], boolean, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 20. Photo de profil
-- ---------------------------------------------------------------------------
--
-- Bucket PUBLIC, contrairement à `prediction-audio` : une photo de profil
-- n'est pas un contenu scellé, elle doit s'afficher partout (Fil, Cercle,
-- commentaires) sans repasser par une URL signée à chaque fois.
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

alter table public.profiles add column if not exists avatar_url text;

-- Chemin de stockage attendu : `<user_id>/<fichier>`. Lecture publique
-- (cohérente avec `public: true` sur le bucket, déclarée explicitement ici
-- pour rester dans le même style que le reste du schéma) ; écriture réservée
-- à son propre dossier.
drop policy if exists "avatars_select_public" on storage.objects;
create policy "avatars_select_public"
  on storage.objects
  for select
  to public
  using (bucket_id = 'avatars');

drop policy if exists "avatars_insert_own" on storage.objects;
create policy "avatars_insert_own"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "avatars_update_own" on storage.objects;
create policy "avatars_update_own"
  on storage.objects
  for update
  to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "avatars_delete_own" on storage.objects;
create policy "avatars_delete_own"
  on storage.objects
  for delete
  to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

-- ---------------------------------------------------------------------------
-- 21. Statistiques d'un profil consultable (Cercle)
-- ---------------------------------------------------------------------------
--
-- Réservé à soi-même ou à un ami accepté (même garde-fou que
-- `get_realized_count_30d`) : un aperçu agrégé des scellés d'un ami — jamais
-- le détail des prédictions elles-mêmes, seulement des compteurs — pour la
-- vue "Profil d'un ami" (item 8).
create or replace function public.get_prediction_stats(target_user uuid)
returns table (total bigint, realized bigint, missed bigint, pending bigint)
language sql
security definer
stable
set search_path = ''
as $$
  select
    count(*) as total,
    count(*) filter (where final_status = 'realized') as realized,
    count(*) filter (where final_status = 'missed') as missed,
    count(*) filter (where final_status = 'pending') as pending
  from (
    select
      case
        when p.reveal_at > now() then 'pending'
        when coalesce(sum((v.vote_value = 'realized')::int), 0)
           > coalesce(sum((v.vote_value = 'missed')::int), 0) then 'realized'
        when coalesce(sum((v.vote_value = 'missed')::int), 0)
           > coalesce(sum((v.vote_value = 'realized')::int), 0) then 'missed'
        else 'pending'
      end as final_status
    from public.predictions p
    left join public.prediction_votes v on v.prediction_id = p.id
    where p.author_id = target_user
      and (
        target_user = auth.uid()
        or exists (
          select 1 from public.friendships f
          where f.status = 'accepted'
            and (
              (f.requester_id = auth.uid() and f.addressee_id = target_user)
              or (f.addressee_id = auth.uid() and f.requester_id = target_user)
            )
        )
      )
    group by p.id, p.reveal_at
  ) sub;
$$;

revoke all on function public.get_prediction_stats(uuid) from public;
grant execute on function public.get_prediction_stats(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 22. Réactions sur le teaser — fonctionnalité retirée
-- ---------------------------------------------------------------------------
--
-- « Confiance »/« Pas confiance » sur le teaser (avant révélation) est
-- retirée : plus aucun appelant côté client, et `predictions_feed` (section
-- 18) redevient la définition finale de la vue, sans les colonnes de bilan.
-- `cascade` emporte l'index unique et les policies de cette table avec elle,
-- sur une base déjà migrée avec l'ancienne version de ce script.
drop table if exists public.prediction_reactions cascade;

-- ---------------------------------------------------------------------------
-- 23. Prediscore pondéré
-- ---------------------------------------------------------------------------
--
-- Remplace le badge de prestige : pourcentage pondéré des prédictions
-- révélées (avec un verdict tranché — les 'pending' n'entrent pas dans le
-- calcul) qui se sont avérées « Réalisée ». Pondération par anticipation —
-- plus la prédiction a été posée tôt, plus elle pèse : moins de 7 jours
-- d'avance = coefficient 1, de 8 jours à 1 mois = coefficient 3, plus d'un
-- mois = coefficient 5.
--
-- `security definer`, même garde que l'ancien `get_realized_count_30d` :
-- soi-même ou un ami accepté, jamais quelqu'un d'autre. `score` à `null`
-- tant qu'aucune prédiction pondérable n'existe encore — distinct de `0`,
-- qui serait un vrai (mauvais) score.
create or replace function public.get_prediscore(target_user uuid)
returns table (score numeric, weighted_count numeric)
language sql
security definer
stable
set search_path = ''
as $$
  with weighted as (
    select
      case
        when extract(epoch from (p.reveal_at - p.created_at)) / 86400 < 7 then 1
        when extract(epoch from (p.reveal_at - p.created_at)) / 86400 <= 30 then 3
        else 5
      end as weight,
      case
        when coalesce(sum((v.vote_value = 'realized')::int), 0)
           > coalesce(sum((v.vote_value = 'missed')::int), 0) then 'realized'
        when coalesce(sum((v.vote_value = 'missed')::int), 0)
           > coalesce(sum((v.vote_value = 'realized')::int), 0) then 'missed'
        else 'pending'
      end as final_status
    from public.predictions p
    left join public.prediction_votes v on v.prediction_id = p.id
    where p.author_id = target_user
      and p.reveal_at <= now()
      and (
        target_user = auth.uid()
        or exists (
          select 1 from public.friendships f
          where f.status = 'accepted'
            and (
              (f.requester_id = auth.uid() and f.addressee_id = target_user)
              or (f.addressee_id = auth.uid() and f.requester_id = target_user)
            )
        )
      )
    group by p.id, p.reveal_at, p.created_at
  )
  select
    case
      when coalesce(sum(weight) filter (where final_status <> 'pending'), 0) > 0
        then round(
          100.0 * sum(weight) filter (where final_status = 'realized')
            / sum(weight) filter (where final_status <> 'pending'),
          1
        )
      else null
    end as score,
    coalesce(sum(weight) filter (where final_status <> 'pending'), 0) as weighted_count
  from weighted;
$$;

revoke all on function public.get_prediscore(uuid) from public;
grant execute on function public.get_prediscore(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 24. Révélation manuelle, sans attendre une date fixe
-- ---------------------------------------------------------------------------
--
-- L'auteur peut révéler sa prédiction à l'instant qu'il choisit — que
-- `reveal_at` porte une vraie date (révélation anticipée) ou la valeur
-- lointaine posée pour une prédiction « ouverte » (`open_ended`, section 7).
-- `security definer` plutôt qu'une policy update ouverte sur `predictions` :
-- la policy générale (`predictions_update_own_before_reveal`) exige encore
-- `reveal_at > now()` après modification, ce qu'une révélation immédiate ne
-- satisfait jamais par construction. Cette fonction porte donc elle-même son
-- garde-fou (auteur, pas déjà révélée) plutôt que de relâcher cette policy.
create or replace function public.reveal_prediction_now(p_prediction_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.predictions
  set reveal_at = now()
  where id = p_prediction_id
    and author_id = auth.uid()
    and reveal_at > now();
end;
$$;

revoke all on function public.reveal_prediction_now(uuid) from public;
grant execute on function public.reveal_prediction_now(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 25. Favoris, masquage, et réactions emoji
-- ---------------------------------------------------------------------------
--
-- Favori/masqué sont des préférences propres à chaque spectateur d'une
-- prédiction (l'auteur peut la masquer sans que ça masque quoi que ce soit
-- pour ses destinataires) — une ligne par (prédiction, utilisateur), jamais
-- partagée. Pas de RLS basée sur l'accès à la prédiction : inutile, une ligne
-- n'a de sens que pour son propre auteur (`user_id = auth.uid()`), et une
-- prédiction hors de portée n'apparaît de toute façon jamais dans le Fil pour
-- y poser ce genre de préférence.
create table if not exists public.prediction_user_state (
  prediction_id uuid not null references public.predictions (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  favorite boolean not null default false,
  hidden boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (prediction_id, user_id)
);

drop trigger if exists prediction_user_state_set_updated_at on public.prediction_user_state;
create trigger prediction_user_state_set_updated_at
  before update on public.prediction_user_state
  for each row execute function public.set_updated_at();

alter table public.prediction_user_state enable row level security;

drop policy if exists "prediction_user_state_select_own" on public.prediction_user_state;
create policy "prediction_user_state_select_own"
  on public.prediction_user_state
  for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "prediction_user_state_insert_own" on public.prediction_user_state;
create policy "prediction_user_state_insert_own"
  on public.prediction_user_state
  for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists "prediction_user_state_update_own" on public.prediction_user_state;
create policy "prediction_user_state_update_own"
  on public.prediction_user_state
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Réaction emoji sur une prédiction — une par destinataire, changeable
-- librement (contrairement à l'ancien choix Confiance/Pas confiance,
-- irréversible et retiré) : `upsert` côté client, pas de policy update
-- séparée nécessaire puisque l'insert avec `on conflict` suffit à changer
-- d'avis, et la ligne peut aussi être supprimée pour retirer sa réaction.
create table if not exists public.prediction_emoji_reactions (
  prediction_id uuid not null references public.predictions (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  emoji text not null check (emoji in ('👍', '🖕', '❤️', '👎', '😊', '😮', '😢')),
  created_at timestamptz not null default now(),
  primary key (prediction_id, user_id)
);

alter table public.prediction_emoji_reactions enable row level security;

-- Lecture ouverte à l'auteur et aux destinataires, comme les votes et les
-- commentaires : le bilan des réactions doit être visible par tous.
drop policy if exists "prediction_emoji_reactions_select" on public.prediction_emoji_reactions;
create policy "prediction_emoji_reactions_select"
  on public.prediction_emoji_reactions
  for select
  to authenticated
  using (
    exists (
      select 1 from public.prediction_access pa
      where pa.prediction_id = prediction_emoji_reactions.prediction_id and pa.user_id = auth.uid()
    )
    or exists (
      select 1 from public.predictions p
      where p.id = prediction_emoji_reactions.prediction_id and p.author_id = auth.uid()
    )
  );

-- Réagir : auteur ou destinataire, sur son propre id, à tout moment (avant ou
-- après révélation) — une réaction emoji porte sur la prédiction dans son
-- ensemble, pas spécifiquement sur le teaser ou le contenu révélé.
drop policy if exists "prediction_emoji_reactions_insert" on public.prediction_emoji_reactions;
create policy "prediction_emoji_reactions_insert"
  on public.prediction_emoji_reactions
  for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and (
      exists (
        select 1 from public.prediction_access pa
        where pa.prediction_id = prediction_emoji_reactions.prediction_id and pa.user_id = auth.uid()
      )
      or exists (
        select 1 from public.predictions p
        where p.id = prediction_emoji_reactions.prediction_id and p.author_id = auth.uid()
      )
    )
  );

drop policy if exists "prediction_emoji_reactions_update_own" on public.prediction_emoji_reactions;
create policy "prediction_emoji_reactions_update_own"
  on public.prediction_emoji_reactions
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "prediction_emoji_reactions_delete_own" on public.prediction_emoji_reactions;
create policy "prediction_emoji_reactions_delete_own"
  on public.prediction_emoji_reactions
  for delete
  to authenticated
  using (user_id = auth.uid());

-- `predictions_feed` reprend sa définition de la section 18 et ajoute :
-- `category` (simple colonne de `predictions`) ; `is_favorite`/`is_hidden`
-- (sous-requêtes corrélées sur `prediction_user_state`, propres à l'appelant
-- — jamais de `left join` direct, même raison que `my_reaction` avant elle :
-- éviter de multiplier les lignes déjà agrégées par `prediction_votes`) ;
-- `emoji_counts` (objet `{emoji: nombre}` agrégé en sous-requête) et
-- `my_emoji_reaction` (la réaction de l'appelant, ou `null`).
drop view if exists public.predictions_feed;

create view public.predictions_feed
with (security_invoker = true) as
select
  p.id,
  p.author_id,
  p.teaser,
  pc.content,
  pc.audio_path,
  p.reveal_at,
  p.scope,
  p.open_ended,
  p.category,
  p.created_at,
  (p.reveal_at <= now()) as is_revealed,
  coalesce(sum((v.vote_value = 'realized')::int), 0) as realized_votes,
  coalesce(sum((v.vote_value = 'missed')::int), 0) as missed_votes,
  case
    when p.reveal_at > now() then 'pending'
    when coalesce(sum((v.vote_value = 'realized')::int), 0)
       > coalesce(sum((v.vote_value = 'missed')::int), 0) then 'realized'
    when coalesce(sum((v.vote_value = 'missed')::int), 0)
       > coalesce(sum((v.vote_value = 'realized')::int), 0) then 'missed'
    else 'pending'
  end as final_status,
  coalesce(
    (
      select us.favorite from public.prediction_user_state us
      where us.prediction_id = p.id and us.user_id = auth.uid()
    ),
    false
  ) as is_favorite,
  coalesce(
    (
      select us.hidden from public.prediction_user_state us
      where us.prediction_id = p.id and us.user_id = auth.uid()
    ),
    false
  ) as is_hidden,
  coalesce(
    (
      select jsonb_object_agg(counts.emoji, counts.total)
      from (
        select emoji, count(*) as total
        from public.prediction_emoji_reactions er
        where er.prediction_id = p.id
        group by emoji
      ) counts
    ),
    '{}'::jsonb
  ) as emoji_counts,
  (
    select er2.emoji from public.prediction_emoji_reactions er2
    where er2.prediction_id = p.id and er2.user_id = auth.uid()
  ) as my_emoji_reaction
from public.predictions p
left join public.prediction_contents pc on pc.prediction_id = p.id
left join public.prediction_votes v on v.prediction_id = p.id
group by p.id, p.author_id, p.teaser, pc.content, pc.audio_path, p.reveal_at, p.scope, p.open_ended, p.category, p.created_at;

grant select on public.predictions_feed to authenticated;

-- ---------------------------------------------------------------------------
-- 26. Suppression du numéro de téléphone
-- ---------------------------------------------------------------------------
--
-- Fonctionnalité abandonnée : plus de champ téléphone sur le profil, plus de
-- recherche par numéro (section 111, `searchProfiles`). Colonne retirée
-- définitivement — les valeurs déjà enregistrées sont perdues.
alter table public.profiles drop column if exists phone;

-- ---------------------------------------------------------------------------
-- 27. Mentions « @pseudo » — notification dédiée + tag visible sur l'étiquette
-- ---------------------------------------------------------------------------
--
-- Jusqu'ici, mentionner un ami dans le teaser ne faisait que lui accorder un
-- accès (silencieusement, via `create_prediction`) : aucune notification
-- distincte de celle — générique — d'un accès accordé, et rien à voir sur la
-- carte. `mentioned_user_ids` retient qui a été explicitement cité, pour
-- l'afficher dans le Fil ; `notify_mention` ajoute la notification dédiée.
alter table public.predictions add column if not exists mentioned_user_ids uuid[] not null default '{}'::uuid[];

alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type in ('new_teaser', 'prediction_revealed', 'prediction_approved', 'group_invite', 'prediction_mentioned'));

-- `security definer` : la notification est pour le destinataire cité, pas
-- pour l'auteur qui appelle — elle se revérifie donc elle-même (auteur de la
-- prédiction, ami accepté) plutôt que de faire confiance à l'appelant, ce qui
-- lui permet de rester `grant`ée à tout `authenticated` sans risque d'abus.
create or replace function public.notify_mention(p_prediction_id uuid, p_mentioned_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.predictions p
    where p.id = p_prediction_id and p.author_id = auth.uid()
  ) then
    return;
  end if;

  if not exists (
    select 1 from public.friendships f
    where f.status = 'accepted'
      and (
        (f.requester_id = auth.uid() and f.addressee_id = p_mentioned_id)
        or (f.addressee_id = auth.uid() and f.requester_id = p_mentioned_id)
      )
  ) then
    return;
  end if;

  insert into public.notifications (user_id, prediction_id, type)
  values (p_mentioned_id, p_prediction_id, 'prediction_mentioned')
  on conflict (user_id, prediction_id, type) do nothing;
end;
$$;

revoke all on function public.notify_mention(uuid, uuid) from public;
grant execute on function public.notify_mention(uuid, uuid) to authenticated;

-- `create_prediction` reprend sa signature de la section 24 : elle enregistre
-- désormais aussi les mentions valides sur la prédiction elle-même
-- (`mentioned_user_ids`), et déclenche `notify_mention` pour chacune.
create or replace function public.create_prediction(
  p_teaser text,
  p_content text,
  p_reveal_at timestamptz,
  p_scope text,
  p_friend_ids uuid[] default array[]::uuid[],
  p_group_id uuid default null,
  p_mentioned_ids uuid[] default array[]::uuid[],
  p_open_ended boolean default false,
  p_category text default 'autre'
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid;
  v_recipient uuid;
  v_mentioned_valid uuid[] := array[]::uuid[];
begin
  insert into public.predictions (author_id, teaser, reveal_at, scope, open_ended, category)
  values (auth.uid(), p_teaser, p_reveal_at, p_scope, p_open_ended, p_category)
  returning id into v_id;

  insert into public.prediction_contents (prediction_id, content)
  values (v_id, p_content);

  if p_scope = 'circle' then
    insert into public.prediction_access (prediction_id, user_id)
    select
      v_id,
      case when f.requester_id = auth.uid() then f.addressee_id else f.requester_id end
    from public.friendships f
    where f.status = 'accepted'
      and (f.requester_id = auth.uid() or f.addressee_id = auth.uid());
  elsif p_scope = 'group' then
    insert into public.prediction_access (prediction_id, user_id)
    select v_id, gm.friend_id
    from public.group_members gm
    join public.groups g on g.id = gm.group_id
    where gm.group_id = p_group_id and g.owner_id = auth.uid() and gm.status = 'accepted';
  else
    foreach v_recipient in array coalesce(p_friend_ids, array[]::uuid[]) loop
      insert into public.prediction_access (prediction_id, user_id)
      values (v_id, v_recipient)
      on conflict (prediction_id, user_id) do nothing;
    end loop;
  end if;

  foreach v_recipient in array coalesce(p_mentioned_ids, array[]::uuid[]) loop
    if exists (
      select 1 from public.friendships f
      where f.status = 'accepted'
        and (
          (f.requester_id = auth.uid() and f.addressee_id = v_recipient)
          or (f.addressee_id = auth.uid() and f.requester_id = v_recipient)
        )
    ) then
      insert into public.prediction_access (prediction_id, user_id)
      values (v_id, v_recipient)
      on conflict (prediction_id, user_id) do nothing;

      v_mentioned_valid := array_append(v_mentioned_valid, v_recipient);
      perform public.notify_mention(v_id, v_recipient);
    end if;
  end loop;

  if array_length(v_mentioned_valid, 1) > 0 then
    update public.predictions set mentioned_user_ids = v_mentioned_valid where id = v_id;
  end if;

  return v_id;
end;
$$;

revoke all on function public.create_prediction(text, text, timestamptz, text, uuid[], uuid, uuid[], boolean, text) from public;
grant execute on function public.create_prediction(text, text, timestamptz, text, uuid[], uuid, uuid[], boolean, text) to authenticated;

-- `predictions_feed` reprend sa définition de la section 25 et ajoute
-- `mentioned_user_ids`, pour afficher qui a été cité directement sur la
-- carte, sans requête séparée.
drop view if exists public.predictions_feed;

create view public.predictions_feed
with (security_invoker = true) as
select
  p.id,
  p.author_id,
  p.teaser,
  pc.content,
  pc.audio_path,
  p.reveal_at,
  p.scope,
  p.open_ended,
  p.category,
  p.mentioned_user_ids,
  p.created_at,
  (p.reveal_at <= now()) as is_revealed,
  coalesce(sum((v.vote_value = 'realized')::int), 0) as realized_votes,
  coalesce(sum((v.vote_value = 'missed')::int), 0) as missed_votes,
  case
    when p.reveal_at > now() then 'pending'
    when coalesce(sum((v.vote_value = 'realized')::int), 0)
       > coalesce(sum((v.vote_value = 'missed')::int), 0) then 'realized'
    when coalesce(sum((v.vote_value = 'missed')::int), 0)
       > coalesce(sum((v.vote_value = 'realized')::int), 0) then 'missed'
    else 'pending'
  end as final_status,
  coalesce(
    (
      select us.favorite from public.prediction_user_state us
      where us.prediction_id = p.id and us.user_id = auth.uid()
    ),
    false
  ) as is_favorite,
  coalesce(
    (
      select us.hidden from public.prediction_user_state us
      where us.prediction_id = p.id and us.user_id = auth.uid()
    ),
    false
  ) as is_hidden,
  coalesce(
    (
      select jsonb_object_agg(counts.emoji, counts.total)
      from (
        select emoji, count(*) as total
        from public.prediction_emoji_reactions er
        where er.prediction_id = p.id
        group by emoji
      ) counts
    ),
    '{}'::jsonb
  ) as emoji_counts,
  (
    select er2.emoji from public.prediction_emoji_reactions er2
    where er2.prediction_id = p.id and er2.user_id = auth.uid()
  ) as my_emoji_reaction
from public.predictions p
left join public.prediction_contents pc on pc.prediction_id = p.id
left join public.prediction_votes v on v.prediction_id = p.id
group by p.id, p.author_id, p.teaser, pc.content, pc.audio_path, p.reveal_at, p.scope, p.open_ended, p.category, p.mentioned_user_ids, p.created_at;

grant select on public.predictions_feed to authenticated;

-- ---------------------------------------------------------------------------
-- 28. Révélation immédiate — vote « j'y crois / j'y crois pas »
-- ---------------------------------------------------------------------------
--
-- Troisième choix de révélation, en plus de « date fixe » et « je déciderai
-- plus tard » : révélée dès la validation. Il n'y a alors rien à constater
-- (aucun délai pour vérifier si la prédiction s'est réalisée), donc le Cercle
-- ne se prononce pas en « réalisée / manquée » mais en simple opinion —
-- réutilise `prediction_votes` avec deux nouvelles valeurs plutôt qu'une
-- table séparée : mêmes policies (select/insert/update déjà conditionnées à
-- `reveal_at <= now()`, toujours vrai ici), même mécanique de verrouillage
-- après un premier vote.
alter table public.predictions add column if not exists is_immediate boolean not null default false;

-- Ajoutée ici (avant `create_prediction` plus bas, qui la renseigne déjà) et
-- pas seulement section 29 où elle sert vraiment (Prediscore par groupe) :
-- `predictions.group_id` n'existait pas du tout jusqu'ici (la portée
-- « groupe » ne peuplait que `prediction_access`, sans garder trace du
-- groupe visé sur la prédiction elle-même).
alter table public.predictions add column if not exists group_id uuid references public.groups (id) on delete set null;

alter table public.prediction_votes drop constraint if exists prediction_votes_vote_value_check;
alter table public.prediction_votes add constraint prediction_votes_vote_value_check
  check (vote_value in ('realized', 'missed', 'believe', 'disbelieve'));

-- `create_prediction` reprend sa signature de la section 27 et ajoute
-- `p_is_immediate` : quand `true`, la base pose elle-même `reveal_at = now()`
-- — pas question de faire confiance à l'horloge du client pour une révélation
-- qui doit être immédiate.
--
-- `drop function` d'abord : une nouvelle liste de paramètres crée un second
-- `create_prediction` en parallèle de l'ancien plutôt que de le remplacer
-- (signatures différentes) — PostgREST refuserait alors d'appeler l'un ou
-- l'autre (« could not choose a best candidate function ») dès qu'un appel
-- omet un paramètre optionnel commun aux deux.
drop function if exists public.create_prediction(text, text, timestamptz, text, uuid[], uuid, uuid[], boolean, text);

create or replace function public.create_prediction(
  p_teaser text,
  p_content text,
  p_reveal_at timestamptz,
  p_scope text,
  p_friend_ids uuid[] default array[]::uuid[],
  p_group_id uuid default null,
  p_mentioned_ids uuid[] default array[]::uuid[],
  p_open_ended boolean default false,
  p_category text default 'autre',
  p_is_immediate boolean default false
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid;
  v_recipient uuid;
  v_mentioned_valid uuid[] := array[]::uuid[];
  v_reveal_at timestamptz := case when p_is_immediate then now() else p_reveal_at end;
begin
  insert into public.predictions (author_id, teaser, reveal_at, scope, open_ended, category, is_immediate, group_id)
  values (
    auth.uid(),
    p_teaser,
    v_reveal_at,
    p_scope,
    p_open_ended,
    p_category,
    p_is_immediate,
    case when p_scope = 'group' then p_group_id else null end
  )
  returning id into v_id;

  insert into public.prediction_contents (prediction_id, content)
  values (v_id, p_content);

  if p_scope = 'circle' then
    insert into public.prediction_access (prediction_id, user_id)
    select
      v_id,
      case when f.requester_id = auth.uid() then f.addressee_id else f.requester_id end
    from public.friendships f
    where f.status = 'accepted'
      and (f.requester_id = auth.uid() or f.addressee_id = auth.uid());
  elsif p_scope = 'group' then
    insert into public.prediction_access (prediction_id, user_id)
    select v_id, gm.friend_id
    from public.group_members gm
    join public.groups g on g.id = gm.group_id
    where gm.group_id = p_group_id and g.owner_id = auth.uid() and gm.status = 'accepted';
  else
    foreach v_recipient in array coalesce(p_friend_ids, array[]::uuid[]) loop
      insert into public.prediction_access (prediction_id, user_id)
      values (v_id, v_recipient)
      on conflict (prediction_id, user_id) do nothing;
    end loop;
  end if;

  foreach v_recipient in array coalesce(p_mentioned_ids, array[]::uuid[]) loop
    if exists (
      select 1 from public.friendships f
      where f.status = 'accepted'
        and (
          (f.requester_id = auth.uid() and f.addressee_id = v_recipient)
          or (f.addressee_id = auth.uid() and f.requester_id = v_recipient)
        )
    ) then
      insert into public.prediction_access (prediction_id, user_id)
      values (v_id, v_recipient)
      on conflict (prediction_id, user_id) do nothing;

      v_mentioned_valid := array_append(v_mentioned_valid, v_recipient);
      perform public.notify_mention(v_id, v_recipient);
    end if;
  end loop;

  if array_length(v_mentioned_valid, 1) > 0 then
    update public.predictions set mentioned_user_ids = v_mentioned_valid where id = v_id;
  end if;

  return v_id;
end;
$$;

revoke all on function public.create_prediction(text, text, timestamptz, text, uuid[], uuid, uuid[], boolean, text, boolean) from public;
grant execute on function public.create_prediction(text, text, timestamptz, text, uuid[], uuid, uuid[], boolean, text, boolean) to authenticated;

-- `predictions_feed` reprend sa définition de la section 27 et ajoute
-- `is_immediate` ainsi que `believe_votes`/`disbelieve_votes` (mêmes
-- agrégations que `realized_votes`/`missed_votes`, sur les deux nouvelles
-- valeurs de `vote_value`) — voir `beliefPercentage` côté client.
drop view if exists public.predictions_feed;

create view public.predictions_feed
with (security_invoker = true) as
select
  p.id,
  p.author_id,
  p.teaser,
  pc.content,
  pc.audio_path,
  p.reveal_at,
  p.scope,
  p.open_ended,
  p.is_immediate,
  p.category,
  p.mentioned_user_ids,
  p.created_at,
  (p.reveal_at <= now()) as is_revealed,
  coalesce(sum((v.vote_value = 'realized')::int), 0) as realized_votes,
  coalesce(sum((v.vote_value = 'missed')::int), 0) as missed_votes,
  case
    when p.reveal_at > now() then 'pending'
    when coalesce(sum((v.vote_value = 'realized')::int), 0)
       > coalesce(sum((v.vote_value = 'missed')::int), 0) then 'realized'
    when coalesce(sum((v.vote_value = 'missed')::int), 0)
       > coalesce(sum((v.vote_value = 'realized')::int), 0) then 'missed'
    else 'pending'
  end as final_status,
  coalesce(
    (
      select us.favorite from public.prediction_user_state us
      where us.prediction_id = p.id and us.user_id = auth.uid()
    ),
    false
  ) as is_favorite,
  coalesce(
    (
      select us.hidden from public.prediction_user_state us
      where us.prediction_id = p.id and us.user_id = auth.uid()
    ),
    false
  ) as is_hidden,
  coalesce(
    (
      select jsonb_object_agg(counts.emoji, counts.total)
      from (
        select emoji, count(*) as total
        from public.prediction_emoji_reactions er
        where er.prediction_id = p.id
        group by emoji
      ) counts
    ),
    '{}'::jsonb
  ) as emoji_counts,
  (
    select er2.emoji from public.prediction_emoji_reactions er2
    where er2.prediction_id = p.id and er2.user_id = auth.uid()
  ) as my_emoji_reaction,
  coalesce(sum((v.vote_value = 'believe')::int), 0) as believe_votes,
  coalesce(sum((v.vote_value = 'disbelieve')::int), 0) as disbelieve_votes
from public.predictions p
left join public.prediction_contents pc on pc.prediction_id = p.id
left join public.prediction_votes v on v.prediction_id = p.id
group by p.id, p.author_id, p.teaser, pc.content, pc.audio_path, p.reveal_at, p.scope, p.open_ended, p.is_immediate, p.category, p.mentioned_user_ids, p.created_at;

grant select on public.predictions_feed to authenticated;

-- ---------------------------------------------------------------------------
-- 29. Prediscore par groupe
-- ---------------------------------------------------------------------------
--
-- Le Prediscore du profil (section 23) porte sur toutes les prédictions d'un
-- utilisateur. Celui-ci est restreint aux seules prédictions liées à un
-- groupe donné — `predictions.group_id` (ajoutée section 28, aux côtés de
-- `is_immediate`, pour que `create_prediction` puisse déjà la renseigner).
--
-- Jusqu'ici, un membre ne voyait que sa propre ligne dans `group_members` —
-- suffisant pour savoir « je suis dans ce groupe », pas pour afficher la
-- liste de ses co-membres et leur Prediscore. `is_group_member` (section 19)
-- tourne `security definer` : l'ajouter ici ne redéclenche pas cette policy.
drop policy if exists "group_members_select_own" on public.group_members;
create policy "group_members_select_own"
  on public.group_members
  for select
  to authenticated
  using (
    friend_id = auth.uid()
    or public.is_group_owner(group_id, auth.uid())
    or public.is_group_member(group_id, auth.uid())
  );

-- `security definer`, même garde que `get_prediscore` : seuls le propriétaire
-- et les membres du groupe (même en attente — cf. commentaire de
-- `is_group_member`) peuvent le consulter, jamais un tiers.
create or replace function public.get_group_prediscore(p_group_id uuid, p_target_user uuid)
returns table (score numeric, weighted_count numeric)
language sql
security definer
stable
set search_path = ''
as $$
  with weighted as (
    select
      case
        when extract(epoch from (p.reveal_at - p.created_at)) / 86400 < 7 then 1
        when extract(epoch from (p.reveal_at - p.created_at)) / 86400 <= 30 then 3
        else 5
      end as weight,
      case
        when coalesce(sum((v.vote_value = 'realized')::int), 0)
           > coalesce(sum((v.vote_value = 'missed')::int), 0) then 'realized'
        when coalesce(sum((v.vote_value = 'missed')::int), 0)
           > coalesce(sum((v.vote_value = 'realized')::int), 0) then 'missed'
        else 'pending'
      end as final_status
    from public.predictions p
    left join public.prediction_votes v on v.prediction_id = p.id
    where p.author_id = p_target_user
      and p.group_id = p_group_id
      and p.reveal_at <= now()
      and (
        public.is_group_owner(p_group_id, auth.uid())
        or public.is_group_member(p_group_id, auth.uid())
      )
    group by p.id, p.reveal_at, p.created_at
  )
  select
    case
      when coalesce(sum(weight) filter (where final_status <> 'pending'), 0) > 0
        then round(
          100.0 * sum(weight) filter (where final_status = 'realized')
            / sum(weight) filter (where final_status <> 'pending'),
          1
        )
      else null
    end as score,
    coalesce(sum(weight) filter (where final_status <> 'pending'), 0) as weighted_count
  from weighted;
$$;

revoke all on function public.get_group_prediscore(uuid, uuid) from public;
grant execute on function public.get_group_prediscore(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 30. Inviter dans un groupe : ouvert à tous ses membres, pas seulement au propriétaire
-- ---------------------------------------------------------------------------
--
-- Jusqu'ici, seul le propriétaire pouvait ajouter quelqu'un. Le `exists (...)`
-- sur `friendships` exigeait déjà que l'invité soit un ami accepté de
-- l'appelant (`auth.uid()`), pas forcément du propriétaire — il ne restait
-- donc qu'à lever le `is_group_owner` pour que n'importe quel membre puisse
-- inviter depuis son propre Cercle, sans rien changer à cette vérification.
drop policy if exists "group_members_insert_own" on public.group_members;
create policy "group_members_insert_own"
  on public.group_members
  for insert
  to authenticated
  with check (
    status = 'pending'
    and (
      public.is_group_owner(group_id, auth.uid())
      or public.is_group_member(group_id, auth.uid())
    )
    and exists (
      select 1 from public.friendships f
      where f.status = 'accepted'
        and (
          (f.requester_id = auth.uid() and f.addressee_id = group_members.friend_id)
          or (f.addressee_id = auth.uid() and f.requester_id = group_members.friend_id)
        )
    )
  );

-- ---------------------------------------------------------------------------
-- 31. Fix : la révélation immédiate était rejetée par la RLS
-- ---------------------------------------------------------------------------
--
-- `create_prediction` posait `reveal_at = now()` pour une prédiction
-- immédiate, mais `predictions_insert_own` (section 1) exige `reveal_at >
-- now()`, strictement — une égalité s'y heurte tout aussi sûrement qu'une
-- date passée, d'où le « Enregistrement refusé » que voyait l'auteur. `now()`
-- valant la même chose du début à la fin d'une transaction (c'est
-- `transaction_timestamp()`), ajouter une seconde suffit à passer cette
-- vérification de façon fiable, sans dépendre du temps réellement écoulé
-- pendant l'exécution de la fonction ; le fil la traitera comme révélée dès
-- son prochain chargement, une seconde plus tard passant inaperçue.
create or replace function public.create_prediction(
  p_teaser text,
  p_content text,
  p_reveal_at timestamptz,
  p_scope text,
  p_friend_ids uuid[] default array[]::uuid[],
  p_group_id uuid default null,
  p_mentioned_ids uuid[] default array[]::uuid[],
  p_open_ended boolean default false,
  p_category text default 'autre',
  p_is_immediate boolean default false
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid;
  v_recipient uuid;
  v_mentioned_valid uuid[] := array[]::uuid[];
  v_reveal_at timestamptz := case when p_is_immediate then now() + interval '1 second' else p_reveal_at end;
begin
  insert into public.predictions (author_id, teaser, reveal_at, scope, open_ended, category, is_immediate, group_id)
  values (
    auth.uid(),
    p_teaser,
    v_reveal_at,
    p_scope,
    p_open_ended,
    p_category,
    p_is_immediate,
    case when p_scope = 'group' then p_group_id else null end
  )
  returning id into v_id;

  insert into public.prediction_contents (prediction_id, content)
  values (v_id, p_content);

  if p_scope = 'circle' then
    insert into public.prediction_access (prediction_id, user_id)
    select
      v_id,
      case when f.requester_id = auth.uid() then f.addressee_id else f.requester_id end
    from public.friendships f
    where f.status = 'accepted'
      and (f.requester_id = auth.uid() or f.addressee_id = auth.uid());
  elsif p_scope = 'group' then
    insert into public.prediction_access (prediction_id, user_id)
    select v_id, gm.friend_id
    from public.group_members gm
    join public.groups g on g.id = gm.group_id
    where gm.group_id = p_group_id and g.owner_id = auth.uid() and gm.status = 'accepted';
  else
    foreach v_recipient in array coalesce(p_friend_ids, array[]::uuid[]) loop
      insert into public.prediction_access (prediction_id, user_id)
      values (v_id, v_recipient)
      on conflict (prediction_id, user_id) do nothing;
    end loop;
  end if;

  foreach v_recipient in array coalesce(p_mentioned_ids, array[]::uuid[]) loop
    if exists (
      select 1 from public.friendships f
      where f.status = 'accepted'
        and (
          (f.requester_id = auth.uid() and f.addressee_id = v_recipient)
          or (f.addressee_id = auth.uid() and f.requester_id = v_recipient)
        )
    ) then
      insert into public.prediction_access (prediction_id, user_id)
      values (v_id, v_recipient)
      on conflict (prediction_id, user_id) do nothing;

      v_mentioned_valid := array_append(v_mentioned_valid, v_recipient);
      perform public.notify_mention(v_id, v_recipient);
    end if;
  end loop;

  if array_length(v_mentioned_valid, 1) > 0 then
    update public.predictions set mentioned_user_ids = v_mentioned_valid where id = v_id;
  end if;

  return v_id;
end;
$$;

revoke all on function public.create_prediction(text, text, timestamptz, text, uuid[], uuid, uuid[], boolean, text, boolean) from public;
grant execute on function public.create_prediction(text, text, timestamptz, text, uuid[], uuid, uuid[], boolean, text, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- 32. Filet de sécurité — forcer PostgREST à relire le schéma
-- ---------------------------------------------------------------------------
--
-- PostgREST met normalement à jour son cache de schéma tout seul après une
-- modification DDL, mais ce n'est pas garanti instantané. Ce `notify` force un
-- rechargement immédiat en fin de script, pour ne jamais avoir à cliquer sur
-- « Reload schema » dans le dashboard après avoir lancé ce fichier.
notify pgrst, 'reload schema';
