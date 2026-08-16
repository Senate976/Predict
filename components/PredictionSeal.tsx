import { useEffect, useRef } from 'react';
import { Animated, Modal, StyleSheet } from 'react-native';
import { Text } from './Text';

import { fonts } from '../lib/theme';
import { PredictWord } from './PredictWord';
import { SealBadge } from './SealBadge';

type Props = {
  visible: boolean;
  onFinish: () => void;
  /** « P » pour un Predict scellé (défaut, `predict scellé.png`), « ? » pour
   * un Predict en mode Sondage (`precit sondage.png`). */
  glyph?: 'P' | '?';
};

const SEAL_SIZE = 112;

/**
 * Animation jouée juste après l'enregistrement d'une prédiction : le badge
 * doré tombe et vient se poser d'un geste net, avec un léger rebond.
 * Purement décoratif : le contenu est déjà en base quand ce composant
 * apparaît, rien ici ne conditionne l'écriture des données.
 */
export function PredictionSeal({ visible, onFinish, glyph = 'P' }: Props) {
  const overlayOpacity = useRef(new Animated.Value(0)).current;
  const sealDrop = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!visible) return;

    overlayOpacity.setValue(0);
    sealDrop.setValue(0);
    pulse.setValue(0);

    const animation = Animated.sequence([
      Animated.timing(overlayOpacity, {
        toValue: 1,
        duration: 220,
        useNativeDriver: true,
      }),
      // Le badge tombe et vient se poser — ressort assez vif pour un geste
      // net, sans être brutal.
      Animated.spring(sealDrop, {
        toValue: 1,
        friction: 7,
        tension: 60,
        useNativeDriver: true,
      }),
      // Léger tassement à l'impact.
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 100, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 200, useNativeDriver: true }),
      ]),
      Animated.delay(750),
      Animated.timing(overlayOpacity, { toValue: 0, duration: 320, useNativeDriver: true }),
    ]);

    animation.start(({ finished }) => {
      if (finished) onFinish();
    });

    return () => animation.stop();
  }, [visible, overlayOpacity, sealDrop, pulse, onFinish]);

  if (!visible) return null;

  const sealTranslateY = sealDrop.interpolate({ inputRange: [0, 1], outputRange: [-140, 0] });
  const sealDropScale = sealDrop.interpolate({ inputRange: [0, 1], outputRange: [1.4, 1] });
  const pulseScaleX = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.08] });
  const pulseScaleY = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 0.92] });

  return (
    <Modal transparent animationType="none" visible={visible}>
      <Animated.View style={[styles.backdrop, { opacity: overlayOpacity }]}>
        <Animated.View
          style={[
            styles.sealWrap,
            {
              opacity: sealDrop,
              transform: [
                { translateY: sealTranslateY },
                { scaleX: Animated.multiply(sealDropScale, pulseScaleX) },
                { scaleY: Animated.multiply(sealDropScale, pulseScaleY) },
              ],
            },
          ]}
        >
          <SealBadge glyph={glyph} size={SEAL_SIZE} />
        </Animated.View>

        <Text style={styles.label}>
          <PredictWord /> {glyph === '?' ? 'publié' : 'scellé'}
        </Text>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(28, 39, 55, 0.94)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sealWrap: { alignItems: 'center', justifyContent: 'center' },
  label: {
    fontFamily: fonts.bodyEmphasis,
    fontSize: 17,
    color: '#f9fcfe',
    marginTop: 30,
    letterSpacing: 0.5,
  },
});
