import type { PostgrestError } from '@supabase/supabase-js';

import { type EmojiReaction } from './predictions';
import { supabase } from './supabase';

export const MAX_COMMENT_LENGTH = 500;

export type Comment = {
  id: string;
  prediction_id: string;
  author_id: string;
  content: string;
  created_at: string;
  reply_to_id: string | null;
  author: { username: string; avatar_url: string | null };
  emoji_counts: Partial<Record<EmojiReaction, number>>;
  my_emoji_reaction: EmojiReaction | null;
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

type RawComment = Omit<Comment, 'author'>;

/**
 * Les commentaires d'une prédiction, du plus ancien au plus récent —
 * `prediction_comments_feed` (pas la table brute) pour porter aussi
 * `emoji_counts`/`my_emoji_reaction`. Deux requêtes plutôt qu'un embed
 * PostgREST pour l'auteur, comme partout ailleurs dans l'app (voir
 * lib/notifications.ts) : un embed `profiles` à travers une vue dépend d'un
 * cache de schéma qui a déjà causé des ambiguïtés ailleurs.
 */
export async function fetchComments(predictionId: string) {
  const { data, error } = await supabase
    .from('prediction_comments_feed')
    .select('id, prediction_id, author_id, content, created_at, reply_to_id, emoji_counts, my_emoji_reaction')
    .eq('prediction_id', predictionId)
    .order('created_at', { ascending: true })
    .returns<RawComment[]>();

  if (error || !data) {
    return { data: null, error };
  }
  if (data.length === 0) {
    return { data: [] as Comment[], error: null };
  }

  const authorIds = Array.from(new Set(data.map((c) => c.author_id)));
  const { data: profiles, error: profilesError } = await supabase
    .from('profiles')
    .select('id, username, avatar_url')
    .in('id', authorIds);
  if (profilesError) {
    return { data: null, error: profilesError };
  }

  const byId = new Map((profiles ?? []).map((p) => [p.id, p]));
  const comments: Comment[] = data.map((c) => ({
    ...c,
    author: byId.get(c.author_id) ?? { username: '…', avatar_url: null },
  }));
  return { data: comments, error: null };
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

export async function addComment(
  predictionId: string,
  authorId: string,
  content: string,
  replyToId?: string | null
) {
  return supabase
    .from('prediction_comments')
    .insert({
      prediction_id: predictionId,
      author_id: authorId,
      content: content.trim(),
      reply_to_id: replyToId ?? null,
    });
}

/**
 * Réservé à son propre commentaire, ou à l'auteur de la prédiction (RLS
 * `prediction_comments_delete_own`) — modération de ses propres scellés.
 */
export async function deleteComment(commentId: string) {
  return supabase.from('prediction_comments').delete().eq('id', commentId);
}

/** Pose ou change sa réaction emoji sur un commentaire — même principe que
 * `castEmojiReaction` (lib/predictions.ts) sur une prédiction entière. */
export async function castCommentEmojiReaction(commentId: string, userId: string, emoji: EmojiReaction) {
  return supabase
    .from('prediction_comment_reactions')
    .upsert({ comment_id: commentId, user_id: userId, emoji }, { onConflict: 'comment_id,user_id' });
}

/** Retire sa réaction — refaire le même emoji bascule en « aucune réaction ». */
export async function removeCommentEmojiReaction(commentId: string, userId: string) {
  return supabase
    .from('prediction_comment_reactions')
    .delete()
    .eq('comment_id', commentId)
    .eq('user_id', userId);
}
