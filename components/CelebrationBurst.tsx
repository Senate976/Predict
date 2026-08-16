import { useEffect, useMemo, useRef, type ReactNode } from 'react';
import { Animated, Dimensions, Modal, StyleSheet, View } from 'react-native';
import { Text } from './Text';

import { fonts, radius, type Colors } from '../lib/theme';
import { useColors } from '../lib/themeMode';
import { PredictWord } from './PredictWord';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const PARTICLE_COUNT = 160;
const HOLD_MS = 3000;
const GOLD_TONES = ['#eca835', '#f3be5e', '#7ab8c2'];

type Particle = {
  left: number;
  size: number;
  delayMs: number;
  durationMs: number;
  drift: number;
  color: string;
};

function makeParticles(): Particle[] {
  return Array.from({ length: PARTICLE_COUNT }, () => ({
    left: Math.random() * 100,
    size: 3 + Math.random() * 6,
    delayMs: Math.random() * 900,
    durationMs: 1500 + Math.random() * 1100,
    drift: (Math.random() - 0.5) * 100,
    color: GOLD_TONES[Math.floor(Math.random() * GOLD_TONES.length)],
  }));
}

type Props = {
  visible: boolean;
  message?: ReactNode;
  onFinish: () => void;
};

/**
 * Célébration jouée quand une prédiction bascule sur « Réalisée » : une
 * poussière d'or balaie l'écran de bas en haut, et un message éphémère
 * s'affiche par-dessus. Purement décoratif — la notification qui déclenche
 * cet écran est déjà marquée lue au moment où il apparaît.
 */
export function CelebrationBurst({
  visible,
  message = (
    <>
      <PredictWord /> approuvé par vos pairs !
    </>
  ),
  onFinish,
}: Props) {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const particles = useMemo(() => (visible ? makeParticles() : []), [visible]);
  const values = useRef<Animated.Value[]>([]).current;
  if (values.length !== particles.length) {
    values.length = 0;
    particles.forEach(() => values.push(new Animated.Value(0)));
  }
  const messageOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!visible) return;
    values.forEach((v) => v.setValue(0));
    messageOpacity.setValue(0);

    const particleAnims = particles.map((p, i) =>
      Animated.sequence([
        Animated.delay(p.delayMs),
        Animated.timing(values[i], { toValue: 1, duration: p.durationMs, useNativeDriver: true }),
      ])
    );

    const messageAnim = Animated.sequence([
      Animated.timing(messageOpacity, { toValue: 1, duration: 350, useNativeDriver: true }),
      Animated.delay(Math.max(0, HOLD_MS - 900)),
      Animated.timing(messageOpacity, { toValue: 0, duration: 400, useNativeDriver: true }),
    ]);

    const all = Animated.parallel([...particleAnims, messageAnim]);
    all.start();
    const timer = setTimeout(onFinish, HOLD_MS);

    return () => {
      clearTimeout(timer);
      all.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  if (!visible) return null;

  return (
    <Modal transparent animationType="none" visible={visible}>
      <View style={styles.overlay} pointerEvents="none">
        {particles.map((p, i) => {
          const translateY = values[i].interpolate({
            inputRange: [0, 1],
            outputRange: [0, -SCREEN_HEIGHT * 0.85],
          });
          const translateX = values[i].interpolate({ inputRange: [0, 1], outputRange: [0, p.drift] });
          const opacity = values[i].interpolate({
            inputRange: [0, 0.15, 0.75, 1],
            outputRange: [0, 1, 1, 0],
          });
          return (
            <Animated.View
              key={i}
              style={[
                styles.particle,
                {
                  left: `${p.left}%`,
                  width: p.size,
                  height: p.size,
                  borderRadius: p.size / 2,
                  backgroundColor: p.color,
                  opacity,
                  transform: [{ translateY }, { translateX }],
                },
              ]}
            />
          );
        })}

        <Animated.View style={[styles.messageBox, { opacity: messageOpacity }]}>
          <Text style={styles.message}>{message}</Text>
        </Animated.View>
      </View>
    </Modal>
  );
}

function createStyles(colors: Colors) {
  return StyleSheet.create({
    overlay: { flex: 1 },
    particle: { position: 'absolute', bottom: 0 },
    messageBox: {
      position: 'absolute',
      top: '42%',
      left: 24,
      right: 24,
      alignItems: 'center',
      backgroundColor: colors.surfaceRaised,
      borderRadius: radius.xl,
      paddingVertical: 20,
      paddingHorizontal: 24,
      borderWidth: 1,
      borderColor: colors.border,
    },
    message: {
      fontFamily: fonts.bodyEmphasis,
      fontSize: 22,
      color: colors.text,
      textAlign: 'center',
    },
  });
}
