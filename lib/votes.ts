import type { PostgrestError } from '@supabase/supabase-js';

import { supabase } from './supabase';

export type VoteValue = 'realized' | 'missed';

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
      return 'Vote refusé : seuls les destinataires peuvent voter, et seulement une fois la prédiction révélée.';
    default:
      return `Vote impossible : ${error.message}`;
  }
}

/** Le vote de l'utilisateur connecté pour cette prédiction, `null` s'il n'a pas encore voté. */
export async function fetchMyVote(predictionId: string, voterId: string) {
  return supabase
    .from('prediction_votes')
    .select('id, prediction_id, voter_id, vote_value, created_at')
    .eq('prediction_id', predictionId)
    .eq('voter_id', voterId)
    .maybeSingle()
    .returns<Vote>();
}

/**
 * Pose ou change son vote. `upsert` sur la contrainte unique
 * (prediction_id, voter_id) : un second vote remplace le premier plutôt que
 * d'échouer, pour permettre de changer d'avis pendant le débat.
 */
export async function castVote(predictionId: string, voterId: string, value: VoteValue) {
  return supabase
    .from('prediction_votes')
    .upsert(
      { prediction_id: predictionId, voter_id: voterId, vote_value: value },
      { onConflict: 'prediction_id,voter_id' }
    );
}
