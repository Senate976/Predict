import type { PostgrestError } from '@supabase/supabase-js';

import { supabase } from './supabase';

export function voteErrorMessage(error: PostgrestError): string {
  switch (error.code) {
    case '42501':
      return 'Action refusée : seuls les destinataires peuvent se prononcer, et seulement une fois la prédiction révélée.';
    default:
      return `Action impossible : ${error.message}`;
  }
}

/**
 * Vote de confiance universel (0-100%) — remplace l'ancien choix binaire
 * (réalisée/manquée, j'y crois/j'y crois pas), quel que soit le type de
 * prédiction. Ne détermine plus lui-même le verdict : c'est l'Auto-Verdict
 * de l'auteur (`declareAutoVerdict`, lib/predictions.ts) qui en décide
 * désormais. Ce vote affiche la conviction du Cercle et note chaque votant
 * une fois l'issue connue (voir `get_prediscore`).
 */
export async function castConfidenceVote(predictionId: string, voterId: string, confidence: number) {
  return supabase
    .from('prediction_votes')
    .upsert(
      { prediction_id: predictionId, voter_id: voterId, confidence },
      { onConflict: 'prediction_id,voter_id' }
    );
}

/** Le vote de confiance de l'utilisateur connecté, `null` s'il n'a pas encore voté. */
export async function fetchMyConfidenceVote(predictionId: string, voterId: string) {
  return supabase
    .from('prediction_votes')
    .select('prediction_id, voter_id, confidence, created_at')
    .eq('prediction_id', predictionId)
    .eq('voter_id', voterId)
    .not('confidence', 'is', null)
    .maybeSingle()
    .returns<{ prediction_id: string; voter_id: string; confidence: number; created_at: string }>();
}

/** Un votant et son % de confiance — pour la modale « Détails des votes ». */
export type ConfidenceVoter = {
  user_id: string;
  username: string;
  avatar_url: string | null;
  confidence: number;
};

/**
 * Le détail des votes de confiance, un par destinataire. Deux requêtes
 * plutôt qu'un embed PostgREST — même raison que `fetchPredictionRecipients`
 * (lib/predictions.ts) : l'embed `profiles` s'est révélé intermittent sur ce
 * projet.
 */
export async function fetchConfidenceVotes(predictionId: string) {
  const { data, error } = await supabase
    .from('prediction_votes')
    .select('voter_id, confidence, created_at')
    .eq('prediction_id', predictionId)
    .not('confidence', 'is', null)
    .order('created_at', { ascending: true });

  if (error || !data) {
    return { data: null, error };
  }
  if (data.length === 0) {
    return { data: [] as ConfidenceVoter[], error: null };
  }

  const userIds = data.map((r) => r.voter_id);
  const { data: profiles, error: profilesError } = await supabase
    .from('profiles')
    .select('id, username, avatar_url')
    .in('id', userIds);

  if (profilesError) {
    return { data: null, error: profilesError };
  }

  const byId = new Map((profiles ?? []).map((p) => [p.id, p]));
  const voters: ConfidenceVoter[] = data.map((r) => ({
    user_id: r.voter_id,
    username: byId.get(r.voter_id)?.username ?? '…',
    avatar_url: byId.get(r.voter_id)?.avatar_url ?? null,
    confidence: r.confidence as number,
  }));

  return { data: voters, error: null };
}
