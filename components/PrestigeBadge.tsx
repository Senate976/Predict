import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Defs, Path, RadialGradient, Stop } from 'react-native-svg';

import { badgeForCount } from '../lib/badges';
import { colors, eyebrow, fonts } from '../lib/theme';

type Props = {
  count: number;
  /** `small` : simple puce, à côté d'un pseudo. `large` : médaillon + libellé, sans indice sur le niveau suivant (Profil). */
  size?: 'small' | 'large';
};

const SMALL_SIZE = 16;
const LARGE_SIZE = 88;

/**
 * Un sceau royal : médaillon à tranche cannelée (façon pièce frappée), disque
 * en dégradé du métal du niveau (fer/bronze/argent/or), couronne gravée en
 * haut, monogramme "P" du logo au centre. Le nom du niveau se lit sous le
 * médaillon, jamais dessus, pour rester lisible quel que soit le métal.
 */
export function PrestigeBadge({ count, size = 'small' }: Props) {
  const badge = badgeForCount(count);
  const gradientId = `prestige-${badge.level}-${size}`;

  if (size === 'small') {
    return (
      <View style={[styles.smallRing, { borderColor: badge.color }]}>
        <Svg width={SMALL_SIZE - 5} height={SMALL_SIZE - 5} viewBox="0 0 100 100">
          <Defs>
            <RadialGradient id={gradientId} cx="35%" cy="30%" r="75%">
              <Stop offset="0%" stopColor={badge.gradient[0]} />
              <Stop offset="100%" stopColor={badge.gradient[1]} />
            </RadialGradient>
          </Defs>
          <Circle cx="50" cy="50" r="48" fill={`url(#${gradientId})`} />
        </Svg>
      </View>
    );
  }

  return (
    <View style={styles.largeWrap}>
      <View style={styles.shadowRing} />
      <View style={styles.medallion}>
        <Svg width={LARGE_SIZE} height={LARGE_SIZE} viewBox="0 0 100 100">
          <Defs>
            <RadialGradient id={gradientId} cx="35%" cy="28%" r="80%">
              <Stop offset="0%" stopColor={badge.gradient[0]} />
              <Stop offset="100%" stopColor={badge.gradient[1]} />
            </RadialGradient>
          </Defs>

          {/* Tranche cannelée, façon pièce frappée. */}
          <Circle
            cx="50"
            cy="50"
            r="47"
            fill="none"
            stroke={badge.color}
            strokeWidth="3"
            strokeDasharray="2.2 3.4"
            opacity={0.45}
          />

          {/* Disque principal, dégradé du métal du niveau. */}
          <Circle cx="50" cy="50" r="42" fill={`url(#${gradientId})`} stroke={badge.color} strokeWidth="1.5" />

          {/* Anneau gravé intérieur. */}
          <Circle cx="50" cy="50" r="33" fill="none" stroke={badge.monogramColor} strokeWidth="1" opacity={0.3} />

          {/* Couronne, gravée en haut du médaillon. */}
          <Path
            d="M35,32 L35,20 L41,25 L47,14 L50,22 L53,14 L59,25 L65,20 L65,32 Z"
            fill={badge.monogramColor}
            opacity={0.9}
          />
          <Circle cx="50" cy="16" r="2.2" fill={badge.color} />
        </Svg>

        <Text style={[styles.monogram, { color: badge.monogramColor }]}>P</Text>
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
    overflow: 'hidden',
  },
  largeWrap: { alignItems: 'center' },
  shadowRing: {
    position: 'absolute',
    width: LARGE_SIZE + 6,
    height: LARGE_SIZE + 6,
    borderRadius: (LARGE_SIZE + 6) / 2,
    top: 4,
    backgroundColor: 'rgba(0,0,0,0.16)',
  },
  medallion: {
    width: LARGE_SIZE,
    height: LARGE_SIZE,
    borderRadius: LARGE_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.18,
    shadowRadius: 6,
    elevation: 4,
  },
  monogram: {
    position: 'absolute',
    top: '52%',
    fontFamily: fonts.serifItalic,
    fontSize: 26,
    lineHeight: 30,
    transform: [{ translateY: -15 }],
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
