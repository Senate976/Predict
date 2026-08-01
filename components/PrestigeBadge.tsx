import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, Text, View } from 'react-native';

import { badgeForCount, badgeProgress } from '../lib/badges';
import { colors, fonts } from '../lib/theme';

type Props = {
  count: number;
  /** `small` : simple médaille, à côté d'un pseudo. `large` : pièce gravée + jauge (Profil). */
  size?: 'small' | 'large';
};

const SMALL_SIZE = 18;
const LARGE_SIZE = 96;

export function PrestigeBadge({ count, size = 'small' }: Props) {
  const badge = badgeForCount(count);
  const progress = badgeProgress(count, badge);

  if (size === 'small') {
    return (
      <View style={[styles.smallRing, { borderColor: badge.engraveShadow }]}>
        <LinearGradient
          colors={badge.gradient}
          start={{ x: 0.2, y: 0 }}
          end={{ x: 0.85, y: 1 }}
          style={styles.smallFace}
        />
      </View>
    );
  }

  return (
    <View style={styles.largeWrap}>
      <View style={styles.coinShadowLayer}>
        {/* Tranche de la pièce : anneau le plus sombre, légèrement plus grand
            que la face, pour l'épaisseur vue de trois quarts. */}
        <View style={[styles.rim, { backgroundColor: badge.engraveShadow }]} />

        <LinearGradient
          colors={badge.gradient}
          start={{ x: 0.18, y: 0.05 }}
          end={{ x: 0.85, y: 1 }}
          style={styles.face}
        >
          {/* Biseau intérieur : simple cercle inset avec une bordure claire,
              pour suggérer le rebord gravé de la maquette de référence. */}
          <View style={styles.bevel}>
            <View style={styles.engraving}>
              <Text
                style={[styles.label, styles.labelShadow, { color: badge.engraveShadow }]}
                numberOfLines={2}
              >
                {badge.label.toUpperCase()}
              </Text>
              <Text style={[styles.label, { color: badge.engraveLight }]} numberOfLines={2}>
                {badge.label.toUpperCase()}
              </Text>
              <View style={[styles.divider, { backgroundColor: badge.engraveShadow }]} />
              <Text style={[styles.monogram, { color: badge.engraveShadow }]}>P</Text>
            </View>
          </View>

          <View style={styles.highlight} />
        </LinearGradient>
      </View>

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
  smallRing: {
    width: SMALL_SIZE,
    height: SMALL_SIZE,
    borderRadius: SMALL_SIZE / 2,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  smallFace: {
    width: SMALL_SIZE - 4,
    height: SMALL_SIZE - 4,
    borderRadius: (SMALL_SIZE - 4) / 2,
  },
  largeWrap: { alignItems: 'center' },
  coinShadowLayer: {
    width: LARGE_SIZE + 6,
    height: LARGE_SIZE + 6,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.28,
    shadowRadius: 8,
    elevation: 6,
  },
  rim: {
    position: 'absolute',
    width: LARGE_SIZE + 6,
    height: LARGE_SIZE + 6,
    borderRadius: (LARGE_SIZE + 6) / 2,
  },
  face: {
    width: LARGE_SIZE,
    height: LARGE_SIZE,
    borderRadius: LARGE_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bevel: {
    width: LARGE_SIZE - 10,
    height: LARGE_SIZE - 10,
    borderRadius: (LARGE_SIZE - 10) / 2,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  engraving: { alignItems: 'center' },
  label: {
    fontFamily: fonts.serif,
    fontSize: 7.5,
    lineHeight: 9,
    letterSpacing: 0.3,
    textAlign: 'center',
    width: 74,
  },
  labelShadow: {
    position: 'absolute',
    top: 1,
    left: 0.6,
    opacity: 0.65,
  },
  divider: { width: 18, height: 1, marginTop: 4, opacity: 0.5 },
  monogram: { fontFamily: fonts.serif, fontSize: 9, marginTop: 3, opacity: 0.7 },
  highlight: {
    position: 'absolute',
    width: 30,
    height: 14,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.32)',
    top: 12,
    left: 16,
    transform: [{ rotate: '-25deg' }],
  },
  track: {
    width: 150,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    marginTop: 12,
    overflow: 'hidden',
  },
  fill: { height: '100%', borderRadius: 2 },
  nextLabel: { fontSize: 11, color: colors.textFaint, marginTop: 6 },
});
