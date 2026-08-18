import type { PostgrestError } from '@supabase/supabase-js';

import { supabase } from './supabase';

export type NotificationType =
  | 'new_teaser'
  | 'prediction_revealed'
  | 'prediction_approved'
  | 'group_invite'
  | 'prediction_mentioned'
  | 'prediction_realized'
  | 'prediction_missed'
  | 'reveal_reminder'
  | 'question_answered'
  | 'new_comment'
  /** Rappel adressé à l'AUTEUR d'une prédiction « Libre » encore scellée,
   * répété tous les 7 jours (voir `generate_open_reminders`, schema.sql
   * section 54) — sans date de révélation, rien ne la ferait remonter. */
  | 'open_reminder';

/**
 * Une notification telle que renvoyée par `public.notifications`. Selon le
 * type, exactement l'un de `prediction`/`group` est renseigné (contrainte
 * `notifications_target_consistency` côté base) — jamais le contenu secret
 * d'une prédiction, qui reste soumis à sa propre RLS et n'a pas sa place ici.
 */
export type Notification = {
  id: string;
  user_id: string;
  prediction_id: string | null;
  group_id: string | null;
  type: NotificationType;
  is_read: boolean;
  created_at: string;
  prediction: {
    teaser: string;
    author: { username: string; avatar_url: string | null } | null;
  } | null;
  group: { name: string; owner: { username: string } | null } | null;
};

export function isMissingTable(error: PostgrestError): boolean {
  return error.code === 'PGRST205';
}

const MISSING_TABLE_MESSAGE =
  'Table `notifications` introuvable. Exécute supabase/schema.sql dans le SQL Editor.';

export function notificationErrorMessage(error: PostgrestError): string {
  if (isMissingTable(error)) return MISSING_TABLE_MESSAGE;
  return `Chargement impossible : ${error.message}`;
}

type RawNotification = {
  id: string;
  user_id: string;
  prediction_id: string | null;
  group_id: string | null;
  type: NotificationType;
  is_read: boolean;
  created_at: string;
  prediction: { teaser: string; author_id: string } | null;
  group: { name: string; owner: { username: string } | null } | null;
};

/**
 * Les notifications de l'utilisateur, les plus récentes en tête.
 *
 * `owner:profiles!groups_owner_id_fkey(username)` — hint explicite requis :
 * `group_members` relie déjà `groups` et `profiles` (via `friend_id`), donc
 * sans préciser la contrainte, PostgREST trouve deux chemins possibles entre
 * les deux tables et refuse de deviner lequel embarquer.
 *
 * L'auteur de la prédiction n'est PAS embarqué en `predictions(author:
 * profiles(...))` : PostgREST a renvoyé « more than one relationship was
 * found for predictions and profiles » sur cette installation — même classe
 * d'ambiguïté de cache de schéma déjà rencontrée pour `friendships`/`profiles`
 * (lib/friends.ts) et pour `prediction_access`/`profiles`
 * (fetchPredictionRecipients). Comme partout ailleurs dans ce fichier : deux
 * requêtes simples puis un assemblage côté client, jamais un embed profiles
 * qui dépend du cache de schéma.
 */
export async function fetchNotifications(userId: string) {
  const { data, error } = await supabase
    .from('notifications')
    .select(
      'id, user_id, prediction_id, group_id, type, is_read, created_at, ' +
        'prediction:predictions(teaser, author_id), ' +
        'group:groups(name, owner:profiles!groups_owner_id_fkey(username))'
    )
    .eq('user_id', userId)
    .eq('is_dismissed', false)
    .order('created_at', { ascending: false })
    .returns<RawNotification[]>();

  if (error || !data) {
    return { data: null, error };
  }

  const authorIds = Array.from(
    new Set(data.map((n) => n.prediction?.author_id).filter((id): id is string => !!id))
  );

  const authorsById = new Map<string, { username: string; avatar_url: string | null }>();
  if (authorIds.length > 0) {
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, username, avatar_url')
      .in('id', authorIds);
    for (const profile of profiles ?? []) {
      authorsById.set(profile.id, { username: profile.username, avatar_url: profile.avatar_url });
    }
  }

  const notifications: Notification[] = data.map((n) => ({
    id: n.id,
    user_id: n.user_id,
    prediction_id: n.prediction_id,
    group_id: n.group_id,
    type: n.type,
    is_read: n.is_read,
    created_at: n.created_at,
    prediction: n.prediction
      ? { teaser: n.prediction.teaser, author: authorsById.get(n.prediction.author_id) ?? null }
      : null,
    group: n.group,
  }));

  return { data: notifications, error: null };
}

export async function markNotificationRead(id: string) {
  return supabase.from('notifications').update({ is_read: true }).eq('id', id);
}

/**
 * Écarte une notification. On la marque plutôt que de l'effacer : les
 * notifications de révélation et de rappel sont regénérées à chaque
 * chargement du Fil (`generate_reveal_notifications`,
 * `generate_reveal_reminders`), et leur garde-fou anti-doublon s'appuie sur la
 * présence de la ligne. Une ligne réellement supprimée revenait donc à la
 * connexion suivante — d'où une suppression qui ne tenait pas.
 */
export async function deleteNotification(id: string) {
  return supabase.from('notifications').update({ is_dismissed: true }).eq('id', id);
}

/** Supprime plusieurs notifications d'un coup — sélection multiple depuis l'écran. */
export async function deleteNotifications(ids: string[]) {
  return supabase.from('notifications').update({ is_dismissed: true }).in('id', ids);
}

/** Nombre de notifications non lues — pour le badge de l'onglet Notifications. */
export async function fetchUnreadNotificationCount(userId: string) {
  const { count, error } = await supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('is_dismissed', false)
    .eq('is_read', false);
  return { count: count ?? 0, error };
}

/**
 * Rattrape les notifications `prediction_revealed` en retard : Postgres n'a
 * pas de déclencheur qui se déclenche seul quand `reveal_at` est dépassé, donc
 * on appelle cette RPC à chaque chargement du fil pour matérialiser celles
 * qui manquent. Idempotente (contrainte unique côté base), sans effet si rien
 * n'a été révélé depuis le dernier appel.
 */
export async function triggerRevealNotifications() {
  return supabase.rpc('generate_reveal_notifications');
}
