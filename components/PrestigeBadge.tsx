import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, Text, View } from 'react-native';

import { badgeForCount, badgeProgress } from '../lib/badges';
import { colors, fonts } from '../lib/theme';

type Props = {
  count: number;
  /** `small` : simple médaille, à côté d'un pseudo. `large` : médaille + niveau + jauge (Profil). */
  size?: 'small' | 'large';
};

const SMALL_SIZE = 16;
const LARGE_SIZE = 60;

export function PrestigeBadge({ count, size = 'small' }: Props) {
  const badge = badgeForCount(count);
  const progress = badgeProgress(count, badge);
  const diameter = size === 'large' ? LARGE_SIZE : SMALL_SIZE;

  const medal = (
    <View style={[styles.ring, { width: diameter + 6, height: diameter + 6, borderRadius: (diameter + 6) / 2 }]}>
      <LinearGradient
        colors={badge.gradient}
        start={{ x: 0.2, y: 0 }}
        end={{ x: 0.85, y: 1 }}
        style={[styles.medal, { width: diameter, height: diameter, borderRadius: diameter / 2 }]}
      >
        {size === 'large' && <View style={styles.highlight} />}
      </LinearGradient>
    </View>
  );

  if (size === 'small') return medal;

  return (
    <View style={styles.largeWrap}>
      {medal}
      <Text style={styles.levelLabel}>{badge.label}</Text>
      {badge.next ? (
        <>
          <View style={styles.track}>
            <View
              style={[
                styles.fill,
                { width: `${Math.round((progress ?? 0) * 100)}%`, backgroundColor: badge.color },
              ]}
            />
          </View>
          <Text style={styles.nextLabel}>
            {count} / {badge.next.min} vers {badge.next.label}
          </Text>
        </>
      ) : (
        <Text style={styles.nextLabel}>Niveau maximum</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  ring: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  medal: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  highlight: {
    position: 'absolute',
    width: 18,
    height: 9,
    borderRadius: 9,
    backgroundColor: 'rgba(255,255,255,0.35)',
    top: 8,
    left: 10,
    transform: [{ rotate: '-25deg' }],
  },
  largeWrap: { alignItems: 'center' },
  levelLabel: {
    fontFamily: fonts.serifItalic,
    fontSize: 18,
    color: colors.text,
    marginTop: 8,
  },
  track: {
    width: 140,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    marginTop: 10,
    overflow: 'hidden',
  },
  fill: { height: '100%', borderRadius: 2 },
  nextLabel: { fontSize: 11, color: colors.textFaint, marginTop: 6 },
});
