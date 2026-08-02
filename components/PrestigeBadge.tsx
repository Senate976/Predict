import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, Text, View } from 'react-native';

import { badgeForCount } from '../lib/badges';
import { colors, eyebrow, fonts } from '../lib/theme';

type Props = {
  count: number;
  /** `small` : simple puce, à côté d'un pseudo. `large` : médaillon + libellé, sans indice sur le niveau suivant (Profil). */
  size?: 'small' | 'large';
};

const SMALL_SIZE = 16;
const LARGE_SIZE = 72;

/**
 * Un anneau doré fin plutôt qu'une pièce gravée en relief, avec un médaillon
 * central qui reprend le monogramme "P" du logo — un dégradé subtil par
 * métal (fer, bronze, argent, or) plutôt qu'une couleur plate, façon reflet
 * de bijouterie. Le nom du niveau se lit en typographie sous le médaillon,
 * jamais dessus, pour rester lisible quel que soit le métal.
 */
export function PrestigeBadge({ count, size = 'small' }: Props) {
  const badge = badgeForCount(count);

  if (size === 'small') {
    return (
      <View style={[styles.smallRing, { borderColor: badge.color }]}>
        <LinearGradient
          colors={badge.gradient}
          start={{ x: 0.15, y: 0 }}
          end={{ x: 0.9, y: 1 }}
          style={styles.smallCore}
        />
      </View>
    );
  }

  return (
    <View style={styles.largeWrap}>
      <View style={[styles.medallion, { borderColor: badge.color }]}>
        <View style={[styles.innerRing, { borderColor: badge.color }]} />
        {/* Reflet subtil, façon verre — un simple arc clair en haut à gauche. */}
        <View style={styles.gloss} />
        <LinearGradient
          colors={badge.gradient}
          start={{ x: 0.15, y: 0 }}
          end={{ x: 0.9, y: 1 }}
          style={styles.core}
        >
          <Text style={[styles.monogram, { color: badge.monogramColor }]}>P</Text>
        </LinearGradient>
      </View>

      <Text style={[styles.label, { color: badge.color }]}>{badge.label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  smallRing: {
    width: SMALL_SIZE,
    height: SMALL_SIZE,
    borderRadius: SMALL_SIZE / 2,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  smallCore: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  largeWrap: { alignItems: 'center' },
  medallion: {
    width: LARGE_SIZE,
    height: LARGE_SIZE,
    borderRadius: LARGE_SIZE / 2,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  innerRing: {
    position: 'absolute',
    width: LARGE_SIZE - 10,
    height: LARGE_SIZE - 10,
    borderRadius: (LARGE_SIZE - 10) / 2,
    borderWidth: 1,
    opacity: 0.35,
  },
  gloss: {
    position: 'absolute',
    width: LARGE_SIZE - 18,
    height: (LARGE_SIZE - 18) / 2,
    top: 8,
    borderTopLeftRadius: (LARGE_SIZE - 18) / 2,
    borderTopRightRadius: (LARGE_SIZE - 18) / 2,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.9)',
    opacity: 0.5,
  },
  core: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  monogram: {
    fontFamily: fonts.serifItalic,
    fontSize: 18,
    lineHeight: 21,
  },
  label: {
    ...eyebrow,
    marginTop: 12,
    fontFamily: fonts.serif,
    fontSize: 13,
    letterSpacing: 1.2,
    textTransform: 'none',
    fontWeight: '600',
  },
});
