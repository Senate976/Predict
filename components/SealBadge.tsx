import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, Text, View } from 'react-native';

import { fonts } from '../lib/theme';

const SIZE = 30;

/**
 * Version miniature et statique du cachet de cire (components/PredictionSeal),
 * affichée sur les cartes du fil tant qu'une prédiction n'est pas révélée.
 */
export function SealBadge() {
  return (
    <View style={styles.wrap}>
      <LinearGradient
        colors={['#A63A4C', '#5C1420', '#3D0D16']}
        start={{ x: 0.2, y: 0.1 }}
        end={{ x: 0.85, y: 1 }}
        style={styles.base}
      >
        <View style={styles.highlight} />
        <Text style={styles.emblem}>P</Text>
      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: SIZE,
    height: SIZE,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3,
    elevation: 3,
  },
  base: {
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  highlight: {
    position: 'absolute',
    width: 10,
    height: 5,
    borderRadius: 5,
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    top: 5,
    left: 6,
    transform: [{ rotate: '-28deg' }],
  },
  emblem: {
    fontFamily: fonts.serif,
    fontSize: 13,
    color: '#C9A66B',
  },
});
