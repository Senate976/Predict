-- ---------------------------------------------------------------------------
-- Nettoyage ciblé : retire de la base Supabase tout ce que les rondes #54
-- (validation sociale / Auto-Verdict) et #55 (vote de confiance universel)
-- avaient ajouté, pour la ramener au même état que le code (revenu en
-- arrière juste avant #54). À exécuter UNE SEULE FOIS, avant de rejouer le
-- fichier schema.sql (envoyé séparément).
--
-- Sans danger à rejouer plusieurs fois : tout est "if exists".
-- ---------------------------------------------------------------------------

-- Notifications des deux fonctionnalités retirées : sans elles, la
-- contrainte notifications_type_check ci-dessous échouerait sur toute ligne
-- déjà écrite par declare_auto_verdict/cast_validation.
delete from public.notifications
where type in ('auto_verdict_declared', 'mauvaise_foi_triggered');

-- Fonctions propres à l'Auto-Verdict / au jury de mauvaise foi.
drop function if exists public.declare_auto_verdict(uuid, boolean);
drop function if exists public.cast_validation(uuid, text);
drop function if exists public.cast_bad_faith_vote(uuid, text);

-- Vues qui lisent ces tables — retirées ici, schema.sql les recrée juste
-- après dans leur version d'avant #54/#55.
drop view if exists public.predictions_feed;
drop view if exists public.prediction_outcomes;
drop view if exists public.prediction_resolutions;

-- Tables propres à la validation tacite et au jury — supprime aussi leurs
-- policies (portées par la table).
drop table if exists public.prediction_validations;
drop table if exists public.prediction_bad_faith_votes;

-- Colonnes ajoutées sur predictions pour l'Auto-Verdict (entraîne la
-- suppression automatique de leur contrainte/index).
alter table public.predictions drop column if exists resolution_status;
alter table public.predictions drop column if exists auto_verdict_declared_at;
alter table public.predictions drop column if exists bad_faith_vote_started_at;

-- Votes posés uniquement avec un % de confiance (sans choix
-- réalisée/manquée) : sans le vote de confiance, ils ne veulent plus rien
-- dire, on les retire avant de restaurer la contrainte "obligatoire".
delete from public.prediction_votes where vote_value is null;

-- Colonne confidence (vote de confiance universel) et sa contrainte.
alter table public.prediction_votes drop column if exists confidence;

-- Restaure vote_value comme obligatoire (comme avant #55).
alter table public.prediction_votes alter column vote_value set not null;

-- Restaure la liste des types de notification autorisés (sans les deux
-- types de l'Auto-Verdict, supprimés plus haut).
alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type in ('new_teaser', 'prediction_revealed', 'prediction_approved', 'group_invite', 'prediction_mentioned'));

-- Le reste (vues prediction_resolutions/predictions_feed/prediction_outcomes,
-- fonctions get_prediscore/get_group_prediscore, policies de suppression) se
-- corrige automatiquement en rejouant schema.sql juste après ce script :
-- toutes ces définitions utilisent "create or replace" ou "drop + create",
-- donc la version du fichier écrase systématiquement l'ancienne, quel que
-- soit l'état actuel de la base.

notify pgrst, 'reload schema';
