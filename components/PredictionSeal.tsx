import { useEffect, useRef } from 'react';
import { Animated, Modal, StyleSheet } from 'react-native';
import { Text } from './Text';

import { fonts } from '../lib/theme';
import { PredictBadge } from './EnvelopeArt';
import { PredictWord } from './PredictWord';

type Props = {
  visible: boolean;
  onFinish: () => void;
  /** « P » pour une Déclaration (`predict scellé.png`), « ? » pour un Sondage
   * (`precit sondage.png` — seul le glyphe change entre les deux maquettes). */
  glyph?: 'P' | '?';
};

const BADGE_SIZE = 112;

/**
 * Animation jouée juste après l'enregistrement d'une prédiction : le badge
 * doré de la charte tombe et vient se poser, avec un léger tassement à
 * l'impact. Purement décoratif — le contenu est déjà en base quand ce
 * composant apparaît, rien ici ne conditionne l'écriture des données.
 */
export function PredictionSeal({ visible, onFinish, glyph = 'P' }: Props) {
  const overlayOpacity = useRef(new Animated.Value(0)).current;
  const drop = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(0)).current;

  /* `onFinish` est presque toujours écrit en ligne par l'appelant
     (`onFinish={() => router.back()}`), donc c'est une NOUVELLE fonction à
     chaque rendu du parent. Le laisser dans les dépendances de l'effet
     relançait l'animation depuis zéro à chaque re-rendu : un parent qui se
     re-rend pendant les 2,3 s de l'animation la redémarrait indéfiniment,
     `onFinish` n'était jamais appelé, et l'écran restait figé sur place —
     c'est très exactement ce qui se passait après « Sceller le Predict ».

     La fonction passe donc par une référence, que l'effet lit au moment de
     rappeler l'appelant. L'effet ne dépend plus que de `visible` : il démarre
     l'animation une fois, et la laisse finir. */
  const onFinishRef = useRef(onFinish);
  onFinishRef.current = onFinish;

  useEffect(() => {
    if (!visible) return;

    overlayOpacity.setValue(0);
    drop.setValue(0);
    pulse.setValue(0);

    const animation = Animated.sequence([
      Animated.timing(overlayOpacity, { toValue: 1, duration: 220, useNativeDriver: true }),
      Animated.spring(drop, { toValue: 1, friction: 7, tension: 60, useNativeDriver: true }),
      // Léger écrasement à l'impact, puis retour.
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 100, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 200, useNativeDriver: true }),
      ]),
      Animated.delay(750),
      Animated.timing(overlayOpacity, { toValue: 0, duration: 320, useNativeDriver: true }),
    ]);

    animation.start(({ finished }) => {
      if (finished) onFinishRef.current();
    });

    return () => animation.stop();
  }, [visible, overlayOpacity, drop, pulse]);

  if (!visible) return null;

  const translateY = drop.interpolate({ inputRange: [0, 1], outputRange: [-140, 0] });
  const dropScale = drop.interpolate({ inputRange: [0, 1], outputRange: [1.4, 1] });
  const pulseX = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.08] });
  const pulseY = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 0.92] });

  return (
    <Modal transparent animationType="none" visible={visible}>
      <Animated.View style={[styles.backdrop, { opacity: overlayOpacity }]}>
        <Animated.View
          style={{
            opacity: drop,
            transform: [
              { translateY },
              { scaleX: Animated.multiply(dropScale, pulseX) },
              { scaleY: Animated.multiply(dropScale, pulseY) },
            ],
          }}
        >
          <PredictBadge glyph={glyph} size={BADGE_SIZE} />
        </Animated.View>

        <Text style={styles.label}>
          <PredictWord /> scellé
        </Text>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  // Le fond sombre de la charte, opacifié — plus le brun de l'ancienne charte.
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(28, 39, 55, 0.95)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontFamily: fonts.bodyEmphasis,
    fontSize: 17,
    color: '#f9fcfe',
    marginTop: 30,
    letterSpacing: 0.5,
  },
});
