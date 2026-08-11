// Charte graphique : deux palettes (sombre par défaut, claire en option — voir
// Paramètres > Apparence, `lib/themeMode.tsx`), mêmes tokens des deux côtés
// pour que chaque écran reste identique dans sa structure quel que soit le
// thème actif. Base blanc/noir/gris avec le jaune comme unique accent
// (bordures ciblées, pastilles d'état, boutons d'action), jamais un aplat de
// couleur vive en fond de carte ou d'en-tête. Un seul endroit à changer si
// l'une des deux palettes évolue — tous les écrans importent `useColors()`
// (`lib/themeMode.tsx`) plutôt que de coder leurs propres couleurs.

export const darkColors = {
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
  // Couleurs néon des boutons d'action « Réalisé »/« Manqué » (voir
  // `verdictPromptButton*`) et du contour de carte une fois Manqué affirmé
  // (`cardMissed`, avec en plus une lueur externe `shadow*`). `neonGreen` ne
  // sert plus qu'au bouton d'action — le contour de carte Réalisé est passé
  // au doré (`gold`), voir `cardRealized`.
  neonGreen: '#00E676',
  neonRed: '#FF1744',
  // Une Question n'est pas un troisième statut de Predict (Scellé/Réalisé/
  // Manqué) : c'est un objet différent, qui répond « j'ai posé/répondu à une
  // question » plutôt que « j'ai affirmé un secret ». D'où un accent dédié,
  // jamais partagé avec le jaune (CTA) ni le vert/rouge (verdict) — seule
  // couleur de carte permanente (pas de bascule neutre → néon comme
  // Scellé → Réalisé/Manqué, une Question se reconnaît d'un coup d'œil).
  questionAccent: '#38BDF8',
  // Contour de carte Scellé/En cours, et libellé assorti (texte + cadenas) —
  // voir `PredictionCard` : gris neutre mais assez clair pour rester bien
  // visible sur le fond anthracite, sans lueur colorée.
  cardBorderNeutral: '#9CA3AF',
  // Trait des icônes (Lucide) : gris clair plutôt que blanc pur, pour
  // qu'elles restent discrètes sans se fondre dans le fond sombre.
  icon: '#C9CDD3',
  // Icônes du pied de carte (commentaire, réaction) au repos — un ton plus
  // sourd que `icon`, pour un rendu fil d'actualité épuré ; `text` dès qu'il
  // y a au moins une interaction.
  footerIconInactive: '#6B7280',
  // Barre de navigation : même noir que le fond de page, tranche seulement
  // via sa bordure supérieure.
  navBar: '#090A0F',
  // Onglet actif en jaune (accent), inactif en gris neutre — l'accent ne sert
  // qu'à désigner l'état actif, jamais un fond.
  navBarActive: '#FACC15',
  navBarInactive: '#6B7280',
  // Bouton d'action flottant (FAB) : fond ardoise (`surfaceRaised`), bordure
  // et icône jaunes — plus un cercle jaune plein, une lueur discrète plutôt
  // qu'un aplat de couleur vive.
  fab: '#1C232D',
  fabBorder: '#FACC15',
  fabIcon: '#FACC15',
};

/**
 * Palette claire : mêmes rôles de tokens, fond blanc/gris très clair, texte
 * quasi-noir — le jaune reste le seul accent, juste assombri (`#CA8A04`
 * plutôt que `#FACC15`) pour rester lisible en texte/icône sur fond clair,
 * où le jaune vif de la palette sombre serait trop pâle. `textOnGold`
 * s'inverse en conséquence (blanc, posé sur un aplat doré désormais plus
 * soutenu). Rouge/vert fonctionnels resserrés de même, pour la même raison
 * de contraste sur blanc plutôt que sur fond quasi-noir.
 */
export const lightColors: typeof darkColors = {
  background: '#FFFFFF',
  surface: '#F5F5F6',
  surfaceRaised: '#EBEBEC',
  border: 'rgba(0, 0, 0, 0.08)',
  text: '#111114',
  textMuted: '#5B5F66',
  textFaint: '#8A8F98',
  gold: '#CA8A04',
  goldBright: '#A16207',
  goldSoft: 'rgba(202, 138, 4, 0.12)',
  textOnGold: '#FFFFFF',
  goldTransition: '#92400E',
  danger: '#DC2626',
  dangerSoft: 'rgba(220, 38, 38, 0.08)',
  notificationBadge: '#EF4444',
  neonGreen: '#16A34A',
  neonRed: '#DC2626',
  questionAccent: '#0284C7',
  cardBorderNeutral: '#6B7280',
  icon: '#4B5563',
  footerIconInactive: '#9CA3AF',
  navBar: '#FFFFFF',
  navBarActive: '#CA8A04',
  navBarInactive: '#9CA3AF',
  fab: '#F5F5F6',
  fabBorder: '#CA8A04',
  fabIcon: '#CA8A04',
} as const;

/** Forme commune aux deux palettes — paramètre de toute fonction de style
 * qui doit réagir au thème (voir `useColors()`, `lib/themeMode.tsx`). */
export type Colors = typeof darkColors;

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
 * Fonction plutôt qu'objet statique — dépend de `colors.textFaint`, donc du
 * thème actif — tous les écrans l'utilisent au lieu de coder leur propre
 * variante.
 */
export const eyebrow = (colors: Colors) => ({
  fontFamily: fonts.label,
  fontSize: 12,
  color: colors.textFaint,
});
