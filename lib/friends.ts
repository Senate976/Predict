import type { PostgrestError } from '@supabase/supabase-js';

import { supabase } from './supabase';

export type FriendProfile = { id: string; username: string };

export type FriendshipStatus = 'pending' | 'accepted';

export type Friendship = {
  id: string;
  requester_id: string;
  addressee_id: string;
  status: FriendshipStatus;
  created_at: string;
  requester: FriendProfile;
  addressee: FriendProfile;
};

export function isMissingTable(error: PostgrestError): boolean {
  return error.code === 'PGRST205';
}

export function friendshipErrorMessage(error: PostgrestError): string {
  if (isMissingTable(error)) {
    return 'Table `friendships` introuvable. Exécute supabase/schema.sql dans le SQL Editor.';
  }

  switch (error.code) {
    // Violation de friendships_pair_key : une relation existe déjà, dans un
    // sens ou dans l'autre.
    case '23505':
      return 'Une relation existe déjà avec cette personne.';
    // Violation de friendships_no_self.
    case '23514':
      return 'Tu ne peux pas t’ajouter toi-même.';
    case '42501':
      return 'Action non autorisée.';
    default:
      return `Action impossible : ${error.message}`;
  }
}

/** Le profil de l'autre partie de la relation, quel que soit le sens. */
export function otherProfile(friendship: Friendship, userId: string): FriendProfile {
  return friendship.requester_id === userId ? friendship.addressee : friendship.requester;
}

/**
 * Toutes les relations où l'utilisateur apparaît, les plus récentes en tête.
 *
 * Volontairement en deux requêtes plutôt qu'un embed PostgREST
 * (`profiles!friendships_requester_id_fkey(...)`) : cet embed dépend du nom
 * exact d'une contrainte de clé étrangère côté base, qui s'est révélé
 * intermittent sur ce projet (renommages de colonnes hérités, cache de schéma
 * PostgREST pas toujours à jour) — d'où l'erreur récurrente « could not find a
 * relationship between friendships and profiles ». Deux requêtes simples
 * (aucune ne dépend d'un nom de contrainte) puis un assemblage côté client
 * élimine cette classe de panne.
 */
export async function fetchFriendships(userId: string) {
  const { data, error } = await supabase
    .from('friendships')
    .select('id, requester_id, addressee_id, status, created_at')
    .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`)
    .order('created_at', { ascending: false });

  if (error || !data) {
    return { data: null, error };
  }

  const otherIds = Array.from(
    new Set(
      data.map((f) => (f.requester_id === userId ? f.addressee_id : f.requester_id))
    )
  );

  if (otherIds.length === 0) {
    return { data: [] as Friendship[], error: null };
  }

  const { data: profiles, error: profilesError } = await supabase
    .from('profiles')
    .select('id, username')
    .in('id', otherIds);

  if (profilesError) {
    return { data: null, error: profilesError };
  }

  const byId = new Map((profiles ?? []).map((p) => [p.id, p]));
  const profileOrFallback = (id: string): FriendProfile => byId.get(id) ?? { id, username: '…' };

  const friendships: Friendship[] = data.map((f) => ({
    ...f,
    requester: profileOrFallback(f.requester_id),
    addressee: profileOrFallback(f.addressee_id),
  }));

  return { data: friendships, error: null };
}

/**
 * Recherche de profils par pseudo, pour ajouter un ami. `excludeUserId` écarte
 * son propre profil des résultats.
 */
export async function searchProfilesByUsername(query: string, excludeUserId: string) {
  const trimmed = query.trim();
  if (!trimmed) {
    return { data: [] as FriendProfile[], error: null };
  }

  return supabase
    .from('profiles')
    .select('id, username')
    .ilike('username', `%${trimmed}%`)
    .neq('id', excludeUserId)
    .order('username', { ascending: true })
    .limit(10)
    .returns<FriendProfile[]>();
}

export async function sendFriendRequest(requesterId: string, addresseeId: string) {
  return supabase
    .from('friendships')
    .insert({ requester_id: requesterId, addressee_id: addresseeId })
    .select('id')
    .single();
}

/** Accepter une demande reçue — passe son statut à 'accepted'. */
export async function acceptFriendRequest(friendshipId: string) {
  return supabase.from('friendships').update({ status: 'accepted' }).eq('id', friendshipId);
}

/** Refuser une demande reçue, annuler une demande envoyée, ou retirer un ami. */
export async function removeFriendship(friendshipId: string) {
  return supabase.from('friendships').delete().eq('id', friendshipId);
}
