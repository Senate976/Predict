// Nouvelle charte graphique (2026) : fond très clair (mode clair) ou bleu nuit
// profond (mode sombre), accent jaune unique, enveloppe en bleu clair semi-
// transparent, lettre couleur papier à bordure jaune. Trois couleurs de marque
// (jaune, bleu clair, bleu foncé) posées sur les deux fonds de référence —
// tout le reste de la palette (textes secondaires, bordures, rouge
// fonctionnel...) est dérivé de ces cinq couleurs pour rester cohérent. Un
// seul endroit à changer si la palette évolue — tous les écrans importent
// `useColors()` plutôt que de coder leurs propres couleurs.

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
  // Corps/rabat de l'enveloppe (`PredictionCard`) — un seul bleu clair,
  // posé en semi-transparence à deux niveaux d'opacité (rabat plus marqué
  // que le corps) plutôt qu'un dégradé : ces deux valeurs sont déjà des
  // `rgba()`, prêtes à être utilisées telles quelles comme `fill` SVG.
  envelopeBody: string;
  envelopeFlap: string;
  // Papier de la lettre révélée — crème, toujours le même sur les deux
  // fonds (comme un vrai papier, qui ne s'assombrit pas dans le noir).
  letterPaper: string;
};

export const lightColors: Colors = {
  background: '#F9FCFE',
  backgroundGradient: ['#F9FCFE', '#F9FCFE'],
  surface: '#FFFFFF',
  surfaceRaised: '#FFFFFF',
  border: 'rgba(66, 97, 112, 0.16)',
  // Bleu foncé de marque — texte, icônes, encre du tampon.
  text: '#426170',
  textMuted: '#5C7A8A',
  textFaint: '#8AA3AF',
  // Jaune de marque — accent unique, cachet, CTA. Jamais un aplat de fond de
  // carte ou d'en-tête, seulement bordures/pastilles/boutons d'action ciblés.
  accent: '#ECA835',
  accentBright: '#D4901E',
  accentSoft: 'rgba(236, 168, 53, 0.16)',
  // Texte/icônes posés sur un aplat d'accent plein (CTA, pastille) — encre
  // foncée, jamais un clair (illisible sur jaune).
  textOnAccent: '#2A3B47',
  // Étape intermédiaire des dégradés (Prediscore) — bleu clair de marque.
  accentTransition: '#7AB8C2',
  // Rouge fonctionnel, réservé aux erreurs et actions destructrices — pas une
  // couleur de marque, un signal d'alerte standard.
  danger: '#C0392B',
  dangerSoft: 'rgba(192, 57, 43, 0.1)',
  notificationBadge: '#C0392B',
  ink: '#426170',
  avatarNeutral: '#DCEEF0',
  icon: '#5C7A8A',
  footerIconInactive: '#8AA3AF',
  navBar: '#FFFFFF',
  navBarActive: '#ECA835',
  navBarInactive: '#8AA3AF',
  fab: '#ECA835',
  fabBorder: '#ECA835',
  fabIcon: '#2A3B47',
  // Bleu clair de marque (#7AB8C2) en semi-transparence — voir le commentaire
  // du type ci-dessus. Composée sur le fond de page, elle donne le bleu pâle
  // de la maquette sans avoir besoin d'une teinte séparée par thème : sur fond
  // sombre, la même transparence s'assombrit d'elle-même.
  envelopeBody: 'rgba(122, 184, 194, 0.30)',
  envelopeFlap: 'rgba(122, 184, 194, 0.37)',
  letterPaper: '#F5E6C9',
};

/**
 * Palette sombre : mêmes rôles de tokens, fond bleu nuit profond — les
 * couleurs de marque (jaune, bleus) restent identiques, seuls textes/
 * surfaces/bordures s'inversent pour rester lisibles.
 */
export const darkColors: Colors = {
  background: '#1C2737',
  backgroundGradient: ['#1C2737', '#1C2737'],
  surface: '#243248',
  surfaceRaised: '#2B3B54',
  border: 'rgba(220, 234, 240, 0.14)',
  text: '#DCEAF0',
  textMuted: '#93AAB6',
  textFaint: '#647F8C',
  accent: '#ECA835',
  accentBright: '#F2BB5C',
  accentSoft: 'rgba(236, 168, 53, 0.2)',
  textOnAccent: '#22303B',
  accentTransition: '#7AB8C2',
  danger: '#E5695C',
  dangerSoft: 'rgba(229, 105, 92, 0.16)',
  notificationBadge: '#E5695C',
  ink: '#DCEAF0',
  avatarNeutral: '#2E4257',
  icon: '#93AAB6',
  footerIconInactive: '#647F8C',
  navBar: '#1C2737',
  navBarActive: '#ECA835',
  navBarInactive: '#647F8C',
  fab: '#ECA835',
  fabBorder: '#ECA835',
  fabIcon: '#22303B',
  // Même rgba qu'en clair — voir le commentaire de `lightColors.envelopeBody`.
  envelopeBody: 'rgba(122, 184, 194, 0.30)',
  envelopeFlap: 'rgba(122, 184, 194, 0.37)',
  letterPaper: '#F5E6C9',
};

/** Dégradé de la cire du cachet — objet physique, pas affecté par le thème
 * actif, donc un seul jeu de teintes pour les deux palettes. Jaune de marque,
 * du plus clair (reflet) au plus sombre (ombre portée). */
export const wax = ['#F2C169', '#ECA835', '#C6841B', '#8F5E10'] as const;

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
 * Deux familles : Roboto pour les titres (écrans, mot-symbole « Predict »),
 * Roboto Mono pour tout le reste (corps de prédiction, boutons, labels,
 * onglets, méta) — charte 2026. Chaque nom doit correspondre exactement à la
 * clé passée à `useFonts` dans `app/_layout.tsx`, faute de quoi React Native
 * retombe silencieusement sur la police système.
 */
export const fonts = {
  // Titres d'écran, mot-symbole « Predict ».
  display: 'Roboto_700Bold',
  // Le reste : Roboto Mono, à différents poids selon le rôle.
  bodyEmphasis: 'RobotoMono_700Bold',
  serifItalic: 'RobotoMono_400Regular_Italic',
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
