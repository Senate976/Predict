import type { PostgrestError } from '@supabase/supabase-js';

import { supabase } from './supabase';

export const MAX_GROUP_NAME_LENGTH = 40;

export type GroupVisibility = 'private' | 'public';

export type FriendGroup = {
  id: string;
  owner_id: string;
  name: string;
  visibility: GroupVisibility;
  created_at: string;
};

const GROUP_COLUMNS = 'id, owner_id, name, visibility, created_at';

export type GroupMemberStatus = 'pending' | 'accepted';

/**
 * Un membre (ou invité) de groupe avec son profil embarqué. `profiles(username)`
 * sans alias de contrainte : `group_members.friend_id` n'a qu'une seule clé
 * étrangère vers `profiles`, pas d'ambiguïté à lever pour PostgREST.
 */
export type GroupMember = {
  friend_id: string;
  status: GroupMemberStatus;
  profile: { username: string };
};

export function groupErrorMessage(error: PostgrestError): string {
  switch (error.code) {
    case '23514':
      return `Le nom du groupe doit faire entre 1 et ${MAX_GROUP_NAME_LENGTH} caractères.`;
    case '23505':
      return 'Cette personne est déjà invitée dans le groupe.';
    case '42501':
      return 'Action non autorisée : seul un ami accepté peut être invité dans un groupe.';
    default:
      return `Action impossible : ${error.message}`;
  }
}

/**
 * Les groupes de l'utilisateur connecté, du plus ancien au plus récent — les
 * siens (owner_id) ET ceux qu'il a rejoints (ligne `group_members` acceptée).
 *
 * Deux requêtes plutôt qu'un `.or()` sur des tables différentes (impossible
 * en un seul appel PostgREST) : on récupère d'abord les groupes possédés, puis
 * les ids des groupes rejoints via `group_members`, avant de charger ces
 * derniers et de tout fusionner côté client. Sans ce second aller-retour, un
 * utilisateur qui accepte une invitation ne voyait jamais le groupe apparaître
 * dans son propre onglet Groupes — seul le propriétaire le voyait.
 */
export async function fetchGroups(userId: string) {
  const { data: owned, error: ownedError } = await supabase
    .from('groups')
    .select(GROUP_COLUMNS)
    .eq('owner_id', userId)
    .returns<FriendGroup[]>();

  if (ownedError) {
    return { data: null, error: ownedError };
  }

  const { data: memberRows, error: memberError } = await supabase
    .from('group_members')
    .select('group_id')
    .eq('friend_id', userId)
    .eq('status', 'accepted');

  if (memberError) {
    return { data: null, error: memberError };
  }

  const ownedIds = new Set((owned ?? []).map((g) => g.id));
  const joinedIds = Array.from(new Set((memberRows ?? []).map((r) => r.group_id))).filter(
    (id) => !ownedIds.has(id)
  );

  let joined: FriendGroup[] = [];
  if (joinedIds.length > 0) {
    const { data: joinedGroups, error: joinedError } = await supabase
      .from('groups')
      .select(GROUP_COLUMNS)
      .in('id', joinedIds)
      .returns<FriendGroup[]>();

    if (joinedError) {
      return { data: null, error: joinedError };
    }
    joined = joinedGroups ?? [];
  }

  const all = [...(owned ?? []), ...joined].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );

  return { data: all, error: null as PostgrestError | null };
}

export async function createGroup(ownerId: string, name: string, visibility: GroupVisibility) {
  return supabase
    .from('groups')
    .insert({ owner_id: ownerId, name: name.trim(), visibility })
    .select(GROUP_COLUMNS)
    .single();
}

export async function deleteGroup(groupId: string) {
  return supabase.from('groups').delete().eq('id', groupId);
}

/** Membres ET invités en attente d'un groupe — à l'appelant de trier par `status`. */
export async function fetchGroupMembers(groupId: string) {
  return supabase
    .from('group_members')
    .select('friend_id, status, profile:profiles(username)')
    .eq('group_id', groupId)
    .returns<GroupMember[]>();
}

/**
 * Invite un ami dans un groupe — crée une ligne `status: 'pending'` (valeur
 * par défaut côté base). La RLS exige que `friendId` soit un ami accepté du
 * propriétaire du groupe ; l'invité doit ensuite accepter lui-même
 * (`acceptGroupInvite`) pour compter comme un vrai membre.
 */
export async function addGroupMember(groupId: string, friendId: string) {
  return supabase.from('group_members').insert({ group_id: groupId, friend_id: friendId });
}

/** Retire un membre (ou une invitation en attente) — réservé au propriétaire du groupe. */
export async function removeGroupMember(groupId: string, friendId: string) {
  return supabase
    .from('group_members')
    .delete()
    .eq('group_id', groupId)
    .eq('friend_id', friendId);
}

/** Accepter une invitation reçue — passe sa ligne de 'pending' à 'accepted'. */
export async function acceptGroupInvite(groupId: string, friendId: string) {
  return supabase
    .from('group_members')
    .update({ status: 'accepted' })
    .eq('group_id', groupId)
    .eq('friend_id', friendId);
}

/** Refuser une invitation reçue, ou quitter un groupe déjà rejoint. */
export async function declineGroupInvite(groupId: string, friendId: string) {
  return supabase
    .from('group_members')
    .delete()
    .eq('group_id', groupId)
    .eq('friend_id', friendId);
}

/**
 * Le Prediscore d'un membre, restreint aux seules prédictions liées à ce
 * groupe (`predictions.group_id`) — distinct du Prediscore global du profil.
 * `null` tant qu'aucune prédiction pondérable n'existe encore pour ce membre
 * dans ce groupe précis.
 */
export async function fetchGroupPrediscore(groupId: string, targetUserId: string) {
  const { data, error } = await supabase
    .rpc('get_group_prediscore', { p_group_id: groupId, p_target_user: targetUserId })
    .maybeSingle()
    .returns<{ score: number | null; weighted_count: number }>();

  if (error || !data) {
    return { score: null as number | null, error };
  }
  return { score: data.score === null ? null : Number(data.score), error: null };
}
