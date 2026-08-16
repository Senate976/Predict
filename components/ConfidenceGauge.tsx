import { LinearGradient } from 'expo-linear-gradient';
import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

import { radius, wax, type Colors } from '../lib/theme';
import { useColors } from '../lib/themeMode';

/** Diamètre du curseur — partagé par la carte et l'écran détail, pour un
 * rendu identique aux deux endroits. */
const CURSOR_SIZE = 13;

/**
 * Le trait parchemin → tan → bordeaux surmonté du curseur en forme de petit
 * cachet de cire qui marque le pourcentage de confiance — même rendu que le
 * Prediscore du Profil (`PrediscoreGauge`). Purement visuel : le libellé
 * chiffré reste à la charge de l'appelant (carte et écran détail l'affichent
 * différemment).
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
        <LinearGradient colors={wax} start={{ x: 0.25, y: 0.15 }} end={{ x: 0.85, y: 1 }} style={styles.cursor} />
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
    // Blob irrégulier plutôt qu'un rond plat, comme le cachet principal
    // (`PredictionSeal`) — même asymétrie de coins, miniaturisée.
    cursor: {
      width: '100%',
      height: '100%',
      borderRadius: 999,
      borderTopLeftRadius: CURSOR_SIZE * 0.42,
      borderBottomRightRadius: CURSOR_SIZE * 0.4,
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
