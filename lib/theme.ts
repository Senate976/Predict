// Charte graphique « Neutre & sobre » : fond gris très clair, texte sombre à
// fort contraste, doré réservé aux accents (états actifs, CTA principal). Un
// seul endroit à changer si la palette évolue — tous les écrans importent
// d'ici plutôt que de coder leurs propres couleurs.

export const colors = {
  background: '#F8F9FA',
  surface: '#FFFFFF',
  surfaceRaised: '#FFFFFF',
  border: '#E5E7EB',
  text: '#1A1A1A',
  textMuted: '#6C757D',
  textFaint: '#9CA3AF',
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
  // Barre de navigation : neutre comme le reste de l'interface — seule
  // l'icône active porte l'accent doré de la marque.
  navBar: '#FFFFFF',
  navBarBorder: '#E5E7EB',
  navBarActive: '#AD8A3E',
  navBarInactive: '#6C757D',
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
 * Une seule famille sans-serif moderne (Inter) pour toute l'interface — les
 * quatre clés ne varient plus que par la graisse, pas par la police, pour
 * une hiérarchie cohérente sans effet « habillage » (titres en majuscules,
 * teaser en semi-gras — plus d'italique nulle part). Chaque nom doit
 * correspondre exactement à la clé passée à `useFonts` dans `app/_layout.tsx`,
 * faute de quoi React Native retombe silencieusement sur la police système.
 */
export const fonts = {
  display: 'Inter_700Bold',
  serif: 'Inter_400Regular',
  serifItalic: 'Inter_600SemiBold',
  serifSemiBold: 'Inter_600SemiBold',
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
