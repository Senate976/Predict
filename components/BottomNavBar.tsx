import { useFocusEffect, usePathname, useRouter } from 'expo-router';
import { Bell, CircleUserRound, Plus, Users } from 'lucide-react-native';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, useWindowDimensions, View, type ColorValue } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { useAuth } from '../lib/auth';
import { fetchUnreadNotificationCount, onUnreadChanged } from '../lib/notifications';
import { fonts } from '../lib/theme';
import { useColors } from '../lib/themeMode';
import { Text } from './Text';

/**
 * La barre de navigation du bas, en un seul endroit.
 *
 * Deux consommateurs, un seul dessin : `app/(app)/(tabs)/_layout.tsx` en
 * réutilise les morceaux pour habiller le vrai navigateur à onglets, et
 * `BottomNavBar` (tout en bas de ce fichier) la reconstitue à l'identique
 * pour les écrans empilés par-dessus — détail d'une prédiction, profil d'un
 * ami — qui vivent hors du navigateur à onglets et n'auraient sinon aucune
 * barre. Tout ce qui touche à la géométrie est donc défini ici et nulle part
 * ailleurs : les deux versions ne peuvent pas diverger.
 */

/** Taille et épaisseur communes aux quatre onglets — une seule source, pour
 * qu'aucune icône ne détonne dans la rangée. */
export const ICON_SIZE = 24;
export const STROKE = 1.75;

/** Monogramme « P » du Fil, à la place d'une icône générique — c'est
 * l'onglet qui mène au cœur de l'app (les Predicts), pas juste un favori. */
export function PTabIcon({ color, size }: { color: ColorValue; size: number }) {
  return <Text style={{ fontFamily: fonts.display, fontSize: size, lineHeight: size, color }}>P</Text>;
}

/** Enveloppe commune : boîte de taille fixe (alignement) + point jaune sous
 * l'onglet actif. */
export function TabIcon({ focused, children }: { focused: boolean; children: React.ReactNode }) {
  const colors = useColors();
  return (
    <View style={{ alignItems: 'center' }}>
      <View style={styles.iconBox}>{children}</View>
      <View style={[styles.dot, focused && { backgroundColor: colors.accent }]} />
    </View>
  );
}

/** Fréquence de rafraîchissement du badge — juste assez pour rester à jour
 * sans matraquer la base pendant que l'app reste ouverte. */
const UNREAD_POLL_MS = 20_000;

/** Nombre de notifications non lues, rafraîchi tant que l'écran est monté. */
export function useUnreadCount(): number {
  const { session } = useAuth();
  const userId = session?.user.id;
  const [unreadCount, setUnreadCount] = useState(0);

  const refresh = useCallback(async () => {
    if (!userId) return;
    const { count } = await fetchUnreadNotificationCount(userId);
    setUnreadCount(count);
  }, [userId]);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, UNREAD_POLL_MS);
    const unsubscribe = onUnreadChanged(refresh);
    return () => {
      clearInterval(interval);
      unsubscribe();
    };
  }, [refresh]);

  /* Et à chaque retour sur l'écran, sans attendre le prochain tour de
     sondage. L'écran des notifications les marque toutes comme lues dès
     qu'on l'ouvre : sans ce rafraîchissement, la pastille resterait allumée
     jusqu'à vingt secondes après qu'on a tout lu — exactement le compteur
     faux qu'on cherche à faire disparaître. */
  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh])
  );

  return unreadCount;
}

/** Rayon et décalage vertical du bouton central (`centerButton` plus bas) —
 * la découpe de `TabBarNotchBorder` s'appuie sur ces mêmes valeurs plutôt
 * que sur des chiffres redevinés à l'œil, pour rester cohérente si l'un des
 * deux change. */
const CENTER_BUTTON_RADIUS = 26;
const CENTER_BUTTON_RISE = 18;
/** `paddingTop` de `styles.bar` : le bouton (comme les icônes) vit dans le
 * contenu de la barre, décalé de cette marge par rapport à son bord
 * supérieur — sans elle, le centre du bouton calculé ici tombait 10px plus
 * haut que sa vraie position, rapprochant la découpe bien plus près du
 * bouton réel que prévu. */
const BAR_PADDING_TOP = 10;
/** Hauteur de la barre elle-même, hors zone sûre du bas. */
const BAR_HEIGHT = 64;
/** Centre du bouton, en Y, relatif au bord supérieur de la barre (Y=0) —
 * le bouton étant décalé de `CENTER_BUTTON_RISE` vers le haut depuis le
 * bord du contenu (déjà `BAR_PADDING_TOP` sous le bord de la barre), son
 * centre tombe `CENTER_BUTTON_RISE` sous son propre rayon, plus ce padding. */
const BUTTON_CENTER_Y = BAR_PADDING_TOP + CENTER_BUTTON_RADIUS - CENTER_BUTTON_RISE;
/** Demi-largeur, en X, où la ligne droite quitte l'horizontale pour amorcer
 * la cuvette (symétrique de part et d'autre du centre) — voir
 * `buildCradlePath`. Grande par rapport aux décalages de contrôle
 * ci-dessous (rapport ~0.43 / ~0.57, plutôt que ~0.25 / ~0.85 dans une
 * version antérieure) : la courbe s'incurve dès qu'elle quitte la ligne
 * droite au lieu de rester quasi plate puis plonger d'un coup près du
 * bouton — c'est ce rapport, pas seulement la largeur, qui donne une
 * descente perçue comme progressive. */
const NOTCH_HALF_WIDTH = 70;
/** Profondeur de la cuvette (Y du point le plus bas, sous le bouton). Avec
 * ces décalages de contrôle, le point le plus proche du bouton sur toute la
 * courbe est exactement son sommet (X = centre du bouton) — vérifié par
 * échantillonnage dense (script Node, hors dépôt) — donc la marge s'y
 * résume à `NOTCH_DEPTH - BUTTON_CENTER_Y - CENTER_BUTTON_RADIUS` : ≈8px
 * ici, jamais un contact. */
const NOTCH_DEPTH = 52;
/** Décalage horizontal du premier point de contrôle de chaque Bézier —
 * partage la même ordonnée que son point de départ (la ligne droite ou le
 * fond de la cuvette), ce qui rend la tangente horizontale à cet endroit
 * par construction géométrique (pas une approximation) : aucun angle vif
 * possible à la jonction, contrairement à un arc de cercle qui croiserait
 * la droite en sécante. */
const NOTCH_CONTROL_1 = 30;
/** Même principe pour le second point de contrôle de chaque Bézier, qui
 * partage l'ordonnée de son point d'arrivée. */
const NOTCH_CONTROL_2 = 40;
/** Épaisseur du trait. Le tracé est décalé de la moitié de cette valeur vers
 * le bas (`NOTCH_INSET`) : à Y=0, un trait centré sur la ligne déborderait de
 * moitié hors du SVG et s'y ferait rogner — les segments droits rendaient donc
 * deux fois plus fins que la courbe, qui, elle, est bien à l'intérieur. Le
 * conteneur remonte d'autant pour que la ligne retombe au même pixel. */
const NOTCH_STROKE = 1.5;
const NOTCH_INSET = NOTCH_STROKE / 2;

// `BUTTON_CENTER_Y` ne sert qu'au raisonnement documenté ci-dessus sur la
// marge entre la courbe et le bouton ; on le référence ici pour qu'il reste
// vérifiable plutôt que d'être signalé comme inutilisé.
export const NOTCH_CLEARANCE = NOTCH_DEPTH - BUTTON_CENTER_Y - CENTER_BUTTON_RADIUS;

/**
 * Tracé du contour de la découpe, en coordonnées absolues (0..width en X) :
 * un unique chemin SVG — ligne droite, une seule courbe de Bézier cubique
 * qui plonge vers le fond de la cuvette, sa symétrique qui remonte, ligne
 * droite — jamais plusieurs arcs ou éléments assemblés. Les deux courbes se
 * rejoignent au point le plus bas avec une tangente horizontale commune
 * (chacune y arrive à plat, par construction), donc sans angle au raccord ;
 * même chose à leurs deux extrémités contre les lignes droites. Ce tracé
 * sert uniquement de trait de bordure (voir `TabBarNotchBorder`) : la barre
 * elle-même reste un rectangle plein classique
 * (`styles.bar.backgroundColor`), jamais découpé.
 */
function buildCradlePath(cx: number, width: number): string {
  const H = NOTCH_HALF_WIDTH;
  const D = NOTCH_DEPTH;
  const a = NOTCH_CONTROL_1;
  const b = NOTCH_CONTROL_2;

  const left = cx - H;
  const right = cx + H;

  const y = NOTCH_INSET;
  const d = D + NOTCH_INSET;

  return [
    `M 0 ${y}`,
    `L ${left.toFixed(2)} ${y}`,
    `C ${(left + a).toFixed(2)} ${y}, ${(cx - b).toFixed(2)} ${d}, ${cx.toFixed(2)} ${d}`,
    `C ${(cx + b).toFixed(2)} ${d}, ${(right - a).toFixed(2)} ${y}, ${right.toFixed(2)} ${y}`,
    `L ${width} ${y}`,
  ].join(' ');
}

/**
 * Trait du haut de la barre de navigation, en SVG plutôt qu'une simple
 * bordure CSS : une ligne droite aurait coupé tout droit à travers le
 * bouton central « + », qui déborde déjà au-dessus de la barre. Un seul
 * `Path`, en trait seul (`fill="none"`) — jamais de remplissage : le fond
 * sous la courbe est celui, uni, de `styles.bar`/`colors.navBar`, pas celui
 * de ce SVG. Couleur du trait alignée sur celle des icônes inactives de la
 * barre (`colors.navBarInactive`) : le trait et les icônes qu'il surplombe
 * forment un même ensemble, un ton plus soutenu le détacherait d'elles.
 */
export function TabBarNotchBorder() {
  const { width } = useWindowDimensions();
  const colors = useColors();
  const cx = width / 2;
  const d = buildCradlePath(cx, width);

  return (
    <Svg
      width={width}
      height={NOTCH_DEPTH + NOTCH_STROKE + 4}
      style={[styles.notchBorder, { marginTop: -NOTCH_INSET }]}
      pointerEvents="none"
    >
      <Path d={d} stroke={colors.navBarInactive} strokeWidth={NOTCH_STROKE} fill="none" />
    </Svg>
  );
}

/**
 * Bouton de création, centré parmi les icônes plutôt qu'en survol flottant
 * de tout l'écran : surélevé au-dessus de la barre, façon médaillon —
 * bordure et icône dorées sur fond ardoise, comme l'ancien FAB, mais posé
 * au milieu de la navigation plutôt que dans un coin de chaque page.
 * Ignore délibérément `props.onPress` (celui de React Navigation, qui
 * activerait l'onglet factice `create` — voir `create.tsx`) et navigue
 * directement vers l'écran de création à la place.
 */
export function CreateTabButton() {
  const router = useRouter();
  const colors = useColors();
  return (
    <View style={styles.centerButtonSlot} pointerEvents="box-none">
      <Pressable
        onPress={() => router.push('/new-prediction')}
        style={({ pressed }) => [
          styles.centerButton,
          {
            backgroundColor: colors.fab,
            borderColor: colors.fabBorder,
            shadowColor: colors.accent,
          },
          pressed && styles.centerButtonPressed,
        ]}
        hitSlop={6}
      >
        <Plus size={26} color={colors.fabIcon} strokeWidth={2.5} />
      </Pressable>
    </View>
  );
}

/** Les quatre onglets, dans l'ordre où ils s'affichent (le bouton central
 * s'insère entre le deuxième et le troisième). */
const TABS = [
  { route: '/', match: '/', icon: 'P' as const, label: 'Fil' },
  { route: '/notifications', match: '/notifications', icon: 'bell' as const, label: 'Notifications' },
  { route: '/circle', match: '/circle', icon: 'users' as const, label: 'Cercle' },
  { route: '/profile', match: '/profile', icon: 'user' as const, label: 'Profil' },
];

/**
 * La barre du bas pour les écrans qui ne sont PAS des onglets — détail d'une
 * prédiction, profil d'un ami. Ils s'empilent par-dessus le navigateur à
 * onglets, qui n'affiche donc plus sa barre : sans ce composant, on se
 * retrouvait sur ces pages avec la navigation coupée (et pour seul recours un
 * bouton « + » flottant).
 *
 * `replace` plutôt que `push` : revenir à un onglet n'empile pas une page de
 * plus, il ramène là d'où l'on vient — sinon le bouton Retour du téléphone
 * remonterait une pile qui s'allonge à chaque aller-retour.
 */
export function BottomNavBar() {
  const router = useRouter();
  const colors = useColors();
  const pathname = usePathname();
  const unreadCount = useUnreadCount();

  // L'ordre exact de la rangée : deux onglets, le bouton de création, deux
  // onglets. Une seule liste, donc un seul endroit où se tromper.
  const slots: ((typeof TABS)[number] | 'create')[] = [
    TABS[0],
    TABS[1],
    'create',
    TABS[2],
    TABS[3],
  ];

  function iconFor(tab: (typeof TABS)[number], color: string) {
    if (tab.icon === 'P') return <PTabIcon size={ICON_SIZE} color={color} />;
    if (tab.icon === 'bell') return <Bell size={ICON_SIZE} color={color} strokeWidth={STROKE} />;
    if (tab.icon === 'users') return <Users size={ICON_SIZE} color={color} strokeWidth={STROKE} />;
    return <CircleUserRound size={ICON_SIZE} color={color} strokeWidth={STROKE} />;
  }

  return (
    <View style={[styles.standaloneBar, { backgroundColor: colors.navBar }]}>
      <TabBarNotchBorder />
      {/* CINQ emplacements de largeur égale, pas quatre : le bouton central
          occupe le sien, exactement comme l'onglet factice `create` dans le
          vrai navigateur. Le glisser dans l'emplacement d'un onglet le faisait
          partager un cinquième de rangée avec lui — les deux se chevauchaient
          et toute la rangée se décalait. */}
      <View style={styles.standaloneRow}>
        {slots.map((slot, index) => {
          if (slot === 'create') {
            return <CreateTabButton key="create" />;
          }
          const focused = pathname === slot.match;
          const color = focused ? colors.navBarActive : colors.navBarInactive;
          return (
            <Pressable
              key={slot.route}
              onPress={() => router.replace(slot.route as never)}
              style={styles.standaloneSlot}
              accessibilityRole="button"
              accessibilityLabel={slot.label}
            >
              <TabIcon focused={focused}>{iconFor(slot, color)}</TabIcon>
              {slot.icon === 'bell' && unreadCount > 0 && (
                <View style={[styles.standaloneBadge, { backgroundColor: colors.notificationBadge }]}>
                  <Text style={styles.standaloneBadgeText}>{unreadCount}</Text>
                </View>
              )}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export const styles = StyleSheet.create({
  bar: {
    height: BAR_HEIGHT,
    paddingTop: BAR_PADDING_TOP,
    // React Navigation pose par défaut une bordure supérieure grise unie —
    // une vraie ligne CSS, parfaitement droite, qui coupait tout droit à
    // travers le bouton (sans connaître la découpe du SVG posé par-dessus).
    // Seul le trait de `TabBarNotchBorder` doit rester visible.
    borderTopWidth: 0,
  },
  // Le canevas s'aligne pile sur le bord supérieur de la barre, sans
  // décalage : c'est depuis ce bord (Y=0) que `buildCradlePath` calcule
  // la cuvette.
  notchBorder: { position: 'absolute', top: 0, left: 0 },
  // Boîte de taille fixe : c'est elle qui aligne les quatre onglets entre eux.
  // Sans ça, le monogramme « P » (un glyphe texte, avec sa propre hauteur de
  // ligne) ne tombait pas sur la même ligne optique que les icônes Lucide.
  iconBox: {
    width: ICON_SIZE + 8,
    height: ICON_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Point jaune sous l'onglet actif, plutôt qu'une pastille autour de
  // l'icône : le repère se lit sans déformer l'alignement de la rangée. Un
  // emplacement toujours réservé (transparent si inactif) garde les icônes
  // strictement à la même hauteur d'un onglet à l'autre.
  dot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    marginTop: 5,
    backgroundColor: 'transparent',
  },
  badge: {
    fontSize: 12,
    fontWeight: '700',
  },
  // Occupe le même emplacement flexible qu'un onglet normal dans la rangée
  // (React Navigation lui donne `flex: 1` comme aux autres), mais laisse le
  // vrai bouton s'élever au-dessus par un décalage vertical négatif.
  centerButtonSlot: { flex: 1, alignItems: 'center' },
  // Médaillon surélevé façon FAB : fond ardoise, bordure et icône dorées,
  // légère lueur — jamais un simple cercle jaune plein. Le décalage vers le
  // haut le détache de la rangée d'icônes plutôt que de s'y aligner à plat.
  centerButton: {
    position: 'absolute',
    top: -CENTER_BUTTON_RISE,
    width: CENTER_BUTTON_RADIUS * 2,
    height: CENTER_BUTTON_RADIUS * 2,
    borderRadius: CENTER_BUTTON_RADIUS,
    borderWidth: NOTCH_STROKE,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 6,
  },
  centerButtonPressed: { opacity: 0.85 },

  // --- Version autonome (écrans empilés), qui rejoue la même barre ---------
  standaloneBar: {
    height: BAR_HEIGHT,
    paddingTop: BAR_PADDING_TOP,
  },
  standaloneRow: { flexDirection: 'row', alignItems: 'flex-start' },
  standaloneSlot: { flex: 1, alignItems: 'center' },
  standaloneBadge: {
    position: 'absolute',
    top: -4,
    right: '22%',
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  standaloneBadgeText: { fontSize: 12, fontWeight: '700', color: '#FFFFFF' },
});
