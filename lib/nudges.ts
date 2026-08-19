import { supabase } from './supabase';

/**
 * La relance « Alors ? ».
 *
 * Une prédiction scellée n'a plus de date : elle s'ouvre quand son auteur le
 * décide. Rien ne la fait donc remonter, et le Cercle n'avait aucun moyen de
 * dire « on attend toujours » — sauf à commenter, ce qui oblige à écrire
 * quelque chose alors qu'on n'a rien à ajouter.
 *
 * Ce que la relance ne fait PAS, et c'est le point : elle n'ouvre jamais la
 * prédiction. Un Predict sur l'élection de 2027 qui s'ouvrirait parce que six
 * amis ont appuyé perdrait exactement ce qui en fait l'intérêt. Elle envoie une
 * notification et fait monter un compteur ; la décision reste entière à
 * l'auteur, indéfiniment s'il le veut.
 *
 * Une relance par personne et par prédiction, imposée par la clé primaire côté
 * base. Le compteur mesure donc COMBIEN DE PERSONNES attendent, pas combien de
 * fois on a insisté — sans quoi ce serait un bouton sur lequel on tape en
 * boucle, c'est-à-dire du harcèlement à faible coût.
 */

/**
 * Envoie sa relance. Passe par la RPC `nudge_prediction`, qui revérifie
 * elle-même que la prédiction est encore scellée, qu'on y a accès, qu'on n'en
 * est pas l'auteur et qu'aucun blocage ne sépare les deux personnes. Sans
 * effet, silencieusement, si l'une de ces conditions manque : le bouton n'a pas
 * à expliquer à quelqu'un qu'il est bloqué.
 */
export async function nudgePrediction(predictionId: string) {
  return supabase.rpc('nudge_prediction', { p_prediction_id: predictionId });
}

/**
 * Retire sa relance ; le compteur redescend. On doit toujours pouvoir revenir
 * en arrière — la notification déjà partie, elle, ne se rattrape pas.
 */
export async function unnudgePrediction(predictionId: string) {
  return supabase.rpc('unnudge_prediction', { p_prediction_id: predictionId });
}

/**
 * Ce qu'on écrit sous une enveloppe encore scellée, ou `null` quand personne
 * n'a encore relancé — une carte qui annoncerait « 0 personne attend » ne dit
 * rien et occupe une ligne.
 *
 * On s'adresse à l'auteur ou au Cercle selon le cas : lui doit lire une
 * attente qui le concerne, les autres un simple état des lieux.
 */
export function nudgeCountLabel(count: number, isAuthor: boolean): string | null {
  if (count <= 0) return null;
  if (isAuthor) {
    return count === 1 ? '1 personne t’attend' : `${count} personnes t’attendent`;
  }
  return count === 1 ? '1 personne attend' : `${count} personnes attendent`;
}
