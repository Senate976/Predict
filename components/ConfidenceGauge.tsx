import { LinearGradient } from 'expo-linear-gradient';
import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

import { radius, type Colors } from '../lib/theme';
import { useColors } from '../lib/themeMode';

/** Diamètre du curseur — partagé par la carte et l'écran détail, pour un
 * rendu identique aux deux endroits. */
const CURSOR_SIZE = 13;

/**
 * Le trait bleu clair → jaune surmonté du curseur qui marque le pourcentage de
 * confiance — même rendu que le Prediscore du Profil (`PrediscoreGauge`). Le
 * curseur est le badge de la charte réduit à son disque doré : à 13 px, sa
 * dentelure et son glyphe ne seraient qu'un brouillage. Purement visuel : le
 * libellé chiffré reste à la charge de l'appelant.
 */
export function ConfidenceGauge({ belief }: { belief: number }) {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <View style={styles.track}>
      <LinearGradient
        colors={[colors.textFaint, colors.accentTransition, colors.accent]}
        locations={[0, 0.5, 1]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={styles.trackLine}
      />
      <View style={[styles.cursorWrap, { left: `${belief}%`, marginLeft: -CURSOR_SIZE / 2 }]}>
        <View style={styles.cursor} />
      </View>
    </View>
  );
}

function createStyles(colors: Colors) {
  return StyleSheet.create({
    track: { height: CURSOR_SIZE, justifyContent: 'center' },
    trackLine: { height: 3, borderRadius: radius.pill, overflow: 'hidden' },
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
