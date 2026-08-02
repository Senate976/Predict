import type { PostgrestError } from '@supabase/supabase-js';

import { supabase } from './supabase';

export const MAX_GROUP_NAME_LENGTH = 40;

export type GroupVisibility = 'private' | 'public';

export type FriendGroup = {
  id: string;
  name: string;
  visibility: GroupVisibility;
  created_at: string;
};

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

/** Les groupes de l'utilisateur connecté, du plus ancien au plus récent. */
export async function fetchGroups(ownerId: string) {
  return supabase
    .from('groups')
    .select('id, name, visibility, created_at')
    .eq('owner_id', ownerId)
    .order('created_at', { ascending: true })
    .returns<FriendGroup[]>();
}

export async function createGroup(ownerId: string, name: string, visibility: GroupVisibility) {
  return supabase
    .from('groups')
    .insert({ owner_id: ownerId, name: name.trim(), visibility })
    .select('id, name, visibility, created_at')
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
