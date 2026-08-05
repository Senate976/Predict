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
      <Plus size={30} color="#FFFFFF" strokeWidth={2.5} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  // Gros, ultra-visible : couleur d'accent nette + ombre bien marquée de la
  // même teinte, pour qu'il ressorte clairement du fil derrière lui.
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
    shadowColor: colors.gold,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.45,
    shadowRadius: 14,
    elevation: 8,
    zIndex: 10,
  },
  fabPressed: { opacity: 0.85 },
});
