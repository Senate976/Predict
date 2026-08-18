import {
  PUBLISHER,
  publicationDirectorParagraph,
  publisherIdentityParagraph,
  publisherLine,
} from './publisherIdentity';
import type { LegalDocId } from './settingsSections';

export type LegalSection = { heading: string; paragraphs: string[] };
export type LegalDocContent = { updatedAt: string; intro?: string; sections: LegalSection[] };

/**
 * Contenu des 3 documents légaux — un premier jet complet et cohérent avec
 * le fonctionnement réel de l'app, PAS une version validée par un juriste.
 *
 * Les informations propres à l'exploitant (identité, adresse, hébergeur,
 * contact) ne sont plus écrites en dur ici : elles viennent toutes de
 * `lib/publisherIdentity.ts`, seul fichier à remplir. Tant qu'il ne l'est pas,
 * l'écran des documents légaux affiche un avertissement bien visible — les
 * Mentions légales sont une obligation (LCEN art. 6-III) qu'aucun texte
 * générique ne peut satisfaire à la place de ces informations.
 */
export const LEGAL_CONTENT: Record<LegalDocId, LegalDocContent> = {
  mentions: {
    updatedAt: '9 août 2026',
    sections: [
      {
        heading: 'Éditeur de l’application',
        // `filter` : le directeur de la publication n'existe pas pour un
        // particulier non professionnel. Mieux vaut retirer la ligne que
        // publier « Directeur de la publication : . »
        paragraphs: [
          publisherIdentityParagraph(),
          publicationDirectorParagraph(),
          `Contact : ${PUBLISHER.contactEmail}.`,
        ].filter((paragraph): paragraph is string => paragraph !== null),
      },
      {
        heading: 'Hébergement',
        paragraphs: [
          'Les données de l’application (comptes, prédictions, commentaires, notifications) sont hébergées et gérées via Supabase (base de données PostgreSQL et authentification), fourni par Supabase Inc.',
          `L’application elle-même (site web et/ou distribution mobile) est hébergée par ${PUBLISHER.host}.`,
        ],
      },
      {
        heading: 'Propriété intellectuelle',
        paragraphs: [
          'Le nom « Predict », son logo, sa charte graphique et l’ensemble des éléments de l’interface (hors contenu publié par les utilisateurs) sont la propriété de l’éditeur et protégés par le droit de la propriété intellectuelle. Toute reproduction non autorisée est interdite.',
          'Le contenu publié par les utilisateurs (teasers, prédictions, commentaires, photos de profil) reste la propriété de son auteur, qui en conserve l’entière responsabilité — voir les Conditions Générales d’Utilisation.',
        ],
      },
      {
        heading: 'Responsabilité',
        paragraphs: [
          'L’éditeur s’efforce d’assurer l’exactitude et la disponibilité du service, sans garantie de résultat. L’éditeur ne saurait être tenu responsable du contenu publié par les utilisateurs, ni des conséquences d’une prédiction, réalisée ou non.',
        ],
      },
      {
        heading: 'Contact',
        paragraphs: [`Pour toute question relative à ces mentions légales : ${PUBLISHER.contactEmail}.`],
      },
    ],
  },
  terms: {
    updatedAt: '9 août 2026',
    intro:
      'En créant un compte sur Predict, tu acceptes sans réserve les présentes Conditions Générales d’Utilisation (CGU). Si tu ne les acceptes pas, n’utilise pas l’application.',
    sections: [
      {
        heading: '1. Objet',
        paragraphs: [
          'Predict est une application permettant à un utilisateur de sceller une prédiction — un teaser public immédiatement visible, et un contenu secret révélé à une date choisie ou à la demande de son auteur — et de la partager avec son Cercle d’amis, une sélection d’amis, ou un groupe.',
        ],
      },
      {
        heading: '2. Création de compte',
        paragraphs: [
          'L’inscription nécessite une adresse email valide et un pseudo unique. Tu es seul responsable de la confidentialité de ton mot de passe et de toute activité effectuée depuis ton compte.',
          'L’usage de Predict est réservé aux personnes en capacité de contracter légalement, ou disposant de l’autorisation de leur représentant légal si la loi applicable l’exige pour les mineurs.',
          'Les informations fournies à l’inscription (pseudo notamment) doivent être exactes et ne pas usurper l’identité d’un tiers.',
        ],
      },
      {
        heading: '3. Fonctionnement du service',
        paragraphs: [
          'Une prédiction se compose d’un teaser (visible immédiatement par son audience) et d’un contenu (révélé à la date programmée, à la demande de l’auteur, ou immédiatement selon le mode choisi à la création).',
          'L’auteur choisit l’audience de chaque prédiction : tout son Cercle, une sélection d’amis, ou un groupe. Il peut ajouter des destinataires supplémentaires avant la révélation, sauf pour les prédictions déjà révélées.',
          'Une fois la prédiction révélée, son auteur — et lui seul — peut affirmer si elle s’est réalisée ou a été manquée ; ce verdict, une fois posé, ne peut être changé que par l’auteur lui-même depuis l’écran de la prédiction.',
          'Le Prediscore est un indicateur calculé automatiquement à partir de l’historique des verdicts affirmés, pondéré par l’anticipation de chaque prédiction. Il n’a aucune valeur contractuelle ni certifiée.',
          'Les destinataires peuvent réagir à une prédiction avec une réaction emoji et commenter une fois révélée (ou avant, selon les réglages du contenu).',
        ],
      },
      {
        heading: '4. Contenu et comportement',
        paragraphs: [
          'Tu es seul responsable du contenu que tu publies (teasers, prédictions, commentaires, photo de profil). Ce contenu ne doit pas être illégal, diffamatoire, injurieux, haineux, à caractère violent ou pornographique, ni porter atteinte aux droits d’un tiers (vie privée, image, propriété intellectuelle).',
          'Predict n’est pas un service de paris ou de jeux d’argent : aucune mise financière n’est associée aux prédictions, quel qu’en soit le sujet.',
          'L’éditeur se réserve le droit de retirer tout contenu manifestement contraire aux présentes CGU ou à la loi, et de suspendre ou clôturer le compte d’un utilisateur en cas de manquement grave ou répété.',
        ],
      },
      {
        heading: '5. Suppression du compte',
        paragraphs: [
          'Tu peux supprimer ton compte à tout moment depuis Paramètres > Sécurité. Cette action est irréversible : ton profil, tes prédictions, tes commentaires et l’ensemble des données qui s’y rattachent sont alors définitivement effacés.',
        ],
      },
      {
        heading: '6. Disponibilité du service',
        paragraphs: [
          'L’éditeur s’efforce d’assurer un service accessible en continu, sans garantie de disponibilité ininterrompue. Des interruptions pour maintenance ou en cas de force majeure peuvent survenir.',
        ],
      },
      {
        heading: '7. Données personnelles',
        paragraphs: [
          'Le traitement des données personnelles est détaillé dans la Politique de confidentialité, partie intégrante des présentes CGU.',
        ],
      },
      {
        heading: '8. Modification des CGU',
        paragraphs: [
          'Les présentes CGU peuvent être modifiées à tout moment. Les utilisateurs seront informés de tout changement substantiel ; la poursuite de l’utilisation de l’application après modification vaut acceptation des nouvelles CGU.',
        ],
      },
      {
        heading: '9. Droit applicable',
        paragraphs: [
          // Aucune ville nommée, volontairement. Une clause qui désigne un
          // tribunal précis est de toute façon inopposable à un consommateur en
          // France (art. R. 631-3 du code de la consommation) : il peut
          // toujours saisir la juridiction de son domicile. Nommer une ville
          // n'apportait donc rien, et obligeait l'éditeur à deviner de quel
          // ressort dépend sa commune.
          'Les présentes CGU sont soumises au droit français. À défaut de résolution amiable, tout litige relève des juridictions françaises compétentes. Si tu agis en qualité de consommateur, tu conserves le droit de saisir la juridiction de ton lieu de résidence.',
        ],
      },
      {
        heading: '10. Contact',
        paragraphs: [`Pour toute question relative aux présentes CGU : ${PUBLISHER.contactEmail}.`],
      },
    ],
  },
  privacy: {
    updatedAt: '9 août 2026',
    intro:
      'Cette politique explique quelles données Predict collecte, pourquoi, et comment tu peux garder le contrôle dessus — conformément au Règlement Général sur la Protection des Données (RGPD).',
    sections: [
      {
        heading: '1. Responsable du traitement',
        paragraphs: [
          `${publisherLine()}, dont les coordonnées figurent dans les Mentions légales, est responsable du traitement des données décrites ici.`,
        ],
      },
      {
        heading: '2. Données collectées',
        paragraphs: [
          'Compte : adresse email, pseudo, mot de passe (jamais stocké en clair — géré par le système d’authentification de Supabase).',
          'Profil : photo de profil (facultative), Prediscore et historique de tes prédictions révélées.',
          'Contenu : teasers, contenus de prédictions, commentaires, réactions emoji, et les relations d’amitié et d’appartenance à un groupe que tu établis.',
          'Préférences : réglages de notifications, portée par défaut de tes prédictions, réglages d’accessibilité — tous modifiables depuis Paramètres.',
          'Aucune donnée de géolocalisation, aucun tracker publicitaire, aucune donnée bancaire n’est collectée : Predict ne contient aucune fonctionnalité de paiement.',
        ],
      },
      {
        heading: '3. Finalités et base légale',
        paragraphs: [
          'Ces données sont traitées pour permettre le fonctionnement du service (créer un compte, sceller et partager des prédictions, notifier les événements pertinents), ce qui constitue l’exécution du contrat qui te lie à Predict lors de l’inscription.',
          'Les notifications non essentielles (rappels avant révélation, par exemple) reposent sur ton consentement, librement révocable à tout moment depuis Paramètres > Notifications ou Gestion du temps.',
        ],
      },
      {
        heading: '4. Destinataires des données',
        paragraphs: [
          'Tes données sont hébergées par Supabase (base de données et authentification), agissant en tant que sous-traitant. Aucune donnée n’est vendue, louée ou partagée à des fins publicitaires avec un tiers.',
          'Le contenu d’une prédiction n’est visible que par l’audience que tu as choisie (ton Cercle, une sélection d’amis, ou un groupe) — jamais publiquement, jamais par un tiers hors de cette audience.',
        ],
      },
      {
        heading: '5. Durée de conservation',
        paragraphs: [
          'Tes données sont conservées tant que ton compte existe. La suppression de ton compte (Paramètres > Sécurité) entraîne l’effacement immédiat et définitif de ton profil, de tes prédictions, commentaires et de toutes les données qui s’y rattachent.',
        ],
      },
      {
        heading: '6. Sécurité',
        paragraphs: [
          'L’accès aux données est protégé par des règles de sécurité au niveau de chaque ligne de la base (Row Level Security) : un utilisateur ne peut techniquement lire que les données que ces règles l’autorisent à voir. Les échanges entre l’application et le serveur sont chiffrés (HTTPS).',
        ],
      },
      {
        heading: '7. Tes droits',
        paragraphs: [
          'Conformément au RGPD, tu disposes d’un droit d’accès, de rectification, d’effacement, de portabilité et d’opposition sur tes données personnelles.',
          'Le pseudo, l’email, la photo de profil et les préférences se modifient directement depuis Paramètres > Compte. La suppression complète du compte (droit à l’effacement) se fait depuis Paramètres > Sécurité.',
          `Pour toute autre demande relative à tes droits, contacte ${PUBLISHER.contactEmail}. Tu disposes aussi du droit d’introduire une réclamation auprès de la CNIL (www.cnil.fr).`,
        ],
      },
      {
        heading: '8. Transferts hors Union européenne',
        paragraphs: [
          // Cette phrase énonçait auparavant ce que l'éditeur DEVAIT écrire
          // selon la région choisie : une note de rédaction, pas un texte
          // destiné à qui lit la politique. Elle dit maintenant le fait.
          `Tes données sont stockées dans l’Union européenne : la base est hébergée à Francfort (Allemagne), région ${PUBLISHER.dataRegion.split(' ')[0]}.`,
          'Supabase Inc. et Vercel Inc. étant des sociétés de droit américain, leurs équipes techniques peuvent accéder aux données depuis les États-Unis dans le cadre de l’exploitation du service. Ces accès sont encadrés par l’accord de traitement des données conclu avec chaque prestataire, qui intègre les clauses contractuelles types de la Commission européenne.',
        ],
      },
      {
        heading: '9. Cookies et traceurs',
        paragraphs: [
          'La version web de Predict utilise uniquement un jeton de session strictement nécessaire à la connexion — aucun cookie publicitaire ni traceur tiers.',
        ],
      },
      {
        heading: '10. Modification de cette politique',
        paragraphs: [
          'Cette politique peut être mise à jour ; la date en tête de page reflète la dernière version en vigueur.',
        ],
      },
    ],
  },
};
