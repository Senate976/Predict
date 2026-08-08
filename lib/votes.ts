import type { PostgrestError } from '@supabase/supabase-js';

import { supabase } from './supabase';

/** `realized`/`missed` : verdict d'une prédiction classique, une fois le
 * temps écoulé. `believe`/`disbelieve` : opinion sur une prédiction révélée
 * immédiatement (`is_immediate`) — il n'y a encore rien à constater.
 * `chaud`/`froid` : jauge Hype, tant que la prédiction est scellée.
 * `mytho`/`confiance` : jauge Réputation, une fois révélée. */
export type VoteValue =
  | 'realized'
  | 'missed'
  | 'believe'
  | 'disbelieve'
  | 'chaud'
  | 'froid'
  | 'mytho'
  | 'confiance';

/** Catégorie de vote — un destinataire peut poser un vote par catégorie sur
 * la même prédiction, indépendamment des autres (voir contrainte unique
 * `prediction_votes_unique_voter` sur `prediction_id, voter_id, vote_type`). */
export type VoteType = 'outcome' | 'belief' | 'hype' | 'reputation';

function voteTypeForValue(value: VoteValue): VoteType {
  switch (value) {
    case 'realized':
    case 'missed':
      return 'outcome';
    case 'believe':
    case 'disbelieve':
      return 'belief';
    case 'chaud':
    case 'froid':
      return 'hype';
    case 'mytho':
    case 'confiance':
      return 'reputation';
  }
}

export type Vote = {
  id: string;
  prediction_id: string;
  voter_id: string;
  vote_value: VoteValue;
  created_at: string;
};

export function voteErrorMessage(error: PostgrestError): string {
  switch (error.code) {
    case '42501':
      return 'Action refusée : seuls les destinataires peuvent se prononcer, et seulement une fois la prédiction révélée.';
    default:
      return `Action impossible : ${error.message}`;
  }
}

/** Le vote de l'utilisateur connecté pour cette catégorie, `null` s'il n'a
 * pas encore voté. `voteType` est obligatoire : un même destinataire peut
 * désormais porter un vote par catégorie sur la même prédiction. */
export async function fetchMyVote(predictionId: string, voterId: string, voteType: VoteType) {
  return supabase
    .from('prediction_votes')
    .select('id, prediction_id, voter_id, vote_value, created_at')
    .eq('prediction_id', predictionId)
    .eq('voter_id', voterId)
    .eq('vote_type', voteType)
    .maybeSingle()
    .returns<Vote>();
}

/**
 * Pose ou change son vote. `upsert` sur la contrainte unique
 * (prediction_id, voter_id, vote_type) : un second vote dans la même
 * catégorie remplace le premier plutôt que d'échouer, pour permettre de
 * changer d'avis pendant le débat — sans toucher aux autres catégories.
 */
export async function castVote(predictionId: string, voterId: string, value: VoteValue) {
  return supabase
    .from('prediction_votes')
    .upsert(
      { prediction_id: predictionId, voter_id: voterId, vote_value: value, vote_type: voteTypeForValue(value) },
      { onConflict: 'prediction_id,voter_id,vote_type' }
    );
}
