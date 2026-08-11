// Charte graphique « Le pli » : chaque prédiction est une enveloppe scellée
// à la cire — fermée tant qu'elle est masquée, ouverte avec la lettre qui en
// sort une fois révélée. Une seule couleur d'accent (bordeaux) dans toute
// l'app : plus de vert/rouge/bleu par statut comme dans l'ancienne charte —
// les verdicts (réalisé/manqué) se distinguent par un tampon encré, pas par
// la couleur. Deux palettes (claire par défaut, sombre en option — voir
// Paramètres > Apparence, `lib/themeMode.tsx`) : la claire reprend
// exactement les tokens du design (parchemin/encre/bordeaux), la sombre en
// est une variante nocturne qui garde les mêmes rôles de tokens. Un seul
// endroit à changer si l'une des deux palettes évolue — tous les écrans
// importent `useColors()` plutôt que de coder leurs propres couleurs.

/** Forme commune aux deux palettes — paramètre de toute fonction de style qui
 * doit réagir au thème (voir `useColors()`, `lib/themeMode.tsx`). Un type
 * explicite plutôt que `typeof lightColors` : les dégradés (`[start, end]`)
 * doivent rester deux couleurs quelconques, jamais figés sur les valeurs
 * littérales de la palette claire. */
export type Colors = {
  background: string;
  backgroundGradient: readonly [string, string];
  surface: string;
  surfaceRaised: string;
  border: string;
  text: string;
  textMuted: string;
  textFaint: string;
  accent: string;
  accentBright: string;
  accentSoft: string;
  textOnAccent: string;
  accentTransition: string;
  danger: string;
  dangerSoft: string;
  notificationBadge: string;
  ink: string;
  avatarNeutral: string;
  icon: string;
  footerIconInactive: string;
  navBar: string;
  navBarActive: string;
  navBarInactive: string;
  fab: string;
  fabBorder: string;
  fabIcon: string;
  envelopeBody: readonly [string, string];
  envelopeFlap: readonly [string, string];
};

export const lightColors: Colors = {
  // Fond de page : parchemin clair (approximation plate du dégradé
  // `linear-gradient(160deg, #F1E8D3, #E6D6AC)` du design — la plupart des
  // écrans posent un aplat de fond, voir `backgroundGradient` ci-dessous pour
  // les quelques endroits qui peuvent se permettre un vrai dégradé).
  background: '#ECDFBE',
  backgroundGradient: ['#F1E8D3', '#E6D6AC'],
  // Papier — cartes, enveloppes, lettres (`linear-gradient(180deg, #FDFAF0,
  // #F5EDD8)` dans le design, ici l'aplat du milieu).
  surface: '#F5EDD8',
  // Papier plus clair — modales, panneaux flottants, tout ce qui doit
  // sembler « au-dessus » d'une carte.
  surfaceRaised: '#FDFAF0',
  border: 'rgba(36, 26, 18, 0.18)',
  // Encre.
  text: '#241A12',
  textMuted: '#5C4A38',
  textFaint: '#8A7256',
  // Accent unique — cire, tampon, CTA. Jamais un aplat de fond de carte ou
  // d'en-tête, seulement bordures/pastilles/boutons d'action ciblés.
  accent: '#8B2432',
  accentBright: '#701C28',
  accentSoft: 'rgba(139, 36, 50, 0.12)',
  // Texte/icônes posés sur un aplat d'accent plein (CTA, pastille) — crème,
  // jamais l'encre (illisible sur bordeaux).
  textOnAccent: '#F5EDD8',
  // Étape intermédiaire des dégradés parchemin → bordeaux (Prediscore) —
  // tan/cuir, pour une transition propre plutôt qu'une interpolation directe
  // qui traverserait un brun terne.
  accentTransition: '#B89A66',
  // Rouge fonctionnel, réservé aux erreurs et actions destructrices — pas une
  // couleur de marque, un signal d'alerte standard, teinté pour rester dans
  // le registre chaud de la charte plutôt qu'un rouge froid générique.
  danger: '#B3261E',
  dangerSoft: 'rgba(179, 38, 30, 0.1)',
  notificationBadge: '#8B2432',
  // Encre neutre du tampon « Manqué » — un vrai tampon encré, jamais le
  // bordeaux (réservé à « Encore raison ») : les deux verdicts se distinguent
  // par leur texte et cette teinte, jamais par un code couleur façon
  // sémaphore.
  ink: '#3A2E22',
  avatarNeutral: '#D9C295',
  icon: '#5C4A38',
  footerIconInactive: '#8A7256',
  navBar: '#F5EDD8',
  navBarActive: '#8B2432',
  navBarInactive: '#8A7256',
  fab: '#F5EDD8',
  fabBorder: '#8B2432',
  fabIcon: '#8B2432',
  // Corps et rabat de l'enveloppe (`PredictionCard`, `PredictionSeal`) —
  // dégradés tan/cuir, distincts du papier qu'ils encadrent.
  envelopeBody: ['#D9BE8C', '#B89A66'],
  envelopeFlap: ['#ECDCB2', '#D4B98A'],
};

/**
 * Palette sombre : mêmes rôles de tokens, fond encre profonde, papier assombri
 * façon parchemin sous chandelle — l'accent bordeaux s'éclaircit pour rester
 * lisible sur fond sombre (même logique que l'ancien jaune sombre/clair).
 */
export const darkColors: Colors = {
  background: '#171009',
  backgroundGradient: ['#1D150C', '#120D07'],
  surface: '#241A12',
  surfaceRaised: '#2E2117',
  border: 'rgba(245, 237, 216, 0.12)',
  text: '#F5EDD8',
  textMuted: '#C9B896',
  textFaint: '#8F7C5F',
  accent: '#C15866',
  accentBright: '#D97686',
  accentSoft: 'rgba(193, 88, 102, 0.18)',
  textOnAccent: '#241A12',
  accentTransition: '#8B6B3E',
  danger: '#E5675F',
  dangerSoft: 'rgba(229, 103, 95, 0.14)',
  notificationBadge: '#C15866',
  ink: '#D8CBB0',
  avatarNeutral: '#5C4A38',
  icon: '#C9B896',
  footerIconInactive: '#8F7C5F',
  navBar: '#171009',
  navBarActive: '#C15866',
  navBarInactive: '#8F7C5F',
  fab: '#2E2117',
  fabBorder: '#C15866',
  fabIcon: '#C15866',
  envelopeBody: ['#4A3826', '#332415'],
  envelopeFlap: ['#5C4830', '#3E2C1A'],
};

/** Dégradé de la cire — cachet et curseurs en forme de cachet (Prediscore) :
 * un objet physique, pas affecté par le thème actif, donc un seul jeu de
 * teintes pour les deux palettes. */
export const wax = ['#C15866', '#8B2432', '#5C121C', '#3E0A12'] as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 18,
  // Arrondi très généreux (façon `rounded-3xl`) — cartes d'info, la carte
  // « à sceller » des écrans profil/accueil, cadre du téléphone.
  xl: 28,
  pill: 999,
  // Enveloppes et lettres — un rectangle bien plus net que `xl`, pour
  // ressembler à du courrier plutôt qu'à une carte d'app générique.
  card: 8,
} as const;

export const spacing = {
  xs: 6,
  sm: 10,
  md: 16,
  lg: 24,
  xl: 32,
} as const;

/**
 * Deux familles : Spectral pour tout ce qui « s'écrit » (titres, corps de
 * prédiction, teaser) — jamais de l'UI ; Archivo pour l'interface (boutons,
 * labels, onglets, méta). `display`/`bodyEmphasis`/`serifItalic` sont
 * Spectral, `body`/`label`/`sansBold` sont Archivo. Chaque nom doit
 * correspondre exactement à la clé passée à `useFonts` dans
 * `app/_layout.tsx`, faute de quoi React Native retombe silencieusement sur
 * la police système.
 */
export const fonts = {
  // Titres d'écran, mot-symbole « Predict », gros corps de prédiction.
  display: 'Spectral_700Bold',
  bodyEmphasis: 'Spectral_600SemiBold',
  // Teaser et citations — l'italique est une vraie fonte italique chargée à
  // part, pas un `fontStyle: 'italic'` appliqué à la romaine.
  serifItalic: 'Spectral_400Regular_Italic',
  // Interface : titres de carte, boutons, onglets.
  sansBold: 'Archivo_700Bold',
  // Texte courant, police par défaut de `<Text>`/`<TextInput>`.
  body: 'Archivo_400Regular',
  // Métadonnées et étiquettes d'état — toujours petites, majuscules,
  // trackées, jamais le texte courant.
  label: 'Archivo_500Medium',
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
