import { useEffect, useRef } from 'react';
import { Animated, Easing, Modal, StyleSheet, Text, View } from 'react-native';

import { colors } from '../lib/theme';

type Props = {
  visible: boolean;
  onFinish: () => void;
};

/** Durée totale à l'écran, apparition et disparition comprises. */
const DISPLAY_MS = 1400;
const SEAL_SIZE = 110;

/**
 * Sceau doré affiché en plein écran juste après l'enregistrement d'une
 * prédiction : confirme visuellement qu'elle est scellée avant de revenir à
 * l'accueil. Purement décoratif, ne bloque rien côté données — le contenu est
 * déjà en base quand ce composant apparaît.
 */
export function PredictionSeal({ visible, onFinish }: Props) {
  const scale = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!visible) return;

    scale.setValue(0);
    opacity.setValue(0);

    const animation = Animated.sequence([
      Animated.parallel([
        Animated.spring(scale, {
          toValue: 1,
          friction: 5,
          tension: 60,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: 200,
          easing: Easing.out(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
      Animated.delay(DISPLAY_MS - 500),
      Animated.timing(opacity, { toValue: 0, duration: 300, useNativeDriver: true }),
    ]);

    animation.start(({ finished }) => {
      if (finished) onFinish();
    });

    return () => animation.stop();
  }, [visible, scale, opacity, onFinish]);

  if (!visible) return null;

  return (
    <Modal transparent animationType="none" visible={visible}>
      <View style={styles.backdrop}>
        <Animated.View style={[styles.seal, { transform: [{ scale }], opacity }]}>
          <View style={styles.ring}>
            <Text style={styles.check}>✓</Text>
          </View>
          <Text style={styles.label}>Prédiction scellée</Text>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(10, 10, 12, 0.88)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  seal: { alignItems: 'center' },
  ring: {
    width: SEAL_SIZE,
    height: SEAL_SIZE,
    borderRadius: SEAL_SIZE / 2,
    borderWidth: 3,
    borderColor: colors.gold,
    backgroundColor: colors.goldSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 18,
  },
  check: { fontSize: 44, color: colors.gold, fontWeight: '700' },
  label: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.gold,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
});
