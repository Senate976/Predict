// Charte graphique « Éditorial Chic & Premium » : presse/magazine moderne,
// strictement blanc / noir / jaune. Le blanc domine (fonds, cartes), le noir
// porte tout le texte et les bordures fines, le jaune est réservé aux
// éléments interactifs majeurs (FAB, onglet actif, badges d'état, jauges) —
// jamais comme couleur de texte courant, son contraste sur blanc est trop
// faible. Un seul endroit à changer si la palette évolue — tous les écrans
// importent d'ici plutôt que de coder leurs propres couleurs.

export const colors = {
  // Blanc cassé très sobre, aspect papier — jamais un blanc pur en fond de
  // page, pour que les cartes (blanc pur) tranchent légèrement dessus.
  background: '#FBFBF9',
  surface: '#FFFFFF',
  surfaceRaised: '#FFFFFF',
  // Fine bordure « encre » plutôt qu'un gris neutre — cohérent avec le noir
  // profond du texte.
  border: 'rgba(17, 24, 39, 0.10)',
  text: '#111827',
  textMuted: '#6B7280',
  textFaint: '#9CA3AF',
  // Accent jaune — uniquement fonds/bordures d'éléments interactifs majeurs
  // (jamais en couleur de texte : illisible sur blanc).
  gold: '#FACC15',
  goldBright: '#EAB308',
  goldSoft: 'rgba(250, 204, 21, 0.20)',
  // Rouge fonctionnel, réservé aux erreurs et actions destructrices — pas une
  // couleur de marque, un signal d'alerte standard.
  danger: '#B91C1C',
  dangerSoft: 'rgba(185, 28, 28, 0.08)',
  // Pastille de notification (badge de la cloche).
  notificationBadge: '#DC2626',
  // Badges d'état de carte (délai, réalisé, manqué) : un seul traitement,
  // volontairement sans distinction de couleur entre eux — fond jaune pâle,
  // texte ambre foncé, comme demandé pour rester lisible et élégant.
  badgeBg: '#FEF08A',
  badgeText: '#854D0E',
  // Trait des icônes (Lucide) : noir adouci plutôt que gris clair, pour
  // qu'elles ressortent sans être aussi dures qu'un noir pur.
  icon: '#374151',
  // Barre de navigation : blanc pur, tranche sur le fond papier.
  navBar: '#FFFFFF',
  navBarBorder: 'rgba(17, 24, 39, 0.10)',
  navBarActive: '#111827',
  navBarActiveSoft: 'rgba(250, 204, 21, 0.35)',
  navBarInactive: '#9CA3AF',
  // Bouton d'action flottant (FAB), unique et standardisé sur tout l'app :
  // cercle jaune, icône noire.
  fab: '#FACC15',
  fabIcon: '#111827',
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
 * `display` (Playfair Display, serif) : réservée au titre principal du Fil,
 * au mot-symbole « Predict » et aux grands en-têtes de page — jamais aux
 * boutons, onglets ou titres de carte. `serifItalic` (Playfair Display
 * italique) : gros texte éditorial (teaser/contenu à l'ouverture d'un
 * Predict, pull-quotes, verdict). `serif`/`serifSemiBold` (Plus Jakarta
 * Sans) : corps de texte courant. `sansBold` (Plus Jakarta Sans gras) :
 * titres de carte, boutons, onglets — tout ce qui doit rester très lisible.
 * Chaque nom doit correspondre exactement à la clé passée à `useFonts` dans
 * `app/_layout.tsx`, faute de quoi React Native retombe silencieusement sur
 * la police système.
 */
export const fonts = {
  display: 'PlayfairDisplay_700Bold',
  serifItalic: 'PlayfairDisplay_600SemiBold_Italic',
  serif: 'PlusJakartaSans_400Regular',
  serifSemiBold: 'PlusJakartaSans_600SemiBold',
  sansBold: 'PlusJakartaSans_700Bold',
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
