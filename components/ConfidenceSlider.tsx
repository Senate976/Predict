import { LinearGradient } from 'expo-linear-gradient';
import { useRef, useState } from 'react';
import { PanResponder, Pressable, StyleSheet, View } from 'react-native';
import { Text } from './Text';

import { colors, radius } from '../lib/theme';

const THUMB_SIZE = 28;
const TRACK_HEIGHT = 8;

/**
 * Vote de confiance tactile (0 à 100%) — remplace, pour tous les types de
 * prédiction, l'ancien choix binaire (réalisée/manquée, j'y crois/j'y crois
 * pas). Glisser le pouce le long du dégradé noir → jaune pose la valeur en
 * direct ; il faut ensuite confirmer explicitement pour poser le vote (pas
 * de vote accidentel en relâchant le doigt).
 */
export function ConfidenceSlider({
  initialValue = 50,
  onSubmit,
  submitting = false,
  submitLabel = 'Voter',
}: {
  initialValue?: number;
  onSubmit: (value: number) => void;
  submitting?: boolean;
  submitLabel?: string;
}) {
  const [value, setValue] = useState(initialValue);
  const trackWidthRef = useRef(0);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderMove: (_evt, gesture) => {
        const width = trackWidthRef.current;
        if (!width) return;
        // `gesture.moveX` est en coordonnées écran — comme le geste démarre
        // toujours sur la piste elle-même, `dx` cumulé depuis le point de
        // départ suffit à retrouver une position relative sans avoir à
        // mesurer la position absolue de la piste.
        setValue((prev) => {
          const startRatio = prev / 100;
          const startX = startRatio * width;
          const nextX = Math.min(width, Math.max(0, startX + gesture.dx));
          return Math.round((nextX / width) * 100);
        });
      },
    })
  ).current;

  return (
    <View style={styles.wrap}>
      <View
        style={[styles.labelRow, { justifyContent: value < 35 ? 'flex-start' : value > 65 ? 'flex-end' : 'center' }]}
      >
        <Text style={styles.label}>{value}% confiant</Text>
      </View>

      <View
        style={styles.track}
        onLayout={(e) => {
          trackWidthRef.current = e.nativeEvent.layout.width;
        }}
        {...panResponder.panHandlers}
      >
        <LinearGradient
          colors={[colors.text, colors.goldTransition, colors.gold]}
          locations={[0, 0.5, 1]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.trackLine}
        />
        <View
          style={[styles.thumb, { left: `${value}%`, marginLeft: -THUMB_SIZE / 2 }]}
        />
      </View>

      <Pressable
        onPress={() => onSubmit(value)}
        disabled={submitting}
        style={styles.submitButton}
      >
        <Text style={styles.submitButtonText}>{submitting ? '…' : submitLabel}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: '100%' },
  labelRow: { flexDirection: 'row', marginBottom: 8 },
  label: { fontSize: 15, fontWeight: '700', color: colors.text },
  // Piste large et haute : un doigt vise plus facilement qu'une fine barre
  // d'affichage — celle-ci se manipule, l'autre (ConfidenceGauge) se lit.
  // Pas de padding horizontal : le pouce dépasse légèrement aux extrêmes
  // (0/100%), comme la plupart des sliders — évite un décalage entre la
  // largeur mesurée (`onLayout`) et la largeur utile au calcul du geste.
  track: { height: THUMB_SIZE, justifyContent: 'center' },
  trackLine: { height: TRACK_HEIGHT, borderRadius: radius.pill, overflow: 'hidden' },
  thumb: {
    position: 'absolute',
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: THUMB_SIZE / 2,
    backgroundColor: colors.surface,
    borderWidth: 3,
    borderColor: colors.text,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3,
    elevation: 3,
  },
  submitButton: {
    marginTop: 14,
    borderWidth: 1,
    borderColor: colors.text,
    borderRadius: radius.pill,
    paddingVertical: 12,
    alignItems: 'center',
    backgroundColor: colors.surface,
  },
  submitButtonText: { fontSize: 14, fontWeight: '700', color: colors.text },
});
