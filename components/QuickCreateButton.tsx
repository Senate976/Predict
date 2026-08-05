import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text } from 'react-native';

import { colors } from '../lib/theme';

/**
 * Bouton "+" présent dans le header de chaque page hors Fil (qui a déjà son
 * propre bouton "Nouvelle prédiction" en pied de page) : accès direct à la
 * création sans devoir d'abord revenir au Fil. Un simple signe souligné,
 * sans fond ni cercle — discret, pas une action principale de l'écran.
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
    paddingHorizontal: 2,
    paddingBottom: 2,
    borderBottomWidth: 1,
    borderBottomColor: colors.gold,
  },
  buttonPressed: { opacity: 0.6 },
  plus: { color: colors.gold, fontSize: 19, fontWeight: '700', lineHeight: 20 },
});
