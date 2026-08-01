import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text } from 'react-native';

import { colors, radius } from '../lib/theme';

/**
 * Bouton "+" présent dans le header de chaque page hors Fil (qui a déjà son
 * propre bouton "Nouvelle prédiction" en pied de page) : accès direct à la
 * création sans devoir d'abord revenir au Fil.
 */
export function QuickCreateButton() {
  const router = useRouter();
  return (
    <Pressable
      onPress={() => router.push('/new-prediction')}
      hitSlop={10}
      style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
    >
      <Text style={styles.plus}>+</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    width: 34,
    height: 34,
    borderRadius: radius.pill,
    backgroundColor: colors.gold,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonPressed: { backgroundColor: colors.goldBright },
  plus: { color: '#FFFFFF', fontSize: 19, fontWeight: '700', marginTop: -1 },
});
