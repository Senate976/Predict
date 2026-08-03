import type { PostgrestError } from '@supabase/supabase-js';

import { supabase } from './supabase';

export const MAX_COMMENT_LENGTH = 500;

export type Comment = {
  id: string;
  prediction_id: string;
  author_id: string;
  content: string;
  created_at: string;
  author: { username: string; avatar_url: string | null };
};

export function commentErrorMessage(error: PostgrestError): string {
  switch (error.code) {
    case '23514':
      return `Le commentaire doit faire entre 1 et ${MAX_COMMENT_LENGTH} caractères.`;
    case '42501':
      return 'Commentaire refusé : réservé à l’auteur et aux destinataires de la prédiction.';
    default:
      return `Commentaire impossible : ${error.message}`;
  }
}

/** Les commentaires d'une prédiction, du plus ancien au plus récent. */
export async function fetchComments(predictionId: string) {
  return supabase
    .from('prediction_comments')
    .select('id, prediction_id, author_id, content, created_at, author:profiles(username, avatar_url)')
    .eq('prediction_id', predictionId)
    .order('created_at', { ascending: true })
    .returns<Comment[]>();
}

/**
 * Nombre de commentaires, sans charger leur contenu — pour l'icône du Fil,
 * qui affiche juste un compteur tant que le fil de discussion n'est pas
 * ouvert. `head: true` : la requête ne renvoie aucune ligne, seulement l'en-
 * tête avec le total, ce qui évite de rapatrier des commentaires qu'on
 * n'affiche pas encore.
 */
export async function fetchCommentCount(predictionId: string) {
  const { count, error } = await supabase
    .from('prediction_comments')
    .select('id', { count: 'exact', head: true })
    .eq('prediction_id', predictionId);
  return { count: count ?? 0, error };
}

export async function addComment(predictionId: string, authorId: string, content: string) {
  return supabase
    .from('prediction_comments')
    .insert({ prediction_id: predictionId, author_id: authorId, content: content.trim() });
}

/**
 * Réservé à son propre commentaire, ou à l'auteur de la prédiction (RLS
 * `prediction_comments_delete_own`) — modération de ses propres scellés.
 */
export async function deleteComment(commentId: string) {
  return supabase.from('prediction_comments').delete().eq('id', commentId);
}
