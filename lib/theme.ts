// Charte graphique « Luxe & minimaliste » : fond ivoire, typographie
// quasi-noire épurée, accents dorés réservés aux éléments d'interaction. Un
// seul endroit à changer si la palette évolue — tous les écrans importent
// d'ici plutôt que de coder leurs propres couleurs.

export const colors = {
  background: '#FAF8F3',
  surface: '#FFFFFF',
  surfaceRaised: '#FFFFFF',
  border: '#E7E2D6',
  text: '#171512',
  textMuted: '#6E6A61',
  textFaint: '#A39D8E',
  gold: '#AD8A3E',
  goldBright: '#C7A458',
  goldSoft: 'rgba(173, 138, 62, 0.12)',
  danger: '#A23B36',
  dangerSoft: 'rgba(162, 59, 54, 0.10)',
  success: '#3C6E52',
  successSoft: 'rgba(60, 110, 82, 0.10)',
  // Réservées au sceau de cire (components/PredictionSeal.tsx).
  wax: '#7A2331',
  waxDark: '#5C1A25',
  // Barre de navigation : marron chaud ton sur ton avec le vitrail du logo,
  // contrastant volontairement avec le fond doré des écrans.
  navBar: '#4E2E1A',
  navBarBorder: '#3A2113',
  navBarActive: '#F0C766',
  navBarInactive: 'rgba(240, 223, 189, 0.5)',
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 18,
  // Coins très prononcés — cartes d'info, cartes de statistiques, la carte
  // « à sceller » des écrans profil/accueil. `lg` reste pour les éléments plus
  // petits (chips, champs).
  xl: 28,
  pill: 999,
} as const;

export const spacing = {
  xs: 6,
  sm: 10,
  md: 16,
  lg: 24,
  xl: 32,
} as const;

/**
 * Deux familles, façon logo : `display` (Cinzel, capitales monumentales)
 * pour la marque et les titres d'écran ; `serif`/`serifItalic` (Cormorant
 * Garamond) pour le texte courant qui demande du chic — le teaser et le
 * contenu d'une prédiction, les citations. Le reste de l'interface (labels,
 * boutons, champs) garde la police système, plus lisible en petite taille.
 * Chaque nom doit correspondre exactement à la clé passée à `useFonts` dans
 * `app/_layout.tsx`, faute de quoi React Native retombe silencieusement sur la
 * police système.
 */
export const fonts = {
  display: 'Cinzel_700Bold',
  serif: 'CormorantGaramond_500Medium',
  serifItalic: 'CormorantGaramond_500Medium_Italic',
  serifSemiBold: 'CormorantGaramond_600SemiBold',
} as const;

/**
 * Style partagé pour les petits libellés de section (« TEASER »,
 * « VOS SCELLÉS »...) : majuscules, tracking marqué, épuré. Référence visuelle
 * globale — tous les écrans l'utilisent au lieu de coder leur propre variante.
 * Un objet exporté plutôt qu'un composant : il se glisse tel quel dans un
 * tableau de `style`, sans imposer de structure JSX.
 */
export const eyebrow = {
  fontSize: 11,
  fontWeight: '700' as const,
  letterSpacing: 1.6,
  textTransform: 'uppercase' as const,
  color: colors.textFaint,
};
