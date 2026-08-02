import { Tabs } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { colors } from '../../../lib/theme';

/** Petit point doré au-dessus du libellé actif — seul indicateur, pas d'icônes. */
function TabDot({ focused }: { focused: boolean }) {
  return <View style={[styles.dot, focused && styles.dotActive]} />;
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.gold,
        tabBarInactiveTintColor: colors.textFaint,
        tabBarStyle: styles.bar,
        tabBarLabelStyle: styles.label,
        tabBarItemStyle: styles.item,
        tabBarShowLabel: true,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ title: 'Fil', tabBarIcon: ({ focused }) => <TabDot focused={focused} /> }}
      />
      <Tabs.Screen
        name="notifications"
        options={{ title: 'Notif', tabBarIcon: ({ focused }) => <TabDot focused={focused} /> }}
      />
      <Tabs.Screen
        name="circle"
        options={{ title: 'Cercle', tabBarIcon: ({ focused }) => <TabDot focused={focused} /> }}
      />
      <Tabs.Screen
        name="profile"
        options={{ title: 'Profil', tabBarIcon: ({ focused }) => <TabDot focused={focused} /> }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  bar: {
    backgroundColor: colors.surface,
    borderTopColor: colors.border,
    height: 64,
    paddingTop: 8,
  },
  item: { paddingTop: 4 },
  label: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.4,
    textTransform: 'uppercase',
  },
  dot: { width: 4, height: 4, borderRadius: 2, backgroundColor: 'transparent' },
  dotActive: { backgroundColor: colors.gold },
});
