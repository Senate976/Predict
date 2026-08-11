import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text } from '../../../components/Text';

import { useAuth } from '../../../lib/auth';
import {
  fetchReminderSettings,
  REMINDER_LEAD_OPTIONS,
  updateReminderSettings,
  type ReminderSettings,
} from '../../../lib/settings';
import { eyebrow, fonts, radius, spacing, type Colors } from '../../../lib/theme';
import { useColors } from '../../../lib/themeMode';

/** Gestion du temps : rappel avant qu'un Predict qu'on peut voir se révèle —
 * pendant symétrique de la notification « Révélation », mais avant l'heure
 * dite plutôt qu'après. */
export default function RemindersSettingsScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const userId = session?.user.id;

  const [settings, setSettings] = useState<ReminderSettings | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!userId) return;
    const { data, error: fetchError } = await fetchReminderSettings(userId);
    if (fetchError) {
      setError(`Chargement impossible : ${fetchError.message}`);
      return;
    }
    setError(null);
    setSettings(data ?? { enabled: true, leadMinutes: 60 });
  }, [userId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  async function persist(next: ReminderSettings) {
    if (!userId) return;
    setSettings(next);
    const { error: updateError } = await updateReminderSettings(userId, next);
    if (updateError) setError(`Mise à jour impossible : ${updateError.message}`);
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <Text style={styles.back}>Retour</Text>
        </Pressable>
        <Text style={styles.headerTitle}>Gestion du temps</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        {error && <Text style={styles.error}>{error}</Text>}

        {settings === null && !error ? (
          <ActivityIndicator color={colors.text} style={styles.loader} />
        ) : (
          <>
            <View style={styles.row}>
              <View style={styles.rowText}>
                <Text style={styles.rowLabel}>Rappel avant révélation</Text>
                <Text style={styles.rowHint}>
                  Une notification avant qu’un Predict que tu peux voir se révèle.
                </Text>
              </View>
              <Switch
                value={settings?.enabled ?? true}
                onValueChange={(v) => {
                  if (settings) persist({ ...settings, enabled: v });
                }}
                trackColor={{ false: colors.border, true: colors.accent }}
                thumbColor={colors.surface}
              />
            </View>

            {settings?.enabled && (
              <>
                <Text style={[styles.eyebrow, styles.sectionSpacing]}>Délai</Text>
                <View style={styles.group}>
                  {REMINDER_LEAD_OPTIONS.map((option, i) => {
                    const active = settings.leadMinutes === option.minutes;
                    return (
                      <Pressable
                        key={option.minutes}
                        onPress={() => persist({ ...settings, leadMinutes: option.minutes })}
                        style={[
                          styles.optionRow,
                          i === REMINDER_LEAD_OPTIONS.length - 1 && styles.optionRowLast,
                        ]}
                      >
                        <Text style={styles.optionText}>{option.label}</Text>
                        {active && <View style={styles.optionDot} />}
                      </Pressable>
                    );
                  })}
                </View>
              </>
            )}
          </>
        )}
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
  loader: { marginTop: 24 },
  eyebrow: { ...eyebrow(colors), marginBottom: 8 },
  sectionSpacing: { marginTop: spacing.xl },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 18,
    borderRadius: 16,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 12,
  },
  rowText: { flex: 1 },
  rowLabel: { fontSize: 15, fontWeight: '600', color: colors.text },
  rowHint: { fontSize: 12, color: colors.textFaint, marginTop: 2 },
  group: {
    borderRadius: 16,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  optionRowLast: { borderBottomWidth: 0 },
  optionText: { fontSize: 15, color: colors.text, fontWeight: '600' },
  optionDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.accent },
  error: {
    color: colors.danger,
    backgroundColor: colors.dangerSoft,
    borderRadius: radius.sm,
    padding: 12,
    fontSize: 14,
    marginBottom: spacing.md,
  },
  });
}
