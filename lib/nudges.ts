import { supabase } from './supabase';

/**
 * La relance « Impatient ».
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
 * Une relance par personne et par SEMAINE. La clé primaire garantit qu'il
 * n'existe jamais qu'une ligne par personne et par prédiction : le compteur
 * mesure donc COMBIEN DE PERSONNES attendent, pas combien de fois on a
 * insisté — sans quoi ce serait un bouton sur lequel on tape en boucle,
 * c'est-à-dire du harcèlement à faible coût. Passé sept jours, la même ligne
 * est simplement remise à jour et la notification de l'auteur se rallume.
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
 * Retire sa relance ; le compteur redescend.
 *
 * Plus appelée depuis la carte : le bouton « Impatient » disparaît une fois
 * touché, il n'y a donc plus de second appui par lequel se rétracter — et la
 * relance s'efface d'elle-même au bout de sept jours. La fonction reste
 * exposée côté base, et ce point d'entrée avec elle : si un jour on redonne
 * le moyen de se rétracter, c'est ici qu'il se branchera.
 */
export async function unnudgePrediction(predictionId: string) {
  return supabase.rpc('unnudge_prediction', { p_prediction_id: predictionId });
}

/**
 * Ce qu'on écrit sous une enveloppe encore scellée, ou `null` quand personne
 * n'a encore relancé — une carte qui annoncerait « 0 personne attend » ne dit
 * rien et occupe une ligne.
 *
 * Le même mot que le bouton, pour que les deux se répondent : on appuie sur
 * « Impatient », l'auteur lit « 6 personnes s'impatientent ». La formulation
 * est la même pour tout le monde : elle décrit le Cercle, pas l'auteur, et
 * n'a donc pas à changer selon qui la lit.
 */
export function nudgeCountLabel(count: number): string | null {
  if (count <= 0) return null;
  return count === 1 ? '1 personne s’impatiente' : `${count} personnes s’impatientent`;
}
