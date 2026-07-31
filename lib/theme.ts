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
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 18,
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
 * `serif` habille les éléments principaux (marque, titres d'écran, le texte
 * même des prédictions) pour le côté chic ; le reste de l'interface (labels,
 * boutons, champs) garde la police système, plus lisible en petite taille.
 * Le nom doit correspondre exactement à la clé passée à `useFonts` dans
 * `app/_layout.tsx`, faute de quoi React Native retombe silencieusement sur la
 * police système.
 */
export const fonts = {
  serif: 'InstrumentSerif_400Regular',
  serifItalic: 'InstrumentSerif_400Regular_Italic',
} as const;
