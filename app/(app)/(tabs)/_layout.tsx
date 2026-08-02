import { Tabs } from 'expo-router';
import { Image, StyleSheet, View } from 'react-native';

import { colors } from '../../../lib/theme';

/** Petit point doré au-dessus du libellé actif — seul indicateur, pas d'icônes. */
function TabDot({ focused }: { focused: boolean }) {
  return <View style={[styles.dot, focused && styles.dotActive]} />;
}

/**
 * Le logo de l'app (le "P" vitrail), utilisé comme libellé de l'onglet
 * Profil plutôt que comme icône : posé dans le même emplacement (`tabBarLabel`)
 * que le texte des autres onglets, il hérite de leur position verticale — une
 * icône dans `tabBarIcon` (comme les autres) le décalerait, react-navigation
 * ne réservant pas le même espace à un `Image` qu'à un texte.
 *
 * `brandLabelSlot` a la hauteur d'une ligne de libellé (même valeur que
 * `label.fontSize`) et ancre son contenu en bas (`flex-end`) : l'image, bien
 * plus grande que ce slot, déborde librement vers le haut (pas de
 * `overflow:'hidden'`) sans pousser son bord bas plus bas que la ligne de
 * base du texte des onglets voisins.
 */
function BrandLabel({ focused }: { focused: boolean }) {
  return (
    <View style={styles.brandLabelSlot}>
      <Image
        source={require('../../../assets/predict-mark.png')}
        style={[styles.brandLabelImage, focused && styles.brandLabelImageActive]}
      />
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
          tabBarIcon: ({ focused }) => <TabDot focused={focused} />,
          tabBarLabel: ({ focused }) => <BrandLabel focused={focused} />,
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
  brandLabelSlot: {
    height: 13,
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  brandLabelImage: {
    width: 30,
    height: 30,
    borderRadius: 7,
    opacity: 0.55,
  },
  brandLabelImageActive: { opacity: 1 },
});
