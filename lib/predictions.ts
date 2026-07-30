import type { PostgrestError } from '@supabase/supabase-js';

import { supabase } from './supabase';

/** Une prédiction telle que stockée dans `public.predictions`. */
export type Prediction = {
  id: string;
  author_id: string;
  content: string;
  /** ISO 8601, en UTC. */
  reveal_at: string;
  created_at: string;
};

/** Doit rester aligné sur la contrainte `predictions_content_length`. */
export const MAX_CONTENT_LENGTH = 280;

/**
 * Marge minimale entre maintenant et la révélation.
 *
 * La policy d'insert refuse `reveal_at <= now()`. Sans cette marge, une date
 * encore valide au moment du clic peut être passée quand la base la reçoit, et
 * l'insert échoue sur une erreur RLS incompréhensible pour l'utilisateur.
 */
export const MIN_REVEAL_DELAY_MS = 60_000;

export function isRevealed(prediction: Prediction, now: Date): boolean {
  return new Date(prediction.reveal_at).getTime() <= now.getTime();
}

/**
 * Signale une table absente du schéma — en pratique, `supabase/schema.sql` pas
 * encore exécuté dans le SQL Editor.
 *
 * PostgREST répond `PGRST205` depuis son cache de schéma et ne laisse pas
 * remonter le `42P01` de Postgres : c'est bien le premier code qu'on reçoit.
 */
export function isMissingTable(error: PostgrestError): boolean {
  return error.code === 'PGRST205';
}

/** Traduit les erreurs d'écriture dans `predictions`. */
export function predictionErrorMessage(error: PostgrestError): string {
  if (isMissingTable(error)) {
    return 'Table `predictions` introuvable. Exécute supabase/schema.sql dans le SQL Editor.';
  }

  switch (error.code) {
    // Violation de la contrainte predictions_content_length.
    case '23514':
      return `La prédiction doit faire entre 1 et ${MAX_CONTENT_LENGTH} caractères.`;
    // RLS. Le seul `with check` que la saisie peut violer est
    // `reveal_at > now()` : la date était encore future à la validation, plus au
    // moment de l'insert.
    case '42501':
      return 'La date de révélation est déjà passée. Choisis un moment à venir.';
    default:
      return `Enregistrement impossible : ${error.message}`;
  }
}

/**
 * Les prédictions de l'utilisateur, la révélation la plus lointaine en tête.
 *
 * Le filtre sur `author_id` n'est pas redondant avec la RLS : la policy de
 * lecture laisse voir ses propres lignes *et* les prédictions révélées des
 * autres. Sans lui, la liste ramènerait tout le monde.
 */
export async function fetchMyPredictions(userId: string) {
  return supabase
    .from('predictions')
    .select('id, author_id, content, reveal_at, created_at')
    .eq('author_id', userId)
    .order('reveal_at', { ascending: false })
    .returns<Prediction[]>();
}

export async function createPrediction(input: {
  authorId: string;
  content: string;
  revealAt: Date;
}) {
  return supabase.from('predictions').insert({
    author_id: input.authorId,
    content: input.content.trim(),
    reveal_at: input.revealAt.toISOString(),
  });
}
