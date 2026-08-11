import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useRef } from 'react';
import { Animated, Modal, StyleSheet, View } from 'react-native';
import { Text } from './Text';

import { fonts, wax } from '../lib/theme';
import { PredictWord } from './PredictWord';

type Props = {
  visible: boolean;
  onFinish: () => void;
};

const RIBBON_WIDTH = 200;
const RIBBON_HEIGHT = 40;
const SEAL_SIZE = 96;
const EMBLEM_SIZE = SEAL_SIZE - 22;

/**
 * Animation jouée juste après l'enregistrement d'une prédiction : un lien de
 * cuir s'enroule, puis un cachet de cire vient le sceller — empreinte gravée,
 * reflet de cire fondue, quelques coulures. Purement décoratif : le contenu
 * est déjà en base quand ce composant apparaît, rien ici ne conditionne
 * l'écriture des données.
 */
export function PredictionSeal({ visible, onFinish }: Props) {
  const overlayOpacity = useRef(new Animated.Value(0)).current;
  const ribbonScaleY = useRef(new Animated.Value(1)).current;
  const sealDrop = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!visible) return;

    overlayOpacity.setValue(0);
    ribbonScaleY.setValue(1);
    sealDrop.setValue(0);
    pulse.setValue(0);

    const animation = Animated.sequence([
      Animated.timing(overlayOpacity, {
        toValue: 1,
        duration: 220,
        useNativeDriver: true,
      }),
      Animated.parallel([
        // Le lien de cuir s'enroule sur lui-même.
        Animated.timing(ribbonScaleY, {
          toValue: 0.3,
          duration: 550,
          useNativeDriver: true,
        }),
        // Le cachet tombe et vient sceller — retard pour arriver une fois le
        // lien presque enroulé, ressort lourd pour un geste posé, pas vif.
        Animated.sequence([
          Animated.delay(320),
          Animated.spring(sealDrop, {
            toValue: 1,
            friction: 7,
            tension: 55,
            useNativeDriver: true,
          }),
        ]),
      ]),
      // Écrasement léger de la cire sous l'impact du cachet.
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 110, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 220, useNativeDriver: true }),
      ]),
      Animated.delay(750),
      Animated.timing(overlayOpacity, { toValue: 0, duration: 320, useNativeDriver: true }),
    ]);

    animation.start(({ finished }) => {
      if (finished) onFinish();
    });

    return () => animation.stop();
  }, [visible, overlayOpacity, ribbonScaleY, sealDrop, pulse, onFinish]);

  if (!visible) return null;

  const sealTranslateY = sealDrop.interpolate({ inputRange: [0, 1], outputRange: [-100, 0] });
  const sealDropScale = sealDrop.interpolate({ inputRange: [0, 1], outputRange: [1.7, 1] });
  const sealWobble = sealDrop.interpolate({ inputRange: [0, 1], outputRange: ['-10deg', '0deg'] });
  const pulseScaleX = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.08] });
  const pulseScaleY = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 0.92] });

  return (
    <Modal transparent animationType="none" visible={visible}>
      <Animated.View style={[styles.backdrop, { opacity: overlayOpacity }]}>
        <View style={styles.stage}>
          <Animated.View style={[styles.ribbon, { transform: [{ scaleY: ribbonScaleY }] }]}>
            <LinearGradient
              colors={['#4A3524', '#20130C']}
              start={{ x: 0.1, y: 0 }}
              end={{ x: 0.9, y: 1 }}
              style={StyleSheet.absoluteFill}
            />
            <View style={styles.ribbonSheen} />
          </Animated.View>

          <Animated.View
            style={[
              styles.sealWrap,
              {
                opacity: sealDrop,
                transform: [
                  { translateY: sealTranslateY },
                  { rotate: sealWobble },
                  { scaleX: Animated.multiply(sealDropScale, pulseScaleX) },
                  { scaleY: Animated.multiply(sealDropScale, pulseScaleY) },
                ],
              },
            ]}
          >
            <View style={styles.sealShadowRing} />

            <View style={[styles.drip, styles.drip1]} />
            <View style={[styles.drip, styles.drip2]} />
            <View style={[styles.drip, styles.drip3]} />

            <LinearGradient
              colors={wax}
              start={{ x: 0.22, y: 0.1 }}
              end={{ x: 0.85, y: 1 }}
              style={styles.sealBase}
            >
              <View style={styles.sealHighlight} />

              <View style={styles.emblemRing}>
                <View style={[styles.ornament, styles.ornamentTop]} />
                <View style={[styles.ornament, styles.ornamentLeft]} />
                <View style={[styles.ornament, styles.ornamentRight]} />
                <Text style={[styles.emblem, styles.emblemShadow]}>P</Text>
                <Text style={styles.emblem}>P</Text>
              </View>
            </LinearGradient>
          </Animated.View>
        </View>

        <Text style={styles.label}>
          <PredictWord /> scellé
        </Text>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(16, 11, 8, 0.95)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stage: {
    width: RIBBON_WIDTH,
    height: SEAL_SIZE + 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ribbon: {
    position: 'absolute',
    width: RIBBON_WIDTH,
    height: RIBBON_HEIGHT,
    borderRadius: RIBBON_HEIGHT / 2,
    overflow: 'hidden',
  },
  ribbonSheen: {
    position: 'absolute',
    top: 6,
    left: -20,
    width: RIBBON_WIDTH + 40,
    height: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.07)',
    transform: [{ rotate: '-16deg' }],
  },
  sealWrap: {
    position: 'absolute',
    width: SEAL_SIZE,
    height: SEAL_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sealShadowRing: {
    position: 'absolute',
    width: SEAL_SIZE + 8,
    height: SEAL_SIZE + 8,
    borderRadius: (SEAL_SIZE + 8) / 2,
    backgroundColor: wax[3],
    top: 5,
  },
  drip: {
    position: 'absolute',
    borderRadius: 999,
    backgroundColor: wax[2],
  },
  drip1: { width: 18, height: 16, bottom: -6, left: 12 },
  drip2: { width: 13, height: 12, bottom: -8, left: 42 },
  drip3: { width: 15, height: 14, bottom: -5, right: 10 },
  sealBase: {
    width: SEAL_SIZE,
    height: SEAL_SIZE,
    borderRadius: SEAL_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 8,
  },
  sealHighlight: {
    position: 'absolute',
    width: 30,
    height: 14,
    borderRadius: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.22)',
    top: 12,
    left: 16,
    transform: [{ rotate: '-28deg' }],
  },
  emblemRing: {
    width: EMBLEM_SIZE,
    height: EMBLEM_SIZE,
    borderRadius: EMBLEM_SIZE / 2,
    borderWidth: 1,
    borderColor: 'rgba(201, 166, 107, 0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ornament: {
    position: 'absolute',
    width: 3,
    height: 3,
    borderRadius: 2,
    backgroundColor: 'rgba(201, 166, 107, 0.6)',
  },
  ornamentTop: { top: 6 },
  ornamentLeft: { left: 8, top: '48%' },
  ornamentRight: { right: 8, top: '48%' },
  emblem: {
    fontFamily: fonts.display,
    fontSize: 34,
    color: '#C9A66B',
  },
  emblemShadow: {
    position: 'absolute',
    top: 1.5,
    left: 1,
    color: '#2E0A10',
    opacity: 0.55,
  },
  label: {
    fontFamily: fonts.bodyEmphasis,
    fontSize: 17,
    color: '#D8C6A1',
    marginTop: 30,
    letterSpacing: 0.5,
  },
});
