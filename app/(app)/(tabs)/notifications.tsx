import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Avatar } from '../../../components/Avatar';
import { PredictWord } from '../../../components/PredictWord';
import { QuickCreateButton } from '../../../components/QuickCreateButton';
import { useAuth } from '../../../lib/auth';
import { formatTimeAgo } from '../../../lib/datetime';
import {
  acceptGroupInvite,
  declineGroupInvite,
  groupErrorMessage,
  type GroupMemberStatus,
} from '../../../lib/groups';
import {
  deleteNotification,
  fetchNotifications,
  markNotificationRead,
  notificationErrorMessage,
  type Notification,
} from '../../../lib/notifications';
import { supabase } from '../../../lib/supabase';
import { colors, fonts, radius, spacing } from '../../../lib/theme';

function notificationLabel(notification: Notification) {
  switch (notification.type) {
    case 'prediction_revealed':
      return (
        <>
          Une <PredictWord /> vient d’être révélée
        </>
      );
    case 'prediction_approved':
      return (
        <>
          Une de tes <PredictWord /> a été approuvée par le Cercle
        </>
      );
    case 'group_invite':
      return notification.group?.owner
        ? `${notification.group.owner.username} t’invite dans un groupe`
        : 'Invitation à rejoindre un groupe';
    default:
      return (
        <>
          Nouvelle <PredictWord /> dans ton Cercle
        </>
      );
  }
}

/** Toutes les notifications, dans l'ordre chronologique strict (la plus récente en tête). */
export default function NotificationsScreen() {
  const { session } = useAuth();
  const router = useRouter();
  const userId = session?.user.id;

  const [notifications, setNotifications] = useState<Notification[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  // Statut persisté de ses propres invitations de groupe (group_id -> status),
  // pour distinguer « acceptée » de « refusée » après un rechargement —
  // `is_read` seul suffit à savoir qu'on a répondu, mais pas quoi.
  const [membershipStatus, setMembershipStatus] = useState<Record<string, GroupMemberStatus>>({});

  const load = useCallback(async () => {
    if (!userId) return;
    const { data, error: fetchError } = await fetchNotifications(userId);
    if (fetchError) {
      setError(notificationErrorMessage(fetchError));
      return;
    }
    setError(null);
    setNotifications(data ?? []);

    const { data: memberships } = await supabase
      .from('group_members')
      .select('group_id, status')
      .eq('friend_id', userId);
    const map: Record<string, GroupMemberStatus> = {};
    for (const row of memberships ?? []) {
      map[row.group_id] = row.status as GroupMemberStatus;
    }
    setMembershipStatus(map);
  }, [userId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  async function handlePress(notification: Notification) {
    if (notification.type === 'group_invite') return;
    if (!notification.is_read) {
      setNotifications((prev) =>
        (prev ?? []).map((n) => (n.id === notification.id ? { ...n, is_read: true } : n))
      );
      markNotificationRead(notification.id);
    }
    router.push(`/prediction/${notification.prediction_id}`);
  }

  function handleDelete(notificationId: string) {
    const message = 'Cette notification sera définitivement supprimée.';
    const run = async () => {
      const { error: deleteError } = await deleteNotification(notificationId);
      if (deleteError) {
        setActionError(`Suppression impossible : ${deleteError.message}`);
        return;
      }
      setNotifications((prev) => (prev ?? []).filter((n) => n.id !== notificationId));
    };

    // `Alert.alert` de React Native Web ne fait rien (déjà rencontré pour la
    // suppression d'une prédiction et d'un commentaire).
    if (Platform.OS === 'web') {
      if (window.confirm(`Supprimer cette notification ?\n\n${message}`)) run();
      return;
    }
    Alert.alert('Supprimer cette notification ?', message, [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Supprimer', style: 'destructive', onPress: run },
    ]);
  }

  async function handleGroupInviteResponse(notification: Notification, accept: boolean) {
    if (!userId || !notification.group_id) return;
    const groupId = notification.group_id;
    setActionError(null);
    setPendingId(notification.id);
    try {
      const { error: respondError } = accept
        ? await acceptGroupInvite(groupId, userId)
        : await declineGroupInvite(groupId, userId);
      if (respondError) {
        setActionError(groupErrorMessage(respondError));
        return;
      }
      markNotificationRead(notification.id);
      setNotifications((prev) =>
        (prev ?? []).map((n) => (n.id === notification.id ? { ...n, is_read: true } : n))
      );
      setMembershipStatus((prev) => {
        const next = { ...prev };
        if (accept) {
          next[groupId] = 'accepted';
        } else {
          delete next[groupId];
        }
        return next;
      });
    } finally {
      setPendingId(null);
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Notifications</Text>
        <QuickCreateButton />
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        {error && <Text style={styles.error}>{error}</Text>}
        {actionError && <Text style={styles.error}>{actionError}</Text>}

        {notifications === null && !error ? (
          <ActivityIndicator color={colors.gold} style={styles.loader} />
        ) : notifications && notifications.length === 0 ? (
          <Text style={styles.empty}>Rien pour l’instant.</Text>
        ) : (
          (notifications ?? []).map((notification) => {
            const isGroupInvite = notification.type === 'group_invite';
            // `is_read` n'est mis à jour, pour une invitation de groupe, que par
            // `handleGroupInviteResponse` : sa valeur en base fait donc foi même
            // après un rechargement, contrairement à un état local éphémère.
            const responded = isGroupInvite && notification.is_read;
            const accepted = isGroupInvite && notification.group_id
              ? membershipStatus[notification.group_id] === 'accepted'
              : false;
            return (
              <Pressable
                key={notification.id}
                onPress={() => handlePress(notification)}
                disabled={isGroupInvite}
                style={({ pressed }) => [
                  styles.row,
                  !notification.is_read && styles.rowUnread,
                  pressed && !isGroupInvite && styles.rowPressed,
                ]}
              >
                {!notification.is_read && <View style={styles.dot} />}
                <View style={styles.rowText}>
                  <Text style={styles.label}>{notificationLabel(notification)}</Text>
                  {notification.prediction?.author && (
                    <View style={styles.authorRow}>
                      <Avatar
                        url={notification.prediction.author.avatar_url}
                        username={notification.prediction.author.username}
                        size={18}
                      />
                      <Text style={styles.authorName}>{notification.prediction.author.username}</Text>
                    </View>
                  )}
                  {notification.prediction && (
                    <Text style={styles.teaser} numberOfLines={2}>
                      {notification.prediction.teaser}
                    </Text>
                  )}
                  {isGroupInvite && notification.group && (
                    <Text style={styles.teaser} numberOfLines={1}>
                      {notification.group.name}
                    </Text>
                  )}
                  <Text style={styles.time}>{formatTimeAgo(notification.created_at, new Date())}</Text>

                  {isGroupInvite && !responded && (
                    <View style={styles.inviteActions}>
                      <Pressable
                        onPress={() => handleGroupInviteResponse(notification, true)}
                        disabled={pendingId === notification.id}
                        style={styles.pillGold}
                      >
                        <Text style={styles.pillGoldText}>Accepter</Text>
                      </Pressable>
                      <Pressable
                        onPress={() => handleGroupInviteResponse(notification, false)}
                        disabled={pendingId === notification.id}
                        style={styles.pillOutline}
                      >
                        <Text style={styles.pillOutlineText}>Refuser</Text>
                      </Pressable>
                    </View>
                  )}
                  {isGroupInvite && responded && (
                    <Text style={styles.respondedText}>
                      {accepted ? 'Invitation acceptée.' : 'Invitation refusée.'}
                    </Text>
                  )}
                </View>

                <Pressable
                  onPress={() => handleDelete(notification.id)}
                  hitSlop={8}
                  style={styles.deleteButton}
                >
                  <Ionicons name="trash-outline" size={15} color={colors.textFaint} />
                </Pressable>
              </Pressable>
            );
          })
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
    paddingTop: 14,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerTitle: { fontFamily: fonts.serifItalic, fontSize: 26, color: colors.text },
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
    position: 'relative',
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
  rowText: { flex: 1, paddingRight: 26 },
  deleteButton: { position: 'absolute', right: 14, bottom: 14 },
  label: { fontSize: 14, fontWeight: '600', color: colors.text },
  authorRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 },
  authorName: { fontSize: 12, fontWeight: '700', color: colors.textMuted },
  teaser: {
    fontFamily: fonts.serifItalic,
    fontSize: 16,
    color: colors.text,
    marginTop: 4,
  },
  time: { fontSize: 12, color: colors.textFaint, marginTop: 6 },
  inviteActions: { flexDirection: 'row', gap: 8, marginTop: 10 },
  pillGold: {
    backgroundColor: colors.gold,
    borderRadius: radius.pill,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  pillGoldText: { color: colors.text, fontSize: 13, fontWeight: '700' },
  pillOutline: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  pillOutlineText: { color: colors.textMuted, fontSize: 13, fontWeight: '600' },
  respondedText: { fontSize: 12, color: colors.textFaint, marginTop: 8, fontStyle: 'italic' },
});
