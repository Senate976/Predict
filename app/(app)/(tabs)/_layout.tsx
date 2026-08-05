import { Tabs } from 'expo-router';
import { Bell, CircleUserRound, Users } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { StyleSheet, View, type ColorValue } from 'react-native';
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
    borderTopColor: colors.navBarBorder,
    borderTopWidth: 1,
    height: 64,
    paddingTop: 10,
  },
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
});
