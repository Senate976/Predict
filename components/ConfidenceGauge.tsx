import { LinearGradient } from 'expo-linear-gradient';
import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

import { radius, type Colors } from '../lib/theme';
import { useColors } from '../lib/themeMode';

/** Diamètre du curseur — partagé par la carte et l'écran détail, pour un
 * rendu identique aux deux endroits. */
const CURSOR_SIZE = 12;

/**
 * Le trait noir → ambre → jaune surmonté du curseur (blanc, bord noir) qui
 * marque le pourcentage de confiance — même rendu que le Prediscore du
 * Profil. Purement visuel : le libellé chiffré reste à la charge de l'appelant
 * (carte et écran détail l'affichent différemment).
 */
export function ConfidenceGauge({ belief }: { belief: number }) {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <View style={styles.track}>
      <LinearGradient
        colors={[colors.textFaint, colors.goldTransition, colors.gold]}
        locations={[0, 0.5, 1]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={styles.trackLine}
      />
      <View style={[styles.cursor, { left: `${belief}%`, marginLeft: -CURSOR_SIZE / 2 }]} />
    </View>
  );
}

function createStyles(colors: Colors) {
  return StyleSheet.create({
    track: { height: CURSOR_SIZE, justifyContent: 'center' },
    trackLine: { height: 3, borderRadius: radius.pill, overflow: 'hidden' },
    cursor: {
      position: 'absolute',
      width: CURSOR_SIZE,
      height: CURSOR_SIZE,
      borderRadius: CURSOR_SIZE / 2,
      backgroundColor: colors.surface,
      borderWidth: 2,
      borderColor: colors.text,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.25,
      shadowRadius: 2,
      elevation: 2,
    },
  });
}
