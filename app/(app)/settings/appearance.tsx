import { useRouter } from 'expo-router';
import { Check } from 'lucide-react-native';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text } from '../../../components/Text';

import { colors, fonts, spacing } from '../../../lib/theme';
import { useThemeMode, type ThemeMode } from '../../../lib/themeMode';

const OPTIONS: { id: ThemeMode; label: string }[] = [
  { id: 'light', label: 'Clair' },
  { id: 'dark', label: 'Sombre' },
];

/** Le choix est mémorisé (voir `useThemeMode`), mais aucun écran n'y réagit
 * encore — toute l'app reste câblée sur la palette sombre de `lib/theme.ts`
 * quel que soit le mode choisi ici. Câbler chaque écran sur ce mode viendra
 * dans une passe suivante ; ce sélecteur pose la préférence en amont. */
export default function AppearanceSettingsScreen() {
  const router = useRouter();
  const { mode, setMode } = useThemeMode();

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <Text style={styles.back}>Retour</Text>
        </Pressable>
        <Text style={styles.headerTitle}>Apparence</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.group}>
          {OPTIONS.map((option, i) => (
            <Pressable
              key={option.id}
              onPress={() => setMode(option.id)}
              style={[styles.row, i === OPTIONS.length - 1 && styles.rowLast]}
            >
              <Text style={styles.rowLabel}>{option.label}</Text>
              {mode === option.id && <Check size={18} color={colors.text} strokeWidth={2} />}
            </Pressable>
          ))}
        </View>
        <Text style={styles.hint}>
          Ton choix est mémorisé, mais Predict reste en mode sombre pour l’instant — le mode clair
          arrive dans une prochaine mise à jour.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerTitle: { fontFamily: fonts.display, fontSize: 17, color: colors.text },
  back: { fontSize: 15, color: colors.text, width: 56 },
  headerSpacer: { width: 56 },
  scroll: { padding: spacing.lg, paddingBottom: 48 },
  group: {
    borderRadius: 16,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  rowLast: { borderBottomWidth: 0 },
  rowLabel: { fontSize: 15, fontWeight: '600', color: colors.text },
  hint: { fontSize: 12, color: colors.textFaint, marginTop: 10 },
});
