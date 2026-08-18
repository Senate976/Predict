/**
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║  À REMPLIR AVANT TOUTE MISE EN LIGNE PUBLIQUE                            ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 *
 * Identité de l'éditeur. Une application accessible au public doit dire qui
 * l'édite et comment le joindre (LCEN art. 6-III) — mais l'étendue de ce qu'il
 * faut publier dépend de qui édite, d'où le champ `kind` ci-dessous.
 *
 * Tout est regroupé ici et nulle part ailleurs : `lib/legalContent.ts` reprend
 * ces valeurs. Il n'y a donc qu'un fichier à corriger, pas une dizaine de trous
 * à retrouver dans des paragraphes.
 *
 * Tant qu'une valeur REQUISE commence par « À COMPLÉTER »,
 * `isPublisherIdentityComplete` renvoie `false` et l'écran des documents légaux
 * affiche un avertissement. Volontairement visible : mieux vaut le voir en
 * développement que le découvrir en ligne.
 */

/**
 * Qui édite l'application.
 *
 * - `individual` — un particulier, sans société ni activité commerciale.
 *   L'app est gratuite, sans publicité et sans achat. C'est le régime de
 *   l'éditeur NON PROFESSIONNEL : la loi permet alors de ne pas rendre publics
 *   ses nom et adresse, à condition d'avoir communiqué son identité à
 *   l'hébergeur (ce que Vercel et Supabase détiennent déjà via le compte). Il
 *   reste obligatoire de publier le nom de l'hébergeur et un moyen de contact.
 *
 * - `company` — dès qu'il y a une société, OU une activité commerciale même
 *   sans société (abonnement, achat intégré, publicité, vente de données).
 *   L'éditeur devient professionnel : identité complète, SIRET et adresse
 *   doivent être publiés.
 *
 * Le RGPD, lui, s'applique dans LES DEUX CAS : Predict traite les données
 * d'autrui (emails, pseudos, contenus, liens d'amitié) et n'est pas une
 * activité « purement personnelle » puisque l'app est ouverte à des inconnus.
 * D'où un `contactEmail` requis quoi qu'il arrive — c'est par lui qu'arrivent
 * les demandes d'accès ou de suppression, auxquelles il faut répondre sous un
 * mois.
 */
export type PublisherKind = 'individual' | 'company';

export const PUBLISHER: { kind: PublisherKind } & Record<string, string> = {
  kind: 'individual',

  // --- Requis dans tous les cas ------------------------------------------
  /** Adresse de contact, réellement relevée. Sert aussi aux demandes RGPD. */
  contactEmail: 'vverbeke40@gmail.com',
  /** Hébergeur (nom + adresse). Pour Vercel :
   * « Vercel Inc., 440 N Barranca Ave #4133, Covina, CA 91723, États-Unis ». */
  host: 'Vercel Inc., 440 N Barranca Ave #4133, Covina, CA 91723, États-Unis',
  /** Région Supabase où sont stockées les données (Project Settings → General).
   * Si elle est hors Union européenne, les garanties de transfert doivent être
   * décrites dans la Politique de confidentialité. */
  dataRegion: 'À COMPLÉTER — région d’hébergement Supabase',

  // --- Requis seulement si `kind === 'company'` ---------------------------
  /** Nom ou raison sociale. Facultatif pour un particulier non professionnel,
   * qui peut rester anonyme vis-à-vis du public. */
  name: '',
  /** Ex. « SAS », « auto-entrepreneur ». */
  legalForm: '',
  /** Capital social, sans le symbole €. */
  capital: '',
  /** SIRET (14 chiffres). */
  siret: '',
  /** Adresse postale du siège. */
  address: '',
  /** Directeur de la publication. */
  publicationDirector: '',
};

/** Les champs à renseigner selon le régime choisi. */
function requiredFields(): string[] {
  const always = ['contactEmail', 'host', 'dataRegion'];
  if (PUBLISHER.kind === 'individual') return always;
  return [...always, 'name', 'siret', 'address', 'publicationDirector'];
}

/** `false` tant qu'au moins une information requise manque. */
export function isPublisherIdentityComplete(): boolean {
  return missingPublisherFields().length === 0;
}

/** Les champs requis encore vides, pour les nommer dans l'avertissement. */
export function missingPublisherFields(): string[] {
  return requiredFields().filter((key) => {
    const value = PUBLISHER[key];
    return !value || value.startsWith('À COMPLÉTER');
  });
}

/** L'éditeur en une ligne : « Nom (SAS au capital de 1 000 €) ». Pour un
 * particulier resté anonyme, une formule neutre plutôt qu'un vide. */
export function publisherLine(): string {
  if (!PUBLISHER.name) return 'L’éditeur de Predict';
  const parts = [PUBLISHER.name];
  if (PUBLISHER.legalForm) {
    parts.push(
      PUBLISHER.capital
        ? `${PUBLISHER.legalForm} au capital de ${PUBLISHER.capital} €`
        : PUBLISHER.legalForm
    );
  }
  return parts.length > 1 ? `${parts[0]} (${parts.slice(1).join(', ')})` : parts[0];
}

/**
 * Le paragraphe d'identification des Mentions légales, adapté au régime.
 *
 * Écrit ici plutôt que dans `legalContent.ts` : un particulier non
 * professionnel n'a pas de SIRET ni de siège, et une phrase à trous du genre
 * « immatriculée sous le numéro SIRET  , dont le siège est situé  » serait pire
 * que pas de phrase du tout.
 */
export function publisherIdentityParagraph(): string {
  if (PUBLISHER.kind === 'company') {
    return `L’application Predict est éditée par ${publisherLine()}, immatriculée sous le numéro SIRET ${PUBLISHER.siret}, dont le siège est situé ${PUBLISHER.address}.`;
  }
  return (
    'L’application Predict est éditée par un particulier, à titre non professionnel et sans but commercial. ' +
    'Conformément à l’article 6-III-2 de la loi pour la confiance dans l’économie numérique, son identité n’est ' +
    `pas rendue publique ; elle a été communiquée à l’hébergeur, qui la tient à disposition de l’autorité judiciaire. ` +
    `Toute demande peut être adressée à ${PUBLISHER.contactEmail}.`
  );
}

/** Le directeur de la publication — sans objet pour un particulier anonyme. */
export function publicationDirectorParagraph(): string | null {
  if (PUBLISHER.kind !== 'company') return null;
  return `Directeur de la publication : ${PUBLISHER.publicationDirector}.`;
}
