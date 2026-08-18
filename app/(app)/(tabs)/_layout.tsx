import { Tabs } from 'expo-router';
import { Bell, CircleUserRound, Users } from 'lucide-react-native';

import {
  CreateTabButton,
  ICON_SIZE,
  PTabIcon,
  STROKE,
  TabBarNotchBorder,
  TabIcon,
  styles,
  useUnreadCount,
} from '../../../components/BottomNavBar';
import { useColors } from '../../../lib/themeMode';

/**
 * Déclaration des quatre onglets, rien de plus. Tout l'habillage de la barre
 * — géométrie de la découpe, bouton central, alignement des icônes — vit
 * dans `components/BottomNavBar.tsx`, qui sert aussi aux écrans empilés
 * (détail d'une prédiction, profil d'un ami) : une seule définition, donc
 * deux barres qui ne peuvent pas se mettre à différer.
 */
export default function TabsLayout() {
  const colors = useColors();
  const unreadCount = useUnreadCount();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.navBarActive,
        tabBarInactiveTintColor: colors.navBarInactive,
        tabBarStyle: [styles.bar, { backgroundColor: colors.navBar }],
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
          tabBarBadgeStyle: [styles.badge, { backgroundColor: colors.notificationBadge }],
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
