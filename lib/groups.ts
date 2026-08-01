import type { PostgrestError } from '@supabase/supabase-js';

import { supabase } from './supabase';

export const MAX_GROUP_NAME_LENGTH = 40;

export type FriendGroup = {
  id: string;
  name: string;
  created_at: string;
};

/**
 * Un membre de groupe avec son profil embarqué. `profiles(username)` sans
 * alias de contrainte : `group_members.friend_id` n'a qu'une seule clé
 * étrangère vers `profiles`, pas d'ambiguïté à lever pour PostgREST.
 */
export type GroupMember = {
  friend_id: string;
  profile: { username: string };
};

export function groupErrorMessage(error: PostgrestError): string {
  switch (error.code) {
    case '23514':
      return `Le nom du groupe doit faire entre 1 et ${MAX_GROUP_NAME_LENGTH} caractères.`;
    case '23505':
      return 'Cette personne est déjà dans le groupe.';
    case '42501':
      return 'Action non autorisée : seul un ami accepté peut rejoindre un groupe.';
    default:
      return `Action impossible : ${error.message}`;
  }
}

/** Les groupes de l'utilisateur connecté, du plus ancien au plus récent. */
export async function fetchGroups(ownerId: string) {
  return supabase
    .from('groups')
    .select('id, name, created_at')
    .eq('owner_id', ownerId)
    .order('created_at', { ascending: true })
    .returns<FriendGroup[]>();
}

export async function createGroup(ownerId: string, name: string) {
  return supabase
    .from('groups')
    .insert({ owner_id: ownerId, name: name.trim() })
    .select('id, name, created_at')
    .single();
}

export async function deleteGroup(groupId: string) {
  return supabase.from('groups').delete().eq('id', groupId);
}

export async function fetchGroupMembers(groupId: string) {
  return supabase
    .from('group_members')
    .select('friend_id, profile:profiles(username)')
    .eq('group_id', groupId)
    .returns<GroupMember[]>();
}

/** La RLS exige que `friendId` soit un ami accepté du propriétaire du groupe. */
export async function addGroupMember(groupId: string, friendId: string) {
  return supabase.from('group_members').insert({ group_id: groupId, friend_id: friendId });
}

export async function removeGroupMember(groupId: string, friendId: string) {
  return supabase
    .from('group_members')
    .delete()
    .eq('group_id', groupId)
    .eq('friend_id', friendId);
}
