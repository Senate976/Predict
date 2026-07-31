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
  title: string;
  teaser: string;
  content: string | null;
  /** ISO 8601, en UTC. */
  reveal_at: string;
  scope: PredictionScope;
  created_at: string;
  is_revealed: boolean;
};

/** Doivent rester alignés sur les contraintes `predictions_*_length` du SQL. */
export const MAX_TITLE_LENGTH = 80;
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
      if (error.message.includes('predictions_title_length')) {
        return `Le titre doit faire entre 1 et ${MAX_TITLE_LENGTH} caractères.`;
      }
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
 */
export async function fetchPredictionsFeed() {
  return supabase
    .from('predictions_feed')
    .select('id, author_id, title, teaser, content, reveal_at, scope, created_at, is_revealed')
    .order('reveal_at', { ascending: false })
    .returns<PredictionFeedItem[]>();
}

export async function createPrediction(input: {
  title: string;
  teaser: string;
  content: string;
  revealAt: Date;
  scope: PredictionScope;
  friendIds: string[];
}) {
  return supabase.rpc('create_prediction', {
    p_title: input.title.trim(),
    p_teaser: input.teaser.trim(),
    p_content: input.content.trim(),
    p_reveal_at: input.revealAt.toISOString(),
    p_scope: input.scope,
    p_friend_ids: input.scope === 'selected' ? input.friendIds : [],
  });
}
