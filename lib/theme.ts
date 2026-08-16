// Charte graphique « Predict » : fond clair #f9fcfe, fond sombre #1c2737,
// jaune #eca835, bleu clair #7ab8c2, bleu foncé #426170. Deux palettes
// (claire par défaut, sombre en option — voir Paramètres > Apparence,
// `lib/themeMode.tsx`), mêmes rôles de tokens dans les deux. Un seul endroit
// à changer si la palette évolue — tous les écrans importent `useColors()`
// plutôt que de coder leurs propres couleurs.

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
};

export const lightColors: Colors = {
  // Fond de page — couleur imposée par la charte.
  background: '#f9fcfe',
  backgroundGradient: ['#f9fcfe', '#f9fcfe'],
  // Cartes, enveloppes, lettres.
  surface: '#f9fcfe',
  // Modales, panneaux flottants, tout ce qui doit sembler « au-dessus » d'une carte.
  surfaceRaised: '#f9fcfe',
  border: 'rgba(66, 97, 112, 0.18)',
  // Encre — bleu foncé de la charte.
  text: '#426170',
  textMuted: 'rgba(66, 97, 112, 0.75)',
  textFaint: 'rgba(66, 97, 112, 0.55)',
  // Accent unique — jaune de la charte. Jamais un aplat de fond de carte ou
  // d'en-tête, seulement bordures/pastilles/boutons d'action ciblés.
  accent: '#eca835',
  accentBright: '#eca835',
  accentSoft: 'rgba(236, 168, 53, 0.12)',
  // Texte/icônes posés sur un aplat d'accent plein (CTA, pastille).
  textOnAccent: '#1c2737',
  // Étape intermédiaire des dégradés (Prediscore) — bleu clair de la charte.
  accentTransition: '#7ab8c2',
  // Rouge fonctionnel, réservé aux erreurs et actions destructrices — pas une
  // couleur de marque, un signal d'alerte standard.
  danger: '#B3261E',
  dangerSoft: 'rgba(179, 38, 30, 0.1)',
  notificationBadge: '#eca835',
  ink: '#426170',
  avatarNeutral: '#7ab8c2',
  icon: '#426170',
  footerIconInactive: 'rgba(66, 97, 112, 0.55)',
  navBar: '#f9fcfe',
  navBarActive: '#eca835',
  navBarInactive: 'rgba(66, 97, 112, 0.55)',
  fab: '#f9fcfe',
  fabBorder: '#eca835',
  fabIcon: '#eca835',
};

/**
 * Palette sombre : mêmes rôles de tokens — fond imposé par la charte.
 */
export const darkColors: Colors = {
  background: '#1c2737',
  backgroundGradient: ['#1c2737', '#1c2737'],
  surface: '#1c2737',
  surfaceRaised: '#1c2737',
  border: 'rgba(122, 184, 194, 0.18)',
  text: '#7ab8c2',
  textMuted: 'rgba(122, 184, 194, 0.75)',
  textFaint: 'rgba(122, 184, 194, 0.55)',
  accent: '#eca835',
  accentBright: '#eca835',
  accentSoft: 'rgba(236, 168, 53, 0.18)',
  textOnAccent: '#1c2737',
  accentTransition: '#426170',
  danger: '#E5675F',
  dangerSoft: 'rgba(229, 103, 95, 0.14)',
  notificationBadge: '#eca835',
  ink: '#7ab8c2',
  avatarNeutral: '#426170',
  icon: '#7ab8c2',
  footerIconInactive: 'rgba(122, 184, 194, 0.55)',
  navBar: '#1c2737',
  navBarActive: '#eca835',
  navBarInactive: 'rgba(122, 184, 194, 0.55)',
  fab: '#1c2737',
  fabBorder: '#eca835',
  fabIcon: '#eca835',
};

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
 * Deux familles, imposées par la charte : Roboto pour les titres, Roboto Mono
 * pour tout le reste. Seul `display` est Roboto — toutes les autres clés sont
 * Roboto Mono. Chaque nom doit correspondre exactement à la clé passée à
 * `useFonts` dans `app/_layout.tsx`, faute de quoi React Native retombe
 * silencieusement sur la police système.
 */
export const fonts = {
  // Titres d'écran, mot-symbole « Predict », gros corps de prédiction.
  display: 'Roboto_700Bold',
  bodyEmphasis: 'RobotoMono_600SemiBold',
  // Teaser et citations — l'italique est une vraie fonte italique chargée à
  // part, pas un `fontStyle: 'italic'` appliqué à la romaine.
  serifItalic: 'RobotoMono_400Regular_Italic',
  // Interface : titres de carte, boutons, onglets.
  sansBold: 'RobotoMono_700Bold',
  // Texte courant, police par défaut de `<Text>`/`<TextInput>`.
  body: 'RobotoMono_400Regular',
  // Métadonnées et étiquettes d'état — toujours petites, majuscules,
  // trackées, jamais le texte courant.
  label: 'RobotoMono_500Medium',
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
