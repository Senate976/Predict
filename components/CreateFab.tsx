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
  // Cercle ardoise sombre, bordure et icône jaunes, ombre teintée d'or à
  // faible opacité — une lueur néon discrète plutôt qu'un aplat de couleur
  // vive plein.
  fab: {
    position: 'absolute',
    bottom: 24,
    right: 24,
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: colors.fab,
    borderWidth: 1.5,
    borderColor: colors.fabBorder,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.gold,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 6,
    zIndex: 10,
  },
  fabPressed: { opacity: 0.85 },
});
