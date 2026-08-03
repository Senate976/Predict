import type { PostgrestError } from '@supabase/supabase-js';

import { supabase } from './supabase';

export type NotificationType =
  | 'new_teaser'
  | 'prediction_revealed'
  | 'prediction_approved'
  | 'group_invite';

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

/**
 * Les notifications de l'utilisateur, les plus récentes en tête.
 *
 * `owner:profiles!groups_owner_id_fkey(username)` — hint explicite requis :
 * `group_members` relie déjà `groups` et `profiles` (via `friend_id`), donc
 * sans préciser la contrainte, PostgREST trouve deux chemins possibles entre
 * les deux tables et refuse de deviner lequel embarquer.
 */
export async function fetchNotifications(userId: string) {
  return supabase
    .from('notifications')
    .select(
      'id, user_id, prediction_id, group_id, type, is_read, created_at, ' +
        'prediction:predictions(teaser, author:profiles(username, avatar_url)), ' +
        'group:groups(name, owner:profiles!groups_owner_id_fkey(username))'
    )
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .returns<Notification[]>();
}

export async function markNotificationRead(id: string) {
  return supabase.from('notifications').update({ is_read: true }).eq('id', id);
}

/** Nombre de notifications non lues — pour le badge de l'onglet Notifications. */
export async function fetchUnreadNotificationCount(userId: string) {
  const { count, error } = await supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
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
