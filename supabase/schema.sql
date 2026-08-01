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

alter table public.predictions drop constraint if exists predictions_scope_valid;
alter table public.predictions add constraint predictions_scope_valid
  check (scope in ('circle', 'selected'));

alter table public.prediction_contents drop constraint if exists prediction_contents_length;
alter table public.prediction_contents add constraint prediction_contents_length
  check (char_length(btrim(content)) between 1 and 280);

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

-- Un destinataire doit pouvoir voir la ligne `predictions` (titre, teaser,
-- date) dès la création, sans attendre reveal_at : c'est le Teaser, censé être
-- lisible immédiatement. Remplace l'ancienne policy qui rendait toute
-- prédiction révélée visible à n'importe quel utilisateur connecté — avec Le
-- Cercle, la visibilité est restreinte à l'audience choisie par l'auteur.
drop policy if exists "predictions_select_visible" on public.predictions;
create policy "predictions_select_visible"
  on public.predictions
  for select
  to authenticated
  using (
    author_id = auth.uid()
    or exists (
      select 1 from public.prediction_access pa
      where pa.prediction_id = predictions.id and pa.user_id = auth.uid()
    )
  );

alter table public.prediction_access enable row level security;

-- Un utilisateur voit ses propres accès (pour savoir ce qu'on lui a partagé),
-- et l'auteur voit qui a accès à ses prédictions.
drop policy if exists "prediction_access_select" on public.prediction_access;
create policy "prediction_access_select"
  on public.prediction_access
  for select
  to authenticated
  using (
    user_id = auth.uid()
    or exists (
      select 1 from public.predictions p
      where p.id = prediction_access.prediction_id and p.author_id = auth.uid()
    )
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

-- Pas de policy insert ni delete pour `authenticated` : la création est
-- réservée aux fonctions `security definer` ci-dessous.

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
