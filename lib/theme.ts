// Charte graphique « Chaleureuse & premium » : fond crème doux, cartes
// blanches qui tranchent dessus, accent ambre chaud pour tout ce qui est
// interactif ou actif. Un seul endroit à changer si la palette évolue — tous
// les écrans importent d'ici plutôt que de coder leurs propres couleurs.

export const colors = {
  background: '#FAF7F2',
  surface: '#FFFFFF',
  surfaceRaised: '#FFFFFF',
  border: '#EFECE6',
  // Noir adouci plutôt que pur, pour un rendu moins « chirurgical ».
  text: '#1E1E24',
  textMuted: '#6B6B76',
  textFaint: '#9CA3AF',
  gold: '#D97706',
  goldBright: '#F59E0B',
  goldSoft: 'rgba(217, 119, 6, 0.14)',
  danger: '#A23B36',
  dangerSoft: 'rgba(162, 59, 54, 0.10)',
  success: '#3C6E52',
  successSoft: 'rgba(60, 110, 82, 0.10)',
  // Pastille de notification (badge de la cloche) — corail vif, distinct du
  // rouge sourd `danger` réservé aux erreurs/suppressions.
  notificationBadge: '#FF6B6B',
  // Fond/texte des badges d'état de carte (délai, réalisé, manqué) : pastels
  // saturés mais toujours un texte nettement plus foncé que le fond, pour
  // rester lisibles malgré le ton sur ton.
  badgeLockedBg: 'rgba(217, 119, 6, 0.16)',
  badgeLockedText: '#92400E',
  badgeRealizedBg: '#D1FAE5',
  badgeRealizedText: '#047857',
  badgeMissedBg: '#FFE4DE',
  badgeMissedText: '#C2410C',
  // Réservées au sceau de cire (components/PredictionSeal.tsx).
  wax: '#7A2331',
  waxDark: '#5C1A25',
  // Barre de navigation : blanc pur, tranche sur le fond crème.
  navBar: '#FFFFFF',
  navBarBorder: '#EFECE6',
  navBarActive: '#D97706',
  navBarActiveSoft: 'rgba(217, 119, 6, 0.12)',
  navBarInactive: '#9CA3AF',
  // Bouton d'action flottant (FAB), unique et standardisé sur tout l'app.
  fab: '#D97706',
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
 * `display` (Plus Jakarta Sans, plus ronde et humaine) pour les titres de
 * page — en casse normale, jamais en majuscules, pour un ton chaleureux
 * plutôt qu'institutionnel. `serif`/`serifItalic`/`serifSemiBold` (Inter)
 * pour tout le reste de l'interface. Chaque nom doit correspondre exactement
 * à la clé passée à `useFonts` dans `app/_layout.tsx`, faute de quoi React
 * Native retombe silencieusement sur la police système.
 */
export const fonts = {
  display: 'PlusJakartaSans_700Bold',
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
