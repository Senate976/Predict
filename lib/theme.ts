// Charte graphique « Predict » (2026) : chaque prédiction est une enveloppe
// bleu clair — fermée avec un badge doré (« P ») tant qu'elle est masquée,
// ouverte avec la lettre crème qui en sort une fois révélée. Un badge doré
// à « ? » remplace le « P » pour les Predicts en mode Sondage. Palette et
// polices imposées par la charte : fond clair #f9fcfe, fond sombre #1c2737,
// jaune #eca835, bleu clair #7ab8c2, bleu foncé #426170 — Roboto pour les
// titres, Roboto Mono pour tout le reste. Un seul endroit à changer si la
// palette évolue — tous les écrans importent `useColors()` plutôt que de
// coder leurs propres couleurs.

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
  /** Lavis très clair du bleu de marque derrière la lettre révélée — l'écho du
   * corps d'enveloppe qui reste visible tout autour, une fois la lettre sortie. */
  envelopeFaint: string;
  /** Papier de la lettre qui sort de l'enveloppe (`predict révélée`) — crème,
   * volontairement chaud, distinct du `surface` bleu-blanc froid du reste de
   * l'app : c'est la seule pièce qui garde ce ton, comme sur la maquette. */
  letterPaper: string;
  /** Liseré de la lettre révélée — jaune de marque éclairci. */
  letterBorder: string;
};

export const lightColors: Colors = {
  background: '#f9fcfe',
  backgroundGradient: ['#f9fcfe', '#eef6f9'],
  // Papier — cartes, modales : blanc, sur le fond bleu-blanc très clair.
  surface: '#ffffff',
  surfaceRaised: '#ffffff',
  border: 'rgba(66, 97, 112, 0.16)',
  // Encre — les deux bleus foncés de la charte, en deux paliers de contraste
  // plutôt que d'inventer de nouvelles teintes : `text` reprend le fond sombre
  // (#1c2737, le plus contrasté), `textMuted`/`textFaint` s'appuient sur le
  // bleu foncé de marque (#426170).
  text: '#1c2737',
  textMuted: 'rgba(66, 97, 112, 0.82)',
  textFaint: 'rgba(66, 97, 112, 0.6)',
  // Accent unique — badge, CTA, tampon. Jamais un aplat de fond de carte ou
  // d'en-tête, seulement badges/bordures/boutons d'action ciblés.
  accent: '#eca835',
  accentBright: '#f3be5e',
  accentSoft: 'rgba(236, 168, 53, 0.16)',
  // Texte/icônes posés sur un aplat d'accent plein (CTA, badge) — le bleu le
  // plus sombre de la charte, jamais du blanc (contraste insuffisant sur le jaune).
  textOnAccent: '#1c2737',
  // Étape intermédiaire des dégradés fond → jaune (Prediscore) — bleu clair de
  // marque, pour une transition propre plutôt qu'une interpolation directe.
  accentTransition: '#7ab8c2',
  danger: '#c23b32',
  dangerSoft: 'rgba(194, 59, 50, 0.1)',
  notificationBadge: '#eca835',
  // Bleu foncé de marque — texte/icônes neutres (tampon « Manqué », etc.),
  // jamais le jaune (réservé à « Encore raison »).
  ink: '#426170',
  avatarNeutral: '#cfe6ea',
  icon: '#426170',
  footerIconInactive: 'rgba(66, 97, 112, 0.55)',
  navBar: '#ffffff',
  navBarActive: '#eca835',
  navBarInactive: 'rgba(66, 97, 112, 0.55)',
  fab: '#ffffff',
  fabBorder: '#eca835',
  fabIcon: '#eca835',
  // Corps et rabat de l'enveloppe (`PredictionCard`, `PredictionSeal`) — lavis
  // du bleu clair de marque à deux paliers d'opacité, posés sur le papier
  // clair : le rabat un peu plus soutenu que le corps, comme sur la maquette.
  envelopeBody: ['rgba(122, 184, 194, 0.3)', 'rgba(122, 184, 194, 0.3)'],
  envelopeFlap: ['rgba(122, 184, 194, 0.37)', 'rgba(122, 184, 194, 0.37)'],
  envelopeFaint: 'rgba(122, 184, 194, 0.2)',
  letterPaper: '#f5e6c9',
  letterBorder: '#f1c77e',
};

/**
 * Palette sombre : mêmes rôles de tokens, fond #1c2737 (imposé par la charte),
 * papier légèrement éclairci pour rester distinct du fond, encre en tons
 * clairs (fond clair de la charte, puis bleu clair de marque) — même logique
 * de paliers que la palette claire, inversée.
 */
export const darkColors: Colors = {
  background: '#1c2737',
  backgroundGradient: ['#1c2737', '#16202d'],
  surface: '#243347',
  surfaceRaised: '#2b3c52',
  border: 'rgba(249, 252, 254, 0.14)',
  text: '#f9fcfe',
  textMuted: 'rgba(122, 184, 194, 0.92)',
  textFaint: 'rgba(122, 184, 194, 0.65)',
  accent: '#eca835',
  accentBright: '#f3be5e',
  accentSoft: 'rgba(236, 168, 53, 0.22)',
  textOnAccent: '#1c2737',
  accentTransition: '#426170',
  danger: '#e5675f',
  dangerSoft: 'rgba(229, 103, 95, 0.16)',
  notificationBadge: '#eca835',
  ink: '#7ab8c2',
  avatarNeutral: '#2b3c52',
  icon: '#7ab8c2',
  footerIconInactive: 'rgba(122, 184, 194, 0.55)',
  navBar: '#1c2737',
  navBarActive: '#eca835',
  navBarInactive: 'rgba(122, 184, 194, 0.55)',
  fab: '#2b3c52',
  fabBorder: '#eca835',
  fabIcon: '#eca835',
  envelopeBody: ['rgba(122, 184, 194, 0.22)', 'rgba(122, 184, 194, 0.22)'],
  envelopeFlap: ['rgba(122, 184, 194, 0.3)', 'rgba(122, 184, 194, 0.3)'],
  envelopeFaint: 'rgba(122, 184, 194, 0.14)',
  letterPaper: '#3a3220',
  letterBorder: '#c9922f',
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
 * Deux familles, imposées par la charte : Roboto pour tout ce qui est un
 * titre (écrans, mot-symbole « Predict », emblème du badge) ; Roboto Mono
 * pour tout le reste de l'interface (corps de texte, boutons, labels,
 * onglets, méta). Seul `display` est Roboto — toutes les autres clés sont
 * Roboto Mono. Chaque nom doit correspondre exactement à la clé passée à
 * `useFonts` dans `app/_layout.tsx`, faute de quoi React Native retombe
 * silencieusement sur la police système.
 */
export const fonts = {
  // Titres d'écran, mot-symbole « Predict », emblème du badge (P / ?).
  display: 'Roboto_700Bold',
  // Corps de prédiction mis en avant, pseudo d'auteur.
  bodyEmphasis: 'RobotoMono_700Bold',
  // Teaser et citations — italique Roboto Mono chargée à part, jamais un
  // `fontStyle: 'italic'` appliqué à la romaine.
  monoItalic: 'RobotoMono_400Regular_Italic',
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
