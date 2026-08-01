import type { PostgrestError } from '@supabase/supabase-js';

import { supabase } from './supabase';

export const MAX_COMMENT_LENGTH = 500;

export type Comment = {
  id: string;
  prediction_id: string;
  author_id: string;
  content: string;
  created_at: string;
  author: { username: string };
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
    .select('id, prediction_id, author_id, content, created_at, author:profiles(username)')
    .eq('prediction_id', predictionId)
    .order('created_at', { ascending: true })
    .returns<Comment[]>();
}

export async function addComment(predictionId: string, authorId: string, content: string) {
  return supabase
    .from('prediction_comments')
    .insert({ prediction_id: predictionId, author_id: authorId, content: content.trim() });
}
