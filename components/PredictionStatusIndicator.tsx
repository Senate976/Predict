import { ArrowUpRight, CheckCircle2, LoaderCircle, Rss } from 'lucide-react-native';
import { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import { Text } from './Text';

import { formatMonoCountdown } from '../lib/datetime';
import { colors, fonts } from '../lib/theme';

export type PredictionTimingStatus =
  | 'scheduled_pending'
  | 'scheduled_revealed'
  | 'open_pending'
  | 'open_revealed'
  | 'live';

/**
 * Déduit l'état de signalétique (indépendant du verdict Réalisé/Manqué, qui
 * reste un badge à part une fois qu'une majorité se forme) à partir des deux
 * axes qui définissent un Predict : sa portée temporelle (`open_ended`) et
 * son mode de révélation (`is_immediate`, qui prime sur tout le reste — une
 * prédiction immédiate n'est jamais « en attente »).
 */
export function resolveTimingStatus(
  item: { open_ended: boolean; is_immediate: boolean },
  revealed: boolean
): PredictionTimingStatus {
  if (item.is_immediate) return 'live';
  if (item.open_ended) return revealed ? 'open_revealed' : 'open_pending';
  return revealed ? 'scheduled_revealed' : 'scheduled_pending';
}

/** Anneau fin en rotation continue — état 1, « en attente d'une date fixe ». */
function SpinningLoader({ size, color }: { size: number; color: string }) {
  const spin = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(spin, {
        toValue: 1,
        duration: 1600,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );
    loop.start();
    return () => loop.stop();
  }, [spin]);

  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  return (
    <Animated.View style={{ transform: [{ rotate }] }}>
      <LoaderCircle size={size} color={color} strokeWidth={1.5} />
    </Animated.View>
  );
}

/** Point plein qui respire — état 3, « en attente que l'auteur révèle ». */
function PulseDot({ color }: { color: string }) {
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 0.3, duration: 800, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 800, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  return <Animated.View style={[styles.pulseDot, { backgroundColor: color, opacity: pulse }]} />;
}

/**
 * Signalétique d'état d'un Predict dans le fil et l'écran détail : un
 * indicateur vectoriel 12px + une micro-étiquette monospace, en lieu et
 * place de tout emoji ou icône figurative. Toujours sur la ligne de l'auteur,
 * jamais ailleurs — c'est la seule place où cette signalétique existe.
 */
export function PredictionStatusIndicator({
  status,
  revealAt,
  now,
}: {
  status: PredictionTimingStatus;
  /** Requis uniquement pour `scheduled_pending` (compte à rebours). */
  revealAt?: Date;
  now: Date;
}) {
  switch (status) {
    case 'scheduled_pending':
      return (
        <View style={styles.row}>
          <SpinningLoader size={12} color={colors.textMuted} />
          <Text style={styles.mono} numberOfLines={1}>
            [ {formatMonoCountdown(revealAt ?? now, now)} ]
          </Text>
        </View>
      );
    case 'scheduled_revealed':
      return (
        <View style={styles.row}>
          <CheckCircle2 size={12} color={colors.textFaint} strokeWidth={1.5} />
          <Text style={[styles.mono, styles.monoFaint]}>[ RESOLVED ]</Text>
        </View>
      );
    case 'open_pending':
      return (
        <View style={styles.row}>
          <PulseDot color={colors.textMuted} />
          <Text style={styles.mono}>[ AWAITING AUTHOR ]</Text>
        </View>
      );
    case 'open_revealed':
      return (
        <View style={styles.row}>
          <Rss size={12} color={colors.textMuted} strokeWidth={1.5} />
          <Text style={styles.mono}>[ REVEALED ]</Text>
        </View>
      );
    case 'live':
      return (
        <View style={styles.row}>
          <ArrowUpRight size={12} color={colors.goldTransition} strokeWidth={1.75} />
          <Text style={[styles.mono, styles.monoLive]}>[ LIVE ]</Text>
        </View>
      );
  }
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 5, flexShrink: 0 },
  mono: {
    fontFamily: fonts.mono,
    fontSize: 10,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    color: colors.textMuted,
  },
  monoFaint: { color: colors.textFaint },
  monoLive: { color: colors.goldTransition },
  pulseDot: { width: 6, height: 6, borderRadius: 3 },
});
