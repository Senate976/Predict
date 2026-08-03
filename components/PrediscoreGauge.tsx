import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { StyleSheet, Text, View } from 'react-native';

import { colors } from '../lib/theme';

const BAR_WIDTH = 260;
const BAR_HEIGHT = 10;
const CURSOR_SIZE = 18;

/**
 * Jauge horizontale du Prediscore — dégradé rouge (« Mytho ») à vert
 * (« J'ai raison. Toujours. »), avec un curseur positionné au score actuel.
 * `score` est `null` tant qu'aucune prédiction révélée n'existe encore :
 * affiche alors un état vide plutôt qu'une jauge à 0%, pour ne pas laisser
 * croire à un mauvais score qui n'existe pas encore.
 */
export function PrediscoreGauge({ score }: { score: number | null }) {
  if (score === null) {
    return (
      <View style={styles.wrap}>
        <Text style={styles.emptyText}>
          Ton Prediscore apparaîtra après ta première prédiction révélée.
        </Text>
      </View>
    );
  }

  const clamped = Math.max(0, Math.min(100, score));
  const cursorLeft = (clamped / 100) * BAR_WIDTH - CURSOR_SIZE / 2;

  return (
    <View style={styles.wrap}>
      <Text style={styles.scoreValue}>{clamped}%</Text>

      <View style={styles.barBox}>
        <Svg width={BAR_WIDTH} height={BAR_HEIGHT}>
          <Defs>
            <LinearGradient id="prediscoreGradient" x1="0" y1="0" x2="1" y2="0">
              <Stop offset="0" stopColor={colors.danger} />
              <Stop offset="1" stopColor={colors.success} />
            </LinearGradient>
          </Defs>
          <Rect
            x={0}
            y={0}
            width={BAR_WIDTH}
            height={BAR_HEIGHT}
            rx={BAR_HEIGHT / 2}
            fill="url(#prediscoreGradient)"
          />
        </Svg>
        <View style={[styles.cursor, { left: cursorLeft }]} />
      </View>

      <View style={styles.labelsRow}>
        <Text style={[styles.label, styles.labelLeft]}>Mytho</Text>
        <View style={styles.labelRightBlock}>
          <Text style={[styles.label, styles.labelRight]}>J’ai raison.</Text>
          <Text style={[styles.label, styles.labelRight]}>Toujours.</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', width: BAR_WIDTH },
  emptyText: {
    fontSize: 13,
    color: colors.textFaint,
    textAlign: 'center',
    lineHeight: 19,
    paddingVertical: 8,
  },
  scoreValue: {
    fontFamily: 'InstrumentSerif_400Regular',
    fontSize: 34,
    color: colors.text,
    marginBottom: 10,
  },
  barBox: { width: BAR_WIDTH, height: BAR_HEIGHT, justifyContent: 'center' },
  cursor: {
    position: 'absolute',
    top: -(CURSOR_SIZE - BAR_HEIGHT) / 2,
    width: CURSOR_SIZE,
    height: CURSOR_SIZE,
    borderRadius: CURSOR_SIZE / 2,
    backgroundColor: colors.surface,
    borderWidth: 3,
    borderColor: colors.text,
  },
  labelsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: BAR_WIDTH,
    marginTop: 10,
  },
  label: { fontSize: 11, fontWeight: '700', color: colors.textFaint },
  labelLeft: { color: colors.danger },
  labelRightBlock: { alignItems: 'flex-end' },
  labelRight: { color: colors.success, textAlign: 'right' },
});
