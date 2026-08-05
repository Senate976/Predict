// Charte graphique « Fun Social Network » : pop, ludique, vibrant. Fond crème
// très lumineux, cartes blanches à l'arrondi généreux et à l'ombre teintée,
// accent corail électrique partout où c'est interactif, touches néon
// (menthe, violet) pour les statuts et catégories. Un seul endroit à changer
// si la palette évolue — tous les écrans importent d'ici plutôt que de coder
// leurs propres couleurs.

export const colors = {
  background: '#FAFAF7',
  surface: '#FFFFFF',
  surfaceRaised: '#FFFFFF',
  border: '#EFECE6',
  // Noir adouci plutôt que pur, pour un rendu moins « chirurgical ».
  text: '#1E1E24',
  textMuted: '#6B6B76',
  textFaint: '#9CA3AF',
  // Accent principal : corail électrique (remplace l'ambre terne des rondes
  // précédentes), réservé aux éléments interactifs/actifs.
  gold: '#FF4D00',
  goldBright: '#FF6A2B',
  goldSoft: 'rgba(255, 77, 0, 0.14)',
  danger: '#A23B36',
  dangerSoft: 'rgba(162, 59, 54, 0.10)',
  success: '#3C6E52',
  successSoft: 'rgba(60, 110, 82, 0.10)',
  // Touches néon/pop pour les statuts et catégories.
  mint: '#10B981',
  mintSoft: 'rgba(16, 185, 129, 0.14)',
  violet: '#6366F1',
  violetSoft: 'rgba(99, 102, 241, 0.14)',
  // Pastille de notification (badge de la cloche) — rouge vif distinct du
  // corail (accent) et du rouge sourd `danger` (erreurs/suppressions).
  notificationBadge: '#FF3B30',
  // Fond/texte des badges d'état de carte (délai, réalisé, manqué) : pastels
  // saturés mais toujours un texte nettement plus foncé que le fond, pour
  // rester lisibles malgré le ton sur ton.
  badgeLockedBg: 'rgba(255, 77, 0, 0.14)',
  badgeLockedText: '#C2410C',
  badgeRealizedBg: '#D1FAE5',
  badgeRealizedText: '#047857',
  badgeMissedBg: '#FFE1DE',
  badgeMissedText: '#DC2626',
  // Réservées au sceau de cire (components/PredictionSeal.tsx).
  wax: '#7A2331',
  waxDark: '#5C1A25',
  // Barre de navigation : blanc pur, tranche sur le fond crème.
  navBar: '#FFFFFF',
  navBarBorder: '#EFECE6',
  navBarActive: '#FF4D00',
  navBarActiveSoft: 'rgba(255, 77, 0, 0.12)',
  navBarInactive: '#9CA3AF',
  // Bouton d'action flottant (FAB), unique et standardisé sur tout l'app.
  fab: '#FF4D00',
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 18,
  // Arrondi très généreux (façon `rounded-3xl`) — cartes de prédiction,
  // cartes d'info, la carte « à sceller » des écrans profil/accueil. `lg`
  // reste pour les éléments plus petits (chips, champs).
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
 * `display` (Syne, très lourde) pour les titres de page, boutons et onglets
 * — le ton « pop » de la marque, en casse normale (jamais en majuscules).
 * `serif`/`serifItalic`/`serifSemiBold` (Plus Jakarta Sans, ronde et
 * amicale) pour le corps de texte. Chaque nom doit correspondre exactement à
 * la clé passée à `useFonts` dans `app/_layout.tsx`, faute de quoi React
 * Native retombe silencieusement sur la police système.
 */
export const fonts = {
  display: 'Syne_800ExtraBold',
  serif: 'PlusJakartaSans_400Regular',
  serifItalic: 'PlusJakartaSans_600SemiBold',
  serifSemiBold: 'PlusJakartaSans_600SemiBold',
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
