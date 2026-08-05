import { Plus } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet } from 'react-native';

import { colors } from '../lib/theme';

/**
 * Bouton d'action flottant unique et standardisé, présent sur chaque page
 * (hors création elle-même et connexion) : un seul point d'entrée vers la
 * création, cohérent partout, plutôt qu'un lien discret par écran.
 */
export function CreateFab() {
  const router = useRouter();
  return (
    <Pressable
      onPress={() => router.push('/new-prediction')}
      style={({ pressed }) => [styles.fab, pressed && styles.fabPressed]}
      hitSlop={4}
    >
      <Plus size={30} color={colors.fabIcon} strokeWidth={2.5} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  // Cercle jaune vibrant, icône noire — élément interactif majeur, seul
  // endroit de l'app où le jaune s'affiche à cette intensité. Ombre sobre,
  // pas de halo coloré.
  fab: {
    position: 'absolute',
    bottom: 24,
    right: 24,
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: colors.fab,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 14,
    elevation: 6,
    zIndex: 10,
  },
  fabPressed: { opacity: 0.85 },
});
