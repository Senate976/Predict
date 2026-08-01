import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { QuickCreateButton } from '../../components/QuickCreateButton';
import { useAuth } from '../../lib/auth';
import {
  fetchNotifications,
  markNotificationRead,
  notificationErrorMessage,
  type Notification,
} from '../../lib/notifications';
import { colors, fonts, radius, spacing } from '../../lib/theme';

/** « à l’instant », « il y a 12 min », « il y a 3 h », « il y a 2 jours ». */
function timeAgo(iso: string, now: Date): string {
  const minutes = Math.floor((now.getTime() - new Date(iso).getTime()) / 60_000);
  if (minutes < 1) return 'à l’instant';
  if (minutes < 60) return `il y a ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `il y a ${hours} h`;
  const days = Math.floor(hours / 24);
  return days === 1 ? 'il y a 1 jour' : `il y a ${days} jours`;
}

function notificationLabel(notification: Notification): string {
  return notification.type === 'prediction_revealed'
    ? 'Une prédiction vient d’être révélée'
    : 'Nouvelle prédiction dans ton Cercle';
}

export default function NotificationsScreen() {
  const { session } = useAuth();
  const router = useRouter();
  const userId = session?.user.id;

  const [notifications, setNotifications] = useState<Notification[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!userId) return;
    const { data, error: fetchError } = await fetchNotifications(userId);
    if (fetchError) {
      setError(notificationErrorMessage(fetchError));
      return;
    }
    setError(null);
    setNotifications(data ?? []);
  }, [userId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  async function handlePress(notification: Notification) {
    if (!notification.is_read) {
      setNotifications((prev) =>
        (prev ?? []).map((n) => (n.id === notification.id ? { ...n, is_read: true } : n))
      );
      markNotificationRead(notification.id);
    }
    router.push(`/prediction/${notification.prediction_id}`);
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <Text style={styles.back}>Retour</Text>
        </Pressable>
        <Text style={styles.headerTitle}>Notifications</Text>
        <QuickCreateButton />
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        {error && <Text style={styles.error}>{error}</Text>}

        {notifications === null && !error ? (
          <ActivityIndicator color={colors.gold} style={styles.loader} />
        ) : notifications && notifications.length === 0 ? (
          <Text style={styles.empty}>Rien pour l’instant.</Text>
        ) : (
          (notifications ?? []).map((notification) => (
            <Pressable
              key={notification.id}
              onPress={() => handlePress(notification)}
              style={({ pressed }) => [
                styles.row,
                !notification.is_read && styles.rowUnread,
                pressed && styles.rowPressed,
              ]}
            >
              {!notification.is_read && <View style={styles.dot} />}
              <View style={styles.rowText}>
                <Text style={styles.label}>{notificationLabel(notification)}</Text>
                {notification.prediction && (
                  <Text style={styles.teaser} numberOfLines={2}>
                    {notification.prediction.teaser}
                  </Text>
                )}
                <Text style={styles.time}>{timeAgo(notification.created_at, new Date())}</Text>
              </View>
            </Pressable>
          ))
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
  headerTitle: { fontFamily: fonts.serifItalic, fontSize: 18, color: colors.text },
  back: { fontSize: 15, color: colors.gold, width: 56 },
  scroll: { padding: spacing.lg, paddingBottom: 48 },
  loader: { marginTop: 32 },
  empty: { fontSize: 14, color: colors.textFaint, textAlign: 'center', marginTop: 32 },
  error: {
    color: colors.danger,
    backgroundColor: colors.dangerSoft,
    borderRadius: radius.sm,
    padding: 12,
    fontSize: 14,
    marginBottom: spacing.md,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  rowUnread: { backgroundColor: colors.goldSoft },
  rowPressed: { opacity: 0.7 },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.gold,
    marginTop: 6,
  },
  rowText: { flex: 1 },
  label: { fontSize: 14, fontWeight: '600', color: colors.text },
  teaser: {
    fontFamily: fonts.serifItalic,
    fontSize: 16,
    color: colors.text,
    marginTop: 4,
  },
  time: { fontSize: 12, color: colors.textFaint, marginTop: 6 },
});
