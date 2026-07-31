import { useEffect, useRef } from 'react';
import { Animated, Easing, Modal, StyleSheet, Text, View } from 'react-native';

import { colors, fonts } from '../lib/theme';

type Props = {
  visible: boolean;
  onFinish: () => void;
};

const PARCHMENT_WIDTH = 190;
const PARCHMENT_HEIGHT = 64;
const SEAL_SIZE = 92;

/**
 * Animation jouée juste après l'enregistrement d'une prédiction : le
 * parchemin s'enroule, puis un cachet de cire vient le sceller. Purement
 * décoratif — le contenu est déjà en base quand ce composant apparaît, rien
 * ici ne conditionne l'écriture des données.
 */
export function PredictionSeal({ visible, onFinish }: Props) {
  const overlayOpacity = useRef(new Animated.Value(0)).current;
  const parchmentScaleY = useRef(new Animated.Value(1)).current;
  const sealDrop = useRef(new Animated.Value(0)).current;
  const sealPulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!visible) return;

    overlayOpacity.setValue(0);
    parchmentScaleY.setValue(1);
    sealDrop.setValue(0);
    sealPulse.setValue(0);

    const animation = Animated.sequence([
      Animated.timing(overlayOpacity, {
        toValue: 1,
        duration: 180,
        useNativeDriver: true,
      }),
      Animated.parallel([
        // Le parchemin s'enroule sur lui-même.
        Animated.timing(parchmentScaleY, {
          toValue: 0.22,
          duration: 520,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        // Le cachet tombe et vient sceller, avec un léger retard pour arriver
        // une fois le parchemin presque roulé.
        Animated.sequence([
          Animated.delay(280),
          Animated.spring(sealDrop, {
            toValue: 1,
            friction: 6,
            tension: 80,
            useNativeDriver: true,
          }),
        ]),
      ]),
      // Petit impact du cachet contre la cire.
      Animated.sequence([
        Animated.timing(sealPulse, { toValue: 1, duration: 90, useNativeDriver: true }),
        Animated.timing(sealPulse, { toValue: 0, duration: 140, useNativeDriver: true }),
      ]),
      Animated.delay(650),
      Animated.timing(overlayOpacity, { toValue: 0, duration: 300, useNativeDriver: true }),
    ]);

    animation.start(({ finished }) => {
      if (finished) onFinish();
    });

    return () => animation.stop();
  }, [visible, overlayOpacity, parchmentScaleY, sealDrop, sealPulse, onFinish]);

  if (!visible) return null;

  const sealTranslateY = sealDrop.interpolate({ inputRange: [0, 1], outputRange: [-90, 0] });
  const sealDropScale = sealDrop.interpolate({ inputRange: [0, 1], outputRange: [1.6, 1] });
  const sealPulseScale = sealPulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.08] });

  return (
    <Modal transparent animationType="none" visible={visible}>
      <Animated.View style={[styles.backdrop, { opacity: overlayOpacity }]}>
        <View style={styles.stage}>
          <Animated.View
            style={[styles.parchment, { transform: [{ scaleY: parchmentScaleY }] }]}
          />

          <Animated.View
            style={[
              styles.seal,
              {
                opacity: sealDrop,
                transform: [
                  { translateY: sealTranslateY },
                  { scale: Animated.multiply(sealDropScale, sealPulseScale) },
                ],
              },
            ]}
          >
            <View style={styles.sealRim}>
              <Text style={styles.sealEmblem}>P</Text>
            </View>
          </Animated.View>
        </View>

        <Text style={styles.label}>Prédiction scellée</Text>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(250, 248, 243, 0.94)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stage: {
    width: PARCHMENT_WIDTH,
    height: SEAL_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  parchment: {
    position: 'absolute',
    width: PARCHMENT_WIDTH,
    height: PARCHMENT_HEIGHT,
    borderRadius: 10,
    backgroundColor: '#EDE3CC',
    borderWidth: 1,
    borderColor: '#D9C9A3',
  },
  seal: {
    position: 'absolute',
    width: SEAL_SIZE,
    height: SEAL_SIZE,
    borderRadius: SEAL_SIZE / 2,
    backgroundColor: colors.wax,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 6,
  },
  sealRim: {
    width: SEAL_SIZE - 16,
    height: SEAL_SIZE - 16,
    borderRadius: (SEAL_SIZE - 16) / 2,
    borderWidth: 1.5,
    borderColor: colors.waxDark,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sealEmblem: {
    fontFamily: fonts.serif,
    fontSize: 36,
    color: '#D8B876',
  },
  label: {
    fontFamily: fonts.serif,
    fontSize: 18,
    color: colors.wax,
    marginTop: 28,
  },
});
