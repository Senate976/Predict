import { Tabs } from 'expo-router';
import { Bell, CircleUserRound, Users } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { StyleSheet, View, type ColorValue } from 'react-native';
import { Text } from '../../../components/Text';

import { useAuth } from '../../../lib/auth';
import { fetchUnreadNotificationCount } from '../../../lib/notifications';
import { colors, fonts } from '../../../lib/theme';

/** Monogramme « P » du Fil, à la place d'une icône générique — c'est
 * l'onglet qui mène au cœur de l'app (les Predicts), pas juste un favori. */
function PTabIcon({ color, size }: { color: ColorValue; size: number }) {
  return <Text style={{ fontFamily: fonts.display, fontSize: size, lineHeight: size, color }}>P</Text>;
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
          tabBarIcon: ({ color, size, focused }) => (
            <View style={[styles.iconWrap, focused && styles.iconWrapActive]}>
              <PTabIcon size={size} color={color} />
            </View>
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
          tabBarIcon: ({ color, size, focused }) => (
            <View style={[styles.iconWrap, focused && styles.iconWrapActive]}>
              <Bell size={size} color={color} strokeWidth={focused ? 2 : 1.5} />
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="circle"
        options={{
          title: 'Cercle',
          tabBarIcon: ({ color, size, focused }) => (
            <View style={[styles.iconWrap, focused && styles.iconWrapActive]}>
              <Users size={size} color={color} strokeWidth={focused ? 2 : 1.5} />
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profil',
          tabBarIcon: ({ color, size, focused }) => (
            <View style={[styles.iconWrap, focused && styles.iconWrapActive]}>
              <CircleUserRound size={size} color={color} strokeWidth={focused ? 2 : 1.5} />
            </View>
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
    paddingTop: 12,
  },
  // Petit fond pastel derrière l'icône active — discret repère visuel plutôt
  // que la seule couleur, sans agrandir la barre.
  iconWrap: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 999,
  },
  iconWrapActive: { backgroundColor: colors.navBarActiveSoft },
  badge: {
    backgroundColor: colors.notificationBadge,
    fontSize: 10,
    fontWeight: '700',
  },
});
