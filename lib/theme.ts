// Charte graphique « Dark Mode Moderne » : fond très sombre quasi-noir, cartes
// ardoise légèrement plus claires, texte quasi-blanc — le jaune reste l'unique
// accent (bordures ciblées, pastilles d'état, boutons d'action), jamais un
// aplat de couleur vive en fond de carte ou d'en-tête. Un seul endroit à
// changer si la palette évolue — tous les écrans importent d'ici plutôt que
// de coder leurs propres couleurs.

export const colors = {
  // Fond de page quasi-noir — les cartes (`surface`, plus clair) tranchent
  // dessus sans jamais atteindre un noir ou un blanc pur.
  background: '#090A0F',
  // Anthracite plutôt qu'ardoise bleutée : plus neutre, pour laisser les
  // contours néon (Sealed/Predict/Réalisé/Manqué) porter seuls la couleur.
  surface: '#12141A',
  // Légèrement plus clair que `surface` — modales, panneaux flottants,
  // tout ce qui doit sembler « au-dessus » d'une carte.
  surfaceRaised: '#1C232D',
  // Fine bordure blanche à très faible opacité — tranche juste assez sur le
  // fond sombre, jamais une ligne dure.
  border: 'rgba(255, 255, 255, 0.08)',
  text: '#F2F3F5',
  textMuted: '#A0A6B0',
  textFaint: '#6B7280',
  // Accent jaune — uniquement bordures/pastilles/boutons d'action ciblés,
  // jamais un aplat de fond de carte ou d'en-tête. Contraste élevé sur fond
  // sombre : contrairement au mode clair, il reste lisible en texte court.
  gold: '#FACC15',
  goldBright: '#EAB308',
  goldSoft: 'rgba(250, 204, 21, 0.16)',
  // Texte/icônes posés sur un aplat doré plein (CTA, pastille de coche) —
  // toujours une teinte sombre : `text` (quasi-blanc en mode sombre) y serait
  // illisible, l'accent jaune restant clair quel que soit le thème.
  textOnGold: '#171308',
  // Étape intermédiaire des dégradés sombre → jaune (Prediscore, jauge de
  // confiance) : une interpolation RVB directe entre `text` et `gold`
  // traverse un brun/kaki terne au milieu. Cet ambre chaud comme étape du
  // milieu donne une transition propre plutôt que ce ventre mou.
  goldTransition: '#B45309',
  // Rouge fonctionnel, réservé aux erreurs et actions destructrices — pas une
  // couleur de marque, un signal d'alerte standard. Éclairci pour rester
  // lisible sur fond sombre.
  danger: '#F87171',
  dangerSoft: 'rgba(248, 113, 113, 0.12)',
  // Pastille de notification (badge de la cloche).
  notificationBadge: '#EF4444',
  // Les couleurs néon des 4 états de carte (voir `PredictionCard`) : Scellé
  // et En cours partagent le jaune de la charte (`gold`) plutôt qu'un cyan ou
  // un ambre à part — seuls Réalisé (vert) et Manqué (rouge) tranchent en une
  // couleur différente, puisqu'ils portent le verdict. Contour fin partout ;
  // les deux verdicts portent en plus une lueur externe (`shadow*`).
  neonGreen: '#00E676',
  neonRed: '#FF1744',
  // Trait des icônes (Lucide) : gris clair plutôt que blanc pur, pour
  // qu'elles restent discrètes sans se fondre dans le fond sombre.
  icon: '#C9CDD3',
  // Icônes du pied de carte (commentaire, réaction) au repos — un ton plus
  // sourd que `icon`, pour un rendu fil d'actualité épuré ; `text` dès qu'il
  // y a au moins une interaction.
  footerIconInactive: '#6B7280',
  // Tampon « Raté » du Sceau d'Orgueil — zinc clair, sobre : l'échec s'efface
  // visuellement à côté du tampon doré de victoire.
  stampMissed: '#A1A1AA',
  // Barre de navigation : même noir que le fond de page, tranche seulement
  // via sa bordure supérieure.
  navBar: '#090A0F',
  // Onglet actif en jaune (accent), inactif en gris neutre — l'accent ne sert
  // qu'à désigner l'état actif, jamais un fond.
  navBarActive: '#FACC15',
  navBarActiveSoft: 'rgba(250, 204, 21, 0.35)',
  navBarInactive: '#6B7280',
  // Bouton d'action flottant (FAB) : fond ardoise (`surfaceRaised`), bordure
  // et icône jaunes — plus un cercle jaune plein, une lueur discrète plutôt
  // qu'un aplat de couleur vive.
  fab: '#1C232D',
  fabBorder: '#FACC15',
  fabIcon: '#FACC15',
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
 * Style partagé pour les petites étiquettes de métadonnées (« Destinataires »,
 * « Mes amis »...) : Medium, casse normale, sans tracking, toujours petit.
 * Référence visuelle globale — tous les écrans l'utilisent au lieu de coder
 * leur propre variante. Un objet exporté plutôt qu'un composant : il se
 * glisse tel quel dans un tableau de `style`, sans imposer de structure JSX.
 */
export const eyebrow = {
  fontFamily: fonts.label,
  fontSize: 12,
  color: colors.textFaint,
};
