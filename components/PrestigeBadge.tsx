import { StyleSheet, Text, View } from 'react-native';

import { badgeForCount, badgeProgress } from '../lib/badges';
import { colors, eyebrow, fonts } from '../lib/theme';

type Props = {
  count: number;
  /** `small` : simple puce, à côté d'un pseudo. `large` : médaillon + libellé + jauge (Profil). */
  size?: 'small' | 'large';
};

const SMALL_SIZE = 16;
const LARGE_SIZE = 72;

/**
 * Un anneau doré fin plutôt qu'une pièce gravée en relief : le nom du niveau
 * se lit en typographie (style `eyebrow`, cohérent avec le reste de
 * l'application) sous le médaillon, jamais à l'intérieur — ce qui évite tout
 * problème de contraste texte-sur-métal, quel que soit le niveau.
 */
export function PrestigeBadge({ count, size = 'small' }: Props) {
  const badge = badgeForCount(count);
  const progress = badgeProgress(count, badge);

  if (size === 'small') {
    return (
      <View style={[styles.smallRing, { borderColor: badge.color }]}>
        <View style={[styles.smallCore, { backgroundColor: badge.color }]} />
      </View>
    );
  }

  return (
    <View style={styles.largeWrap}>
      <View style={[styles.medallion, { borderColor: badge.color }]}>
        <View style={[styles.innerRing, { borderColor: badge.color }]} />
        {/* Reflet subtil, façon verre — un simple arc clair en haut à gauche. */}
        <View style={styles.gloss} />
        <View style={[styles.core, { backgroundColor: badge.color }]} />
      </View>

      <Text style={[styles.label, { color: badge.color }]}>{badge.label}</Text>

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
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  smallCore: {
    width: 5,
    height: 5,
    borderRadius: 3,
    opacity: 0.85,
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
    width: 8,
    height: 8,
    borderRadius: 4,
    opacity: 0.9,
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
  track: {
    width: 150,
    height: 3,
    borderRadius: 2,
    backgroundColor: colors.border,
    marginTop: 12,
    overflow: 'hidden',
  },
  fill: { height: '100%', borderRadius: 2 },
  nextLabel: { fontSize: 11, color: colors.textFaint, marginTop: 6 },
});
