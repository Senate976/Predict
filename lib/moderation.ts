import { supabase } from './supabase';

/**
 * Signalement et blocage — les deux outils qu'une app à contenu publié par ses
 * utilisateurs doit fournir. L'App Store les exige (règle 1.2), mais c'est
 * surtout le seul recours de quelqu'un qui subit un abus.
 */

/** Motifs proposés au signalement. Doit rester aligné sur la contrainte
 * `reports_reason_valid` du schéma : une valeur ajoutée ici sans l'être là-bas
 * serait refusée par la base. */
export const REPORT_REASONS = [
  { id: 'harcelement', label: 'Harcèlement ou intimidation' },
  { id: 'haine', label: 'Propos haineux ou discriminatoires' },
  { id: 'sexuel', label: 'Contenu sexuel ou choquant' },
  { id: 'violence', label: 'Violence ou menaces' },
  { id: 'spam', label: 'Spam ou arnaque' },
  { id: 'usurpation', label: 'Usurpation d’identité' },
  { id: 'autre', label: 'Autre' },
] as const;

export type ReportReason = (typeof REPORT_REASONS)[number]['id'];

/** Longueur du champ libre — même limite que `reports_details_length`. */
export const MAX_REPORT_DETAILS = 500;

export type ReportTarget =
  | { kind: 'prediction'; id: string }
  | { kind: 'comment'; id: string }
  | { kind: 'user'; id: string };

/**
 * Envoie un signalement. La RLS impose `reporter_id = auth.uid()` : on ne peut
 * pas signaler au nom de quelqu'un d'autre. Un même contenu ne peut être
 * signalé qu'une fois par la même personne (index unique côté base) — le
 * doublon remonte en 23505 et se traduit ici en message rassurant plutôt qu'en
 * erreur, puisque de son point de vue le signalement est bien parti.
 */
export async function reportContent(
  reporterId: string,
  target: ReportTarget,
  reason: ReportReason,
  details?: string
): Promise<{ error: string | null; alreadyReported: boolean }> {
  const { error } = await supabase.from('reports').insert({
    reporter_id: reporterId,
    prediction_id: target.kind === 'prediction' ? target.id : null,
    comment_id: target.kind === 'comment' ? target.id : null,
    reported_user_id: target.kind === 'user' ? target.id : null,
    reason,
    details: details?.trim() ? details.trim().slice(0, MAX_REPORT_DETAILS) : null,
  });

  if (!error) return { error: null, alreadyReported: false };
  if (error.code === '23505') return { error: null, alreadyReported: true };
  return { error: error.message || 'Signalement impossible.', alreadyReported: false };
}

/**
 * Bloque quelqu'un. Passe par la RPC `block_user` et non par un simple insert :
 * bloquer défait aussi l'amitié et retire les accès déjà accordés, sans quoi
 * une prédiction créée « pour mes amis » ré-inclurait la personne bloquée.
 */
export async function blockUser(targetUserId: string) {
  return supabase.rpc('block_user', { p_target: targetUserId });
}

/** Débloque : les contenus de la personne redeviennent visibles. */
export async function unblockUser(blockerId: string, targetUserId: string) {
  return supabase
    .from('blocked_users')
    .delete()
    .eq('blocker_id', blockerId)
    .eq('blocked_id', targetUserId);
}

/** La liste des personnes que J'AI bloquées — la RLS ne rend que celles-là. */
export async function fetchBlockedUsers(userId: string) {
  const { data, error } = await supabase
    .from('blocked_users')
    .select('blocked_id, created_at')
    .eq('blocker_id', userId)
    .order('created_at', { ascending: false });

  if (error || !data || data.length === 0) {
    return { data: [] as { id: string; username: string; avatar_url: string | null }[], error };
  }

  const { data: profiles, error: profilesError } = await supabase
    .from('profiles')
    .select('id, username, avatar_url')
    .in('id', data.map((r) => r.blocked_id));

  if (profilesError) return { data: [], error: profilesError };

  return {
    data: (profiles ?? []).map((p) => ({
      id: p.id as string,
      username: p.username as string,
      avatar_url: (p.avatar_url as string | null) ?? null,
    })),
    error: null,
  };
}

/** Vrai si j'ai bloqué cette personne — sert à choisir entre Bloquer/Débloquer. */
export async function isBlockedByMe(userId: string, targetUserId: string): Promise<boolean> {
  const { data } = await supabase
    .from('blocked_users')
    .select('blocked_id')
    .eq('blocker_id', userId)
    .eq('blocked_id', targetUserId)
    .maybeSingle();
  return !!data;
}
