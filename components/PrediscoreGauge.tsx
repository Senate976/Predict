import Svg, { Defs, LinearGradient as SvgLinearGradient, Rect, Stop } from 'react-native-svg';
import { useMemo, useState } from 'react';
import { LayoutChangeEvent, StyleSheet, View } from 'react-native';
import { Text } from './Text';

import { eyebrow, fonts, type Colors } from '../lib/theme';
import { useColors } from '../lib/themeMode';

const BAR_HEIGHT = 6;
const CURSOR_SIZE = 15;

/**
 * Jauge horizontale du Prediscore — dégradé bleu clair → jaune, avec un
 * curseur rond doré positionné au score actuel. Largeur fluide (mesurée via
 * `onLayout`, pas de valeur fixe) : le Profil l'affiche sur 50% de la largeur
 * de l'écran, une autre valeur ailleurs resterait correcte. `score` est
 * `null` tant qu'aucune prédiction révélée n'existe encore : affiche alors un
 * état vide plutôt qu'une jauge à 0%, pour ne pas laisser croire à un mauvais
 * score qui n'existe pas encore.
 */
export function PrediscoreGauge({
  score,
  emptyMessage = 'Ton Prediscore apparaîtra après ton premier Predict révélé.',
}: {
  score: number | null;
  /** Le texte par défaut suppose qu'on regarde son propre profil — sur le
   * profil d'un ami, l'écran appelant doit passer un message à la 3e
   * personne, sans quoi « Ton Prediscore… » n'a aucun sens affiché là. */
  emptyMessage?: string;
}) {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [barWidth, setBarWidth] = useState(0);

  function handleLayout(e: LayoutChangeEvent) {
    setBarWidth(e.nativeEvent.layout.width);
  }

  if (score === null) {
    return (
      <View style={styles.wrap}>
        <Text style={styles.emptyText}>{emptyMessage}</Text>
      </View>
    );
  }

  const clamped = Math.max(0, Math.min(100, score));
  const cursorLeft = (clamped / 100) * barWidth - CURSOR_SIZE / 2;

  return (
    <View style={styles.wrap}>
      <View style={styles.headerRow}>
        <Text style={styles.scoreLabel}>Prediscore</Text>
        <Text style={styles.scoreValue}>{clamped}%</Text>
      </View>

      <View style={styles.barBox} onLayout={handleLayout}>
        {barWidth > 0 && (
          <>
            <Svg width={barWidth} height={BAR_HEIGHT}>
              <Defs>
                <SvgLinearGradient id="prediscoreGradient" x1="0" y1="0" x2="1" y2="0">
                  <Stop offset="0" stopColor="#c9dfe3" />
                  <Stop offset="0.5" stopColor={colors.accentTransition} />
                  <Stop offset="1" stopColor={colors.accent} />
                </SvgLinearGradient>
              </Defs>
              <Rect
                x={0}
                y={0}
                width={barWidth}
                height={BAR_HEIGHT}
                rx={BAR_HEIGHT / 2}
                fill="url(#prediscoreGradient)"
              />
            </Svg>
            <View style={[styles.cursorWrap, { left: cursorLeft }]}>
              <View style={styles.cursor} />
            </View>
          </>
        )}
      </View>
    </View>
  );
}

function createStyles(colors: Colors) {
  return StyleSheet.create({
    wrap: { width: '100%' },
    emptyText: {
      fontSize: 13,
      color: colors.textFaint,
      textAlign: 'center',
      lineHeight: 19,
      paddingVertical: 8,
    },
    headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 },
    scoreLabel: eyebrow(colors),
    scoreValue: { fontFamily: fonts.bodyEmphasis, fontSize: 16, color: colors.text },
    barBox: { width: '100%', height: CURSOR_SIZE, justifyContent: 'center' },
    cursorWrap: {
      position: 'absolute',
      width: CURSOR_SIZE,
      height: CURSOR_SIZE,
    },
    cursor: {
      width: '100%',
      height: '100%',
      borderRadius: 999,
      backgroundColor: colors.accent,
      borderWidth: 2,
      borderColor: colors.surface,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.3,
      shadowRadius: 2,
      elevation: 2,
    },
  });
}
