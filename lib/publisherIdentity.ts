/**
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║  À REMPLIR AVANT TOUTE MISE EN LIGNE PUBLIQUE                            ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 *
 * Identité de l'éditeur de l'application. Ces informations sont une OBLIGATION
 * LÉGALE en France (LCEN art. 6-III) : une app accessible au public doit dire
 * qui l'édite, où, et comment le joindre. Aucun texte générique ne peut s'y
 * substituer — c'est précisément l'identité réelle qui est exigée.
 *
 * Elles sont regroupées ici, et nulle part ailleurs : les documents légaux
 * (`lib/legalContent.ts`) les reprennent depuis ce fichier. Il y a donc un seul
 * endroit à corriger, pas une dizaine de trous à retrouver dans des paragraphes.
 *
 * Tant qu'une valeur commence par « À COMPLÉTER », `isPublisherIdentityComplete`
 * renvoie `false` et l'app affiche un avertissement en tête des documents
 * légaux. C'est volontairement visible : mieux vaut le voir en développement que
 * de le découvrir en ligne.
 */
export const PUBLISHER = {
  /** Personne physique (nom prénom) ou raison sociale. */
  name: 'À COMPLÉTER — nom ou raison sociale',
  /** Ex. « SAS », « auto-entrepreneur ». Laisser vide si personne physique. */
  legalForm: '',
  /** Capital social, sans le symbole €. Laisser vide si sans objet. */
  capital: '',
  /** Numéro SIRET (14 chiffres). Obligatoire si activité professionnelle. */
  siret: 'À COMPLÉTER — SIRET',
  /** Adresse postale complète du siège. */
  address: 'À COMPLÉTER — adresse complète',
  /** Nom et prénom du directeur de la publication. */
  publicationDirector: 'À COMPLÉTER — nom du directeur de la publication',
  /** Adresse de contact, réellement relevée : c'est par elle qu'arriveront les
   * demandes RGPD, auxquelles il faut répondre sous un mois. */
  contactEmail: 'À COMPLÉTER — email de contact',
  /** Hébergeur du site (nom + adresse). Pour Vercel :
   * « Vercel Inc., 440 N Barranca Ave #4133, Covina, CA 91723, États-Unis ». */
  host: 'À COMPLÉTER — nom et adresse de l’hébergeur',
  /** Tribunal compétent, en général celui du siège de l'éditeur. */
  jurisdictionCity: 'À COMPLÉTER — ville du tribunal compétent',
  /** Région Supabase où sont stockées les données (visible dans le dashboard,
   * Project Settings → General). Si elle est hors Union européenne, les
   * garanties de transfert doivent être décrites dans la Politique de
   * confidentialité — voir `legalContent.ts`. */
  dataRegion: 'À COMPLÉTER — région d’hébergement Supabase',
} as const;

/** `false` tant qu'au moins une information obligatoire n'est pas renseignée. */
export function isPublisherIdentityComplete(): boolean {
  return !Object.values(PUBLISHER).some((v) => v.startsWith('À COMPLÉTER'));
}

/** Les champs encore vides, pour les nommer dans l'avertissement. */
export function missingPublisherFields(): string[] {
  return Object.entries(PUBLISHER)
    .filter(([, v]) => v.startsWith('À COMPLÉTER'))
    .map(([k]) => k);
}

/** L'éditeur en une ligne : « Nom (SAS au capital de 1 000 €) ». */
export function publisherLine(): string {
  const parts = [PUBLISHER.name];
  if (PUBLISHER.legalForm) {
    parts.push(PUBLISHER.capital ? `${PUBLISHER.legalForm} au capital de ${PUBLISHER.capital} €` : PUBLISHER.legalForm);
  }
  return parts.length > 1 ? `${parts[0]} (${parts.slice(1).join(', ')})` : parts[0];
}
