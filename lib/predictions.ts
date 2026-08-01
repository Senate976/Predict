import type { PostgrestError } from '@supabase/supabase-js';

import { supabase } from './supabase';

export type PredictionScope = 'circle' | 'selected';

/**
 * Une prédiction telle que renvoyée par la vue `public.predictions_feed`.
 *
 * `content` est `null` tant que la RLS de `prediction_contents` ne le laisse
 * pas passer — c'est-à-dire tant que l'appelant n'est ni l'auteur, ni un
 * destinataire après `reveal_at`. Le Teaser, lui, est toujours présent : c'est
 * la promesse du Cercle, lisible dès la création.
 */
export type PredictionFeedItem = {
  id: string;
  author_id: string;
  teaser: string;
  content: string | null;
  /** Chemin dans le bucket `prediction-audio`, ou `null` sans message vocal. Soumis à la même RLS que `content`. */
  audio_path: string | null;
  /** ISO 8601, en UTC. */
  reveal_at: string;
  scope: PredictionScope;
  created_at: string;
  is_revealed: boolean;
};

/** Doivent rester alignés sur les contraintes `predictions_*_length` du SQL. */
export const MAX_TEASER_LENGTH = 160;
export const MAX_CONTENT_LENGTH = 280;

/**
 * Marge minimale entre maintenant et la révélation.
 *
 * La policy d'insert refuse `reveal_at <= now()`. Sans cette marge, une date
 * encore valide au moment du clic peut être passée quand la base la reçoit, et
 * l'insert échoue sur une erreur RLS incompréhensible pour l'utilisateur.
 */
export const MIN_REVEAL_DELAY_MS = 60_000;

export function isRevealed(prediction: Pick<PredictionFeedItem, 'reveal_at'>, now: Date): boolean {
  return new Date(prediction.reveal_at).getTime() <= now.getTime();
}

/**
 * Signale une table ou fonction absente du schéma — en pratique,
 * `supabase/schema.sql` pas encore (ré)exécuté dans le SQL Editor.
 *
 * PostgREST répond `PGRST205` (table/vue) ou `PGRST202` (fonction RPC) depuis
 * son cache de schéma et ne laisse pas remonter le code Postgres d'origine.
 */
export function isMissingSchema(error: PostgrestError): boolean {
  return error.code === 'PGRST205' || error.code === 'PGRST202';
}

const MISSING_SCHEMA_MESSAGE =
  'Schéma introuvable (table, vue ou fonction). Exécute supabase/schema.sql dans le SQL Editor.';

/** Traduit les erreurs de lecture du fil de prédictions. */
export function feedErrorMessage(error: PostgrestError): string {
  if (isMissingSchema(error)) return MISSING_SCHEMA_MESSAGE;
  return `Chargement impossible : ${error.message}`;
}

/** Traduit les erreurs de la RPC `create_prediction`. */
export function predictionErrorMessage(error: PostgrestError): string {
  if (isMissingSchema(error)) return MISSING_SCHEMA_MESSAGE;

  switch (error.code) {
    // Violation d'une des contraintes check (longueur ou portée invalide).
    case '23514':
      if (error.message.includes('predictions_teaser_length')) {
        return `Le teaser doit faire entre 1 et ${MAX_TEASER_LENGTH} caractères.`;
      }
      if (error.message.includes('prediction_contents_length')) {
        return `Le contenu secret doit faire entre 1 et ${MAX_CONTENT_LENGTH} caractères.`;
      }
      return `Prédiction invalide : ${error.message}`;
    // RLS. Soit la date de révélation n'est plus future, soit un destinataire
    // choisi n'est pas (ou plus) un ami accepté.
    case '42501':
      return 'Enregistrement refusé : vérifie la date de révélation et que les destinataires sont bien dans ton Cercle.';
    default:
      return `Enregistrement impossible : ${error.message}`;
  }
}

/**
 * Le fil visible par l'utilisateur connecté : ses propres prédictions, et
 * celles où on lui a donné accès. La RLS de `predictions_feed` fait tout le
 * tri — cette fonction ne filtre rien de plus, elle se contente de trier.
 *
 * Tri par `created_at` et non `reveal_at` : c'est un fil d'actualité — l'ordre
 * dans lequel les choses ont été publiées, pas celui de leur révélation.
 */
const FEED_COLUMNS = 'id, author_id, teaser, content, audio_path, reveal_at, scope, created_at, is_revealed';

export async function fetchPredictionsFeed() {
  return supabase
    .from('predictions_feed')
    .select(FEED_COLUMNS)
    .order('created_at', { ascending: false })
    .returns<PredictionFeedItem[]>();
}

export async function fetchPrediction(predictionId: string) {
  return supabase
    .from('predictions_feed')
    .select(FEED_COLUMNS)
    .eq('id', predictionId)
    .maybeSingle()
    .returns<PredictionFeedItem>();
}

export async function createPrediction(input: {
  teaser: string;
  content: string;
  revealAt: Date;
  scope: PredictionScope;
  friendIds: string[];
}) {
  const result = await supabase.rpc('create_prediction', {
    p_teaser: input.teaser.trim(),
    p_content: input.content.trim(),
    p_reveal_at: input.revealAt.toISOString(),
    p_scope: input.scope,
    p_friend_ids: input.scope === 'selected' ? input.friendIds : [],
  });
  return result as { data: string | null; error: PostgrestError | null };
}

/**
 * Un destinataire d'une prédiction, tel que renvoyé par `prediction_access`
 * avec son profil embarqué (la clé étrangère `user_id -> profiles(id)`
 * permet l'embed en une requête).
 */
export type PredictionRecipient = {
  user_id: string;
  profile: { username: string };
};

/** Réservé à l'auteur : la RLS de `prediction_access` ne renvoie sinon que sa propre ligne. */
export async function fetchPredictionRecipients(predictionId: string) {
  return supabase
    .from('prediction_access')
    .select('user_id, profile:profiles(username)')
    .eq('prediction_id', predictionId)
    .returns<PredictionRecipient[]>();
}

/**
 * Ajoute un destinataire à une prédiction existante. La RLS exige que ce soit
 * l'auteur qui agisse et que la personne ajoutée soit un ami accepté — sinon
 * l'insert est refusé (42501). Déclenche immédiatement la notification
 * `new_teaser` côté base (trigger sur `prediction_access`).
 */
export async function addRecipient(predictionId: string, userId: string) {
  return supabase
    .from('prediction_access')
    .insert({ prediction_id: predictionId, user_id: userId });
}

/** Retire un destinataire, à tout moment (avant ou après révélation). */
export async function removeRecipient(predictionId: string, userId: string) {
  return supabase
    .from('prediction_access')
    .delete()
    .eq('prediction_id', predictionId)
    .eq('user_id', userId);
}

export type PredictionOutcomeStatus = 'pending' | 'realized' | 'missed';

/**
 * Une prédiction de l'auteur avec son statut final, tel que calculé par la
 * vue `public.prediction_outcomes` (majorité des votes des destinataires).
 * Alimente les 4 compteurs et l'historique filtrable du Profil.
 */
export type PredictionOutcome = {
  prediction_id: string;
  author_id: string;
  teaser: string;
  reveal_at: string;
  created_at: string;
  is_revealed: boolean;
  realized_votes: number;
  missed_votes: number;
  final_status: PredictionOutcomeStatus;
};

/** Le statut d'une prédiction précise — auteur ou destinataire, peu importe. */
export async function fetchPredictionOutcome(predictionId: string) {
  return supabase
    .from('prediction_outcomes')
    .select(
      'prediction_id, author_id, teaser, reveal_at, created_at, is_revealed, realized_votes, missed_votes, final_status'
    )
    .eq('prediction_id', predictionId)
    .maybeSingle()
    .returns<PredictionOutcome>();
}

/** Réservé à la lecture de ses propres prédictions (RLS de `predictions`). */
export async function fetchPredictionOutcomes(authorId: string) {
  return supabase
    .from('prediction_outcomes')
    .select(
      'prediction_id, author_id, teaser, reveal_at, created_at, is_revealed, realized_votes, missed_votes, final_status'
    )
    .eq('author_id', authorId)
    .order('created_at', { ascending: false })
    .returns<PredictionOutcome[]>();
}
