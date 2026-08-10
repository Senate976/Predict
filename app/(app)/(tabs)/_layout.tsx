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
/** Centre du bouton, en Y, relatif au bord supérieur de la barre (Y=0) —
 * le bouton étant décalé de `CENTER_BUTTON_RISE` vers le haut, son centre
 * tombe `CENTER_BUTTON_RISE` sous son propre rayon. */
const BUTTON_CENTER_Y = CENTER_BUTTON_RADIUS - CENTER_BUTTON_RISE;
/** Espace exact, en tout point, entre le trait et le bouton — jamais un
 * simple dégagement approximatif : le trait suit un arc concentrique au
 * bouton, à ce rayon en plus du sien, donc à cette distance constante de
 * son contour partout, pas seulement à son point le plus proche. */
const NOTCH_GAP = 3;
const NOTCH_RADIUS = CENTER_BUTTON_RADIUS + NOTCH_GAP;
/** Angles (radians) où ce cercle concentrique croise la ligne Y=0 — au-delà,
 * le trait reste la ligne droite normale de la barre. `Math.asin` ne rend
 * que le quadrant [-90°, 90°] ; le second point est son symétrique par
 * rapport à l'axe vertical (180° - angle), pas son opposé. */
const NOTCH_CROSSING_ANGLE = Math.asin(-BUTTON_CENTER_Y / NOTCH_RADIUS);
/** Nombre de segments de l'arc — une ligne brisée assez dense pour se lire
 * comme une courbe lisse, chaque sommet calculé exactement sur le cercle
 * concentrique plutôt qu'approché par une courbe de Bézier. */
const NOTCH_SEGMENTS = 24;

/**
 * Trait du haut de la barre de navigation, en SVG plutôt qu'une simple
 * bordure CSS : une ligne droite aurait coupé tout droit à travers le
 * bouton central « + », qui déborde déjà au-dessus de la barre. Cette
 * découpe contourne sa silhouette par le dessous, sur un arc concentrique à
 * son cercle (même centre, rayon `NOTCH_GAP` plus grand) : la distance au
 * bouton reste donc exactement `NOTCH_GAP`, en tout point de la courbe, et
 * pas seulement à son sommet — jamais un simple rapprochement à l'œil.
 */
function TabBarNotchBorder() {
  const { width } = useWindowDimensions();
  const cx = width / 2;

  // Du point gauche (angle π - crossing) au point droit (angle crossing),
  // en décroissant : ce sens passe par π/2 (le point le plus bas du
  // cercle, sous le bouton) plutôt que par le haut, à l'opposé.
  const startAngle = Math.PI - NOTCH_CROSSING_ANGLE;
  const endAngle = NOTCH_CROSSING_ANGLE;
  const points: string[] = [];
  for (let i = 0; i <= NOTCH_SEGMENTS; i++) {
    const angle = startAngle + ((endAngle - startAngle) * i) / NOTCH_SEGMENTS;
    const x = cx + NOTCH_RADIUS * Math.cos(angle);
    const y = BUTTON_CENTER_Y + NOTCH_RADIUS * Math.sin(angle);
    points.push(`${x.toFixed(2)} ${y.toFixed(2)}`);
  }
  const d = `M 0 0 L ${points[0]} L ${points.slice(1).join(' L ')} L ${width} 0`;

  return (
    <Svg width={width} height={NOTCH_RADIUS + BUTTON_CENTER_Y + 2} style={styles.notchBorder} pointerEvents="none">
      <Path d={d} stroke={colors.navBarBorder} strokeWidth={1} fill="none" />
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
    backgroundColor: colors.navBar,
    height: 64,
    paddingTop: 10,
  },
  // Positionné pour que son `baseY` (voir `TabBarNotchBorder`) tombe
  // exactement sur le bord supérieur de la barre, la bosse dépassant par-
  // dessus plutôt que d'être tronquée.
  // La découpe plonge sous la barre (vers le bouton, qui déborde bien plus
  // bas que le bord supérieur) plutôt que de dépasser par-dessus — le
  // canevas s'aligne donc pile sur ce bord, sans décalage vers le haut.
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
