import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text } from '../../../components/Text';

import { useAuth } from '../../../lib/auth';
import type { PredictionScope } from '../../../lib/predictions';
import { eyebrow, fonts, radius, spacing, type Colors } from '../../../lib/theme';
import { useColors } from '../../../lib/themeMode';

/** Uniquement Cercle/Amis sélectionnés : « Un groupe » n'a pas de sens comme
 * défaut global, il désigne un groupe précis à choisir à chaque création. */
const OPTIONS: { value: PredictionScope; label: string; hint: string }[] = [
  { value: 'circle', label: 'Tout mon Cercle', hint: 'Visible par tous mes amis acceptés.' },
  { value: 'selected', label: 'Amis sélectionnés', hint: 'Je choisis les destinataires à chaque fois.' },
];

export default function PrivacySettingsScreen() {
  const router = useRouter();
  const { defaultScope, setDefaultScope } = useAuth();
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const active = defaultScope ?? 'circle';

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <Text style={styles.back}>Retour</Text>
        </Pressable>
        <Text style={styles.headerTitle}>Confidentialité</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.eyebrow}>Portée par défaut</Text>
        <Text style={styles.description}>
          La portée pré-sélectionnée quand tu scelles un nouveau Predict — tu peux toujours la changer au cas
          par cas.
        </Text>

        <View style={styles.group}>
          {OPTIONS.map((option, i) => {
            const isActive = active === option.value;
            return (
              <Pressable
                key={option.value}
                onPress={() => setDefaultScope(option.value)}
                style={[styles.row, i === OPTIONS.length - 1 && styles.rowLast]}
              >
                <View style={styles.rowText}>
                  <Text style={styles.rowLabel}>{option.label}</Text>
                  <Text style={styles.rowHint}>{option.hint}</Text>
                </View>
                {isActive && <View style={styles.dot} />}
              </Pressable>
            );
          })}
        </View>
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
  eyebrow: { ...eyebrow(colors), marginBottom: 8 },
  description: { fontSize: 13, color: colors.textMuted, lineHeight: 19, marginBottom: spacing.md },
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
    gap: 12,
  },
  rowLast: { borderBottomWidth: 0 },
  rowText: { flex: 1 },
  rowLabel: { fontSize: 15, fontWeight: '600', color: colors.text },
  rowHint: { fontSize: 12, color: colors.textFaint, marginTop: 2 },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.gold },
  });
}
