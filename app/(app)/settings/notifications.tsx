import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text } from '../../../components/Text';

import { useAuth } from '../../../lib/auth';
import {
  DEFAULT_NOTIFICATION_PREFS,
  fetchNotificationPrefs,
  NOTIFICATION_PREF_LABELS,
  updateNotificationPrefs,
  type NotificationPrefs,
} from '../../../lib/settings';
import { colors, fonts, radius, spacing } from '../../../lib/theme';

export default function NotificationsSettingsScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const userId = session?.user.id;

  const [prefs, setPrefs] = useState<NotificationPrefs | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!userId) return;
    const { data, error: fetchError } = await fetchNotificationPrefs(userId);
    if (fetchError) {
      setError(`Chargement impossible : ${fetchError.message}`);
      return;
    }
    setError(null);
    setPrefs(data ?? DEFAULT_NOTIFICATION_PREFS);
  }, [userId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  async function handleToggle(key: keyof NotificationPrefs, value: boolean) {
    if (!userId || !prefs) return;
    const next = { ...prefs, [key]: value };
    setPrefs(next);
    const { error: updateError } = await updateNotificationPrefs(userId, next);
    if (updateError) {
      setPrefs(prefs);
      setError(`Mise à jour impossible : ${updateError.message}`);
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <Text style={styles.back}>Retour</Text>
        </Pressable>
        <Text style={styles.headerTitle}>Notifications</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        {error && <Text style={styles.error}>{error}</Text>}

        {prefs === null && !error ? (
          <ActivityIndicator color={colors.text} style={styles.loader} />
        ) : (
          <View style={styles.group}>
            {NOTIFICATION_PREF_LABELS.map((item, i) => (
              <View
                key={item.key}
                style={[styles.row, i === NOTIFICATION_PREF_LABELS.length - 1 && styles.rowLast]}
              >
                <View style={styles.rowText}>
                  <Text style={styles.rowLabel}>{item.label}</Text>
                  <Text style={styles.rowHint}>{item.hint}</Text>
                </View>
                <Switch
                  value={prefs?.[item.key] ?? true}
                  onValueChange={(v) => handleToggle(item.key, v)}
                  trackColor={{ false: colors.border, true: colors.gold }}
                  thumbColor={colors.surface}
                />
              </View>
            ))}
          </View>
        )}
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
  loader: { marginTop: 24 },
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
  error: {
    color: colors.danger,
    backgroundColor: colors.dangerSoft,
    borderRadius: radius.sm,
    padding: 12,
    fontSize: 14,
    marginBottom: spacing.md,
  },
});
