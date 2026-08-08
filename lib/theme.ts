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
  // Étape intermédiaire des dégradés noir → jaune (Prediscore, jauge de
  // confiance) : une interpolation RVB directe entre #111827 et #FACC15
  // traverse un brun/kaki terne au milieu. Cet ambre chaud comme étape
  // du milieu donne une transition propre plutôt que ce ventre mou.
  goldTransition: '#B45309',
  // Rouge fonctionnel, réservé aux erreurs et actions destructrices — pas une
  // couleur de marque, un signal d'alerte standard.
  danger: '#B91C1C',
  dangerSoft: 'rgba(185, 28, 28, 0.08)',
  // Pastille de notification (badge de la cloche).
  notificationBadge: '#DC2626',
  // Verdict d'une prédiction révélée : couleur de texte du bandeau d'état de
  // la carte une fois le résultat connu. Verts/rouges volontairement
  // désaturés — assez pour se lire d'un coup d'œil, pas assez pour jurer avec
  // le jaune de la charte.
  verdictRealized: '#3F7D5C',
  verdictMissed: '#A6544D',
  // Fonds très légèrement teintés du même vert/rouge — le bandeau d'état
  // « Réalisé »/« Manqué » de la carte, jamais un aplat plein qui jurerait
  // avec le reste de la charte noir/blanc/jaune.
  verdictRealizedSoft: 'rgba(63, 125, 92, 0.12)',
  verdictMissedSoft: 'rgba(166, 84, 77, 0.12)',
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
 * Une seule famille pour tout le site — Inter, en 5 graisses — jamais de
 * serif ni de monospace : c'est la police, pas la graisse ou la taille, qui
 * doit rester identique partout pour un rendu fluide façon réseau social
 * (Facebook).
 *
 * `display` (Bold) : logo, mot-symbole « Predict », grands en-têtes de page.
 * `bodyEmphasis` (SemiBold) : gros texte éditorial mis en avant (corps de la
 * prédiction, pseudo de profil, pull-quotes, verdict) — jamais grisé, c'est
 * l'élément qu'on doit remarquer en premier. `sansBold` (Bold) : titres de
 * carte, boutons, onglets. `body` (Regular) : texte courant, police par
 * défaut de `<Text>`/`<TextInput>`. `label` (Medium) : métadonnées et
 * étiquettes d'état — toujours petites, majuscules, trackées, jamais le
 * texte courant. Chaque nom doit correspondre exactement à la clé passée à
 * `useFonts` dans `app/_layout.tsx`, faute de quoi React Native retombe
 * silencieusement sur la police système.
 */
export const fonts = {
  display: 'Inter_700Bold',
  bodyEmphasis: 'Inter_600SemiBold',
  sansBold: 'Inter_700Bold',
  body: 'Inter_400Regular',
  label: 'Inter_500Medium',
} as const;

/**
 * Style partagé pour les petites étiquettes de métadonnées (« TEASER »,
 * « VOS SCELLÉS »...) : Medium, majuscules, tracking très marqué, toujours
 * petit. Référence visuelle globale — tous les écrans l'utilisent au lieu de
 * coder leur propre variante. Un objet exporté plutôt qu'un composant : il se
 * glisse tel quel dans un tableau de `style`, sans imposer de structure JSX.
 */
export const eyebrow = {
  fontFamily: fonts.label,
  fontSize: 12,
  letterSpacing: 2,
  textTransform: 'uppercase' as const,
  color: colors.textFaint,
};
