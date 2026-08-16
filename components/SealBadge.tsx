import { StyleSheet, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { Text } from './Text';

import { fonts } from '../lib/theme';
import { useColors } from '../lib/themeMode';

type Props = {
  /** « P » pour un Predict scellé (`predict scellé.png`), « ? » pour un
   * Predict en mode Sondage (`precit sondage.png`). */
  glyph?: 'P' | '?';
  size?: number;
};

/**
 * Badge doré de la charte « Predict » — cercle plein jaune de marque, cerclé
 * d'un anneau perforé façon timbre, glyphe centré. Posé à la pointe du rabat
 * de l'enveloppe (`PredictionCard`) ou au centre de l'animation
 * post-création (`PredictionSeal`) — un seul composant partagé pour que le
 * badge reste identique aux deux endroits.
 */
export function SealBadge({ glyph = 'P', size = 64 }: Props) {
  const colors = useColors();
  const r = size / 2;
  const dashUnit = (2 * Math.PI * (r - 2.5)) / 22;

  return (
    <View
      style={{
        width: size,
        height: size,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.22,
        shadowRadius: 5,
        elevation: 5,
      }}
    >
      <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <Circle cx={r} cy={r} r={r - 1} fill={colors.accent} />
        <Circle
          cx={r}
          cy={r}
          r={r - 2.5}
          fill="none"
          stroke={colors.textOnAccent}
          strokeOpacity={0.3}
          strokeWidth={1.2}
          strokeDasharray={`${dashUnit * 0.55} ${dashUnit * 0.45}`}
        />
      </Svg>
      <View style={styles.glyphSlot}>
        <Text style={[styles.glyph, { color: colors.textOnAccent, fontSize: size * 0.42 }]}>{glyph}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  glyphSlot: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
  glyph: { fontFamily: fonts.display },
});
