import { Tabs } from 'expo-router';
import { Image, StyleSheet, View } from 'react-native';

import { colors } from '../../../lib/theme';

/** Petit point doré au-dessus du libellé actif — seul indicateur, pas d'icônes. */
function TabDot({ focused }: { focused: boolean }) {
  return <View style={[styles.dot, focused && styles.dotActive]} />;
}

/** Le logo de l'app (le "P" vitrail), en médaillon — tient lieu d'icône ET de libellé pour l'onglet Profil. */
function BrandMark({ focused }: { focused: boolean }) {
  return (
    <View style={[styles.brandRing, focused && styles.brandRingActive]}>
      <Image source={require('../../../assets/predict-mark.png')} style={styles.brandImage} />
    </View>
  );
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
        options={{
          tabBarLabel: () => null,
          tabBarIcon: ({ focused }) => <BrandMark focused={focused} />,
        }}
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
  brandRing: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    opacity: 0.55,
  },
  brandRingActive: { opacity: 1 },
  brandImage: {
    width: 28,
    height: 28,
  },
});
