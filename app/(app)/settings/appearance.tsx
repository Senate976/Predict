import { useRouter } from 'expo-router';
import { Check } from 'lucide-react-native';
import { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text } from '../../../components/Text';

import { fonts, spacing, type Colors } from '../../../lib/theme';
import { useColors, useThemeMode, type ThemeMode } from '../../../lib/themeMode';

const OPTIONS: { id: ThemeMode; label: string }[] = [
  { id: 'light', label: 'Clair' },
  { id: 'dark', label: 'Sombre' },
];

/** Le choix est mémorisé (`useThemeMode`) et s'applique immédiatement à toute
 * l'app : chaque écran lit sa palette via `useColors()` (`lib/themeMode.tsx`),
 * réévalué à chaque changement de mode. */
export default function AppearanceSettingsScreen() {
  const router = useRouter();
  const { mode, setMode } = useThemeMode();
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);

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
              {mode === option.id && <Check size={21} color={colors.text} strokeWidth={2} />}
            </Pressable>
          ))}
        </View>
        <Text style={styles.hint}>Ton choix est appliqué immédiatement et mémorisé pour la prochaine fois.</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function createStyles(colors: Colors) {
  return StyleSheet.create({
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
  hint: { fontSize: 14, color: colors.textFaint, marginTop: 10 },
  });
}
