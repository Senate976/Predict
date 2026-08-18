import { supabase } from './supabase';

/**
 * Les paris du Cercle : « j'y crois » / « j'y crois pas », posés tant qu'une
 * prédiction est scellée.
 *
 * Deux rôles, volontairement séparés :
 * - donner quelque chose à faire pendant l'attente, qui était jusqu'ici du
 *   silence pur ;
 * - rendre le Prediscore sensible à la difficulté, puisqu'une prédiction
 *   réalisée contre l'avis général compte double (voir schema.sql section 60).
 *
 * Le pari n'est jamais une CONDITION du score de l'auteur : si personne ne
 * parie, tout se comporte exactement comme avant. C'est ce qui évite d'avoir à
 * définir un quorum — et un quorum, ça se rate.
 */

/**
 * Pose ou change son pari. Passe par la RPC `place_bet`, qui revérifie
 * elle-même que la prédiction est encore scellée, qu'on y a accès et qu'on n'en
 * est pas l'auteur : ces conditions ne doivent pas dépendre de ce que l'app
 * veut bien envoyer.
 *
 * Changer d'avis est permis jusqu'à la révélation — c'est le sel du jeu.
 */
export async function placeBet(predictionId: string, believes: boolean) {
  return supabase.rpc('place_bet', {
    p_prediction_id: predictionId,
    p_believes: believes,
  });
}

/** Retire son pari. Refusé côté base une fois la prédiction révélée. */
export async function withdrawBet(predictionId: string, userId: string) {
  return supabase
    .from('prediction_bets')
    .delete()
    .eq('prediction_id', predictionId)
    .eq('bettor_id', userId);
}

/**
 * La phrase à afficher à la révélation, ou `null` s'il n'y a rien à raconter.
 *
 * C'est le moment de paie du mécanisme : « 7 amis n'y croyaient pas » n'a de
 * sens qu'une fois le verdict connu. Avant, la répartition n'est même pas
 * transmise par la base.
 */
export function betOutcomeLabel(
  believers: number,
  doubters: number,
  verdict: 'realized' | 'missed' | 'pending'
): string | null {
  const total = believers + doubters;
  if (total === 0 || verdict === 'pending') return null;

  const s = (n: number) => (n > 1 ? 's' : '');

  if (verdict === 'realized') {
    if (doubters > believers) {
      return `${doubters} ami${s(doubters)} n’y croyai${doubters > 1 ? 'ent' : 't'} pas. Raison quand même.`;
    }
    if (doubters === 0) {
      return `${believers} ami${s(believers)} y croyai${believers > 1 ? 'ent' : 't'}. Bien vu.`;
    }
    return `${believers} y croyai${believers > 1 ? 'ent' : 't'}, ${doubters} non.`;
  }

  // Manquée.
  if (believers > doubters) {
    return `${believers} ami${s(believers)} y croyai${believers > 1 ? 'ent' : 't'}. Manqué.`;
  }
  if (believers === 0) {
    return `${doubters} ami${s(doubters)} n’y croyai${doubters > 1 ? 'ent' : 't'} pas. Bien vu.`;
  }
  return `${believers} y croyai${believers > 1 ? 'ent' : 't'}, ${doubters} non.`;
}
