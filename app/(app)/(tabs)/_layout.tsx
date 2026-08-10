import { Tabs, useRouter } from 'expo-router';
import { Bell, CircleUserRound, Plus, Users } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, useWindowDimensions, View, type ColorValue } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { Text } from '../../../components/Text';

import { useAuth } from '../../../lib/auth';
import { fetchUnreadNotificationCount } from '../../../lib/notifications';
import { colors, fonts } from '../../../lib/theme';

/** Taille et épaisseur communes aux quatre onglets — une seule source, pour
 * qu'aucune icône ne détonne dans la rangée. */
const ICON_SIZE = 24;
const STROKE = 1.75;

/** Monogramme « P » du Fil, à la place d'une icône générique — c'est
 * l'onglet qui mène au cœur de l'app (les Predicts), pas juste un favori. */
function PTabIcon({ color, size }: { color: ColorValue; size: number }) {
  return <Text style={{ fontFamily: fonts.display, fontSize: size, lineHeight: size, color }}>P</Text>;
}

/** Enveloppe commune : boîte de taille fixe (alignement) + point jaune sous
 * l'onglet actif. */
function TabIcon({ focused, children }: { focused: boolean; children: React.ReactNode }) {
  return (
    <View style={{ alignItems: 'center' }}>
      <View style={styles.iconBox}>{children}</View>
      <View style={[styles.dot, focused && styles.dotActive]} />
    </View>
  );
}

/** Fréquence de rafraîchissement du badge — juste assez pour rester à jour
 * sans matraquer la base pendant que l'app reste ouverte. */
const UNREAD_POLL_MS = 20_000;

/** Rayon et décalage vertical du bouton central (`centerButton` plus bas) —
 * la découpe de `TabBarNotchBorder` s'appuie sur ces mêmes valeurs plutôt
 * que sur des chiffres redevinés à l'œil, pour rester cohérente si l'un des
 * deux change. */
const CENTER_BUTTON_RADIUS = 26;
const CENTER_BUTTON_RISE = 18;
/** `paddingTop` de `styles.bar` : le bouton (comme les icônes) vit dans le
 * contenu de la barre, décalé de cette marge par rapport à son bord
 * supérieur — sans elle, le centre du bouton calculé ici tombait 10px plus
 * haut que sa vraie position, cassant la concentricité de la découpe (elle
 * s'approchait bien plus près du bouton réel que le `NOTCH_GAP` visé). */
const BAR_PADDING_TOP = 10;
/** Centre du bouton, en Y, relatif au bord supérieur de la barre (Y=0) —
 * le bouton étant décalé de `CENTER_BUTTON_RISE` vers le haut depuis le
 * bord du contenu (déjà `BAR_PADDING_TOP` sous le bord de la barre), son
 * centre tombe `CENTER_BUTTON_RISE` sous son propre rayon, plus ce padding. */
const BUTTON_CENTER_Y = BAR_PADDING_TOP + CENTER_BUTTON_RADIUS - CENTER_BUTTON_RISE;
/** Espace exact, sous le bouton, entre son contour et le fond de la cuvette
 * — l'arc central qui le contourne est concentrique à son cercle, à ce
 * rayon en plus du sien, donc à cette distance constante de son contour à
 * l'aplomb du bouton (pas nécessairement ailleurs, voir `NOTCH_FILLET_RADIUS`
 * ci-dessous : la jonction avec la ligne droite doit rester lisse, ce
 * qu'un simple arc concentrique ne permet pas — il croiserait la ligne à
 * angle vif). */
const NOTCH_GAP = 3;
const NOTCH_RADIUS = CENTER_BUTTON_RADIUS + NOTCH_GAP;
/** Rayon des deux raccords qui relient la ligne droite de la barre à l'arc
 * central : chaque raccord est tangent à la fois à la ligne (Y=0) et à cet
 * arc (tangence externe, centres à distance `NOTCH_RADIUS + r`), donc sans
 * aucun angle vif à ses deux jonctions — deux cercles tangents partagent
 * toujours une même tangente à leur point de contact, par construction
 * géométrique et non par approximation visuelle. Vérifié numériquement :
 * l'angle entre segments consécutifs à chaque jonction décroît en 1/N (N =
 * nombre de segments), signature d'une courbe réellement lisse plutôt que
 * d'une vraie cassure qui resterait constante quel que soit N. Grand
 * (20px) pour que la descente commence bien avant la silhouette du bouton
 * — un raccord étroit paraît toujours plus « cassé » à l'œil qu'un raccord
 * large, même parfaitement tangent. */
const NOTCH_FILLET_RADIUS = 20;
/** Nombre de segments par arc — une ligne brisée assez dense pour se lire
 * comme une courbe lisse, chaque sommet calculé exactement sur son cercle
 * plutôt qu'approché par une courbe de Bézier. */
const NOTCH_SEGMENTS = 32;

/**
 * Points du contour de la découpe, en coordonnées absolues (0..width en X,
 * Y croissant vers le bas depuis le bord supérieur de la barre) : ligne
 * droite → raccord lisse → arc concentrique au bouton (passant par son
 * point le plus bas) → raccord symétrique → ligne droite. Une « cuvette » à
 * trois arcs plutôt qu'un seul arc sec : celui-ci épouserait exactement le
 * bouton mais croiserait la ligne droite à angle vif (une sécante, jamais
 * tangente, à une droite) — les deux raccords absorbent cette cassure en
 * douceur, aux deux jonctions. Ce tracé sert uniquement de trait de
 * bordure (voir `TabBarNotchBorder`) : la barre elle-même reste un
 * rectangle plein classique (`styles.bar.backgroundColor`), jamais découpé
 * — sinon la zone sous la courbe laisserait voir, par transparence, le
 * fond par défaut du conteneur de React Navigation (blanc sur certaines
 * plateformes) plutôt que rester du noir uni.
 */
function buildCradlePoints(cx: number, width: number): [number, number][] {
  const r = NOTCH_FILLET_RADIUS;
  const R = NOTCH_RADIUS;
  const cy = BUTTON_CENTER_Y;

  const dist = R + r;
  const halfWidth = Math.sqrt(dist * dist - (cy - r) * (cy - r));
  const tx = -halfWidth;
  // Point de tangence commun aux deux cercles, sur le segment reliant leurs
  // centres (le centre du raccord et celui du bouton), à distance R de ce
  // dernier.
  const px = (R / dist) * tx;
  const py = cy + (R / dist) * (r - cy);

  const angFlat = Math.atan2(-r, 0);
  const angTangentFromFillet = Math.atan2(py - r, px - tx);

  function arcPoints(
    centerX: number,
    centerY: number,
    radius: number,
    angFrom: number,
    angTo: number,
    segments: number
  ): [number, number][] {
    const pts: [number, number][] = [];
    for (let i = 0; i <= segments; i++) {
      const angle = angFrom + ((angTo - angFrom) * i) / segments;
      pts.push([centerX + radius * Math.cos(angle), centerY + radius * Math.sin(angle)]);
    }
    return pts;
  }

  const leftFillet = arcPoints(tx, r, r, angFlat, angTangentFromFillet, NOTCH_SEGMENTS);
  const angCenterLeft = Math.atan2(py - cy, px);
  // -2π force le passage par le bas du cercle (90°) plutôt que par le haut,
  // qui serait le chemin le plus court entre ces deux angles.
  const angCenterRight = Math.atan2(py - cy, -px) - Math.PI * 2;
  const bigArc = arcPoints(0, cy, R, angCenterLeft, angCenterRight, NOTCH_SEGMENTS * 2);
  const rightFillet = leftFillet
    .slice()
    .reverse()
    .map(([x, y]): [number, number] => [-x, y]);

  return [
    [0, 0],
    ...leftFillet.map(([x, y]): [number, number] => [cx + x, y]),
    ...bigArc.slice(1).map(([x, y]): [number, number] => [cx + x, y]),
    ...rightFillet.slice(1).map(([x, y]): [number, number] => [cx + x, y]),
    [width, 0],
  ];
}

/**
 * Trait du haut de la barre de navigation, en SVG plutôt qu'une simple
 * bordure CSS : une ligne droite aurait coupé tout droit à travers le
 * bouton central « + », qui déborde déjà au-dessus de la barre. Un seul
 * `Path`, en trait seul (`fill="none"`) — jamais de remplissage : le noir
 * sous la courbe est celui, uni, de `styles.bar.backgroundColor`, pas
 * celui de ce SVG.
 */
function TabBarNotchBorder() {
  const { width } = useWindowDimensions();
  const cx = width / 2;
  const points = buildCradlePoints(cx, width);
  const d = `M ${points.map(([x, y]) => `${x.toFixed(2)} ${y.toFixed(2)}`).join(' L ')}`;

  return (
    <Svg width={width} height={NOTCH_RADIUS + BUTTON_CENTER_Y + 2} style={styles.notchBorder} pointerEvents="none">
      <Path d={d} stroke={colors.navBarBorder} strokeWidth={1.5} fill="none" />
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
function CreateTabButton() {
  const router = useRouter();
  return (
    <View style={styles.centerButtonSlot} pointerEvents="box-none">
      <Pressable
        onPress={() => router.push('/new-prediction')}
        style={({ pressed }) => [styles.centerButton, pressed && styles.centerButtonPressed]}
        hitSlop={6}
      >
        <Plus size={26} color={colors.fabIcon} strokeWidth={2.5} />
      </Pressable>
    </View>
  );
}

export default function TabsLayout() {
  const { session } = useAuth();
  const userId = session?.user.id;
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;

    async function refresh() {
      const { count } = await fetchUnreadNotificationCount(userId!);
      if (!cancelled) setUnreadCount(count);
    }

    refresh();
    const interval = setInterval(refresh, UNREAD_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [userId]);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.navBarActive,
        tabBarInactiveTintColor: colors.navBarInactive,
        tabBarStyle: styles.bar,
        tabBarBackground: () => <TabBarNotchBorder />,
        tabBarShowLabel: false,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Fil',
          tabBarIcon: ({ color, focused }) => (
            <TabIcon focused={focused}>
              <PTabIcon size={ICON_SIZE} color={color} />
            </TabIcon>
          ),
        }}
      />
      <Tabs.Screen
        name="notifications"
        options={{
          title: 'Notifications',
          // Badge natif façon iPhone — style et positionnement gérés par
          // React Navigation, cohérents entre iOS/Android/web sans CSS maison.
          tabBarBadge: unreadCount > 0 ? unreadCount : undefined,
          tabBarBadgeStyle: styles.badge,
          tabBarIcon: ({ color, focused }) => (
            <TabIcon focused={focused}>
              <Bell size={ICON_SIZE} color={color} strokeWidth={STROKE} />
            </TabIcon>
          ),
        }}
      />
      <Tabs.Screen
        name="create"
        options={{
          title: 'Créer',
          // Bouton entièrement custom : ignore l'apparence standard d'un
          // onglet (icône + point actif) et le press par défaut de React
          // Navigation — voir `CreateTabButton`.
          tabBarButton: () => <CreateTabButton />,
        }}
      />
      <Tabs.Screen
        name="circle"
        options={{
          title: 'Cercle',
          tabBarIcon: ({ color, focused }) => (
            <TabIcon focused={focused}>
              <Users size={ICON_SIZE} color={color} strokeWidth={STROKE} />
            </TabIcon>
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profil',
          tabBarIcon: ({ color, focused }) => (
            <TabIcon focused={focused}>
              <CircleUserRound size={ICON_SIZE} color={color} strokeWidth={STROKE} />
            </TabIcon>
          ),
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  bar: {
    // Rectangle plein classique — jamais découpé : voir la note sur
    // `buildCradlePoints`, le SVG ne dessine qu'un trait par-dessus.
    backgroundColor: colors.navBar,
    height: 64,
    paddingTop: BAR_PADDING_TOP,
  },
  // Le canevas s'aligne pile sur le bord supérieur de la barre, sans
  // décalage : c'est depuis ce bord (Y=0) que `buildCradlePoints` calcule
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
  dotActive: { backgroundColor: colors.gold },
  badge: {
    backgroundColor: colors.notificationBadge,
    fontSize: 10,
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
    backgroundColor: colors.fab,
    borderWidth: 1.5,
    borderColor: colors.fabBorder,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.gold,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 6,
  },
  centerButtonPressed: { opacity: 0.85 },
});
