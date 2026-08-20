import { useFocusEffect, useRouter } from 'expo-router';
import { Check, Trash2 } from 'lucide-react-native';
import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { Text } from '../../../components/Text';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Avatar } from '../../../components/Avatar';
import { EnvelopeIcon, envelopeVariantForNotificationType } from '../../../components/EnvelopeIcon';
import { PredictWord } from '../../../components/PredictWord';
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
  deleteNotifications,
  fetchNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  notificationErrorMessage,
  type Notification,
} from '../../../lib/notifications';
import { supabase } from '../../../lib/supabase';
import { fonts, radius, spacing, type Colors } from '../../../lib/theme';
import { useColors } from '../../../lib/themeMode';

function notificationLabel(notification: Notification) {
  switch (notification.type) {
    case 'prediction_revealed':
      return (
        <>
          Un <PredictWord /> vient d’être révélé
        </>
      );
    case 'prediction_approved':
      return (
        <>
          Un de tes <PredictWord /> a été approuvé par le Cercle
        </>
      );
    case 'prediction_mentioned':
      return (
        <>
          {notification.prediction?.author?.username ?? 'Quelqu’un'} t’a cité dans un{' '}
          <PredictWord />
        </>
      );
    case 'prediction_realized':
      return (
        <>
          {notification.prediction?.author?.username ?? 'Quelqu’un'} confirme que son{' '}
          <PredictWord /> s’est réalisé
        </>
      );
    case 'prediction_missed':
      return (
        <>
          {notification.prediction?.author?.username ?? 'Quelqu’un'} confirme que son{' '}
          <PredictWord /> a été manqué
        </>
      );
    case 'reveal_reminder':
      return (
        <>
          Un <PredictWord /> se révèle bientôt
        </>
      );
    case 'open_reminder':
      return (
        <>
          Ton <PredictWord /> attend toujours d’être révélé
        </>
      );
    case 'nudge':
      // Le nombre de personnes qui attendent est sur la carte, pas ici : une
      // notification qui dirait « 6 personnes t'attendent » se lirait comme
      // une sommation. Elle signale, la carte détaille.
      return (
        <>
          Ton Cercle attend ton <PredictWord />
        </>
      );
    case 'question_answered':
      return 'Quelqu’un a répondu à ton Sondage';
    case 'new_comment':
      return (
        <>
          Nouveau commentaire sur un <PredictWord />
        </>
      );
    case 'group_invite':
      return notification.group?.owner
        ? `${notification.group.owner.username} t’invite dans un groupe`
        : 'Invitation à rejoindre un groupe';
    default:
      return (
        <>
          Nouveau <PredictWord /> dans ton Cercle
        </>
      );
  }
}

/** Toutes les notifications, dans l'ordre chronologique strict (la plus récente en tête). */
export default function NotificationsScreen() {
  const { session } = useAuth();
  const router = useRouter();
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const userId = session?.user.id;

  const [notifications, setNotifications] = useState<Notification[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  // Statut persisté de ses propres invitations de groupe (group_id -> status),
  // pour distinguer « acceptée » de « refusée » après un rechargement —
  // `is_read` seul suffit à savoir qu'on a répondu, mais pas quoi.
  const [membershipStatus, setMembershipStatus] = useState<Record<string, GroupMemberStatus>>({});
  // Non vide : mode sélection multiple, activé par un appui long sur une
  // notification — un appui simple bascule alors la sélection au lieu
  // d'ouvrir/répondre à la notification.
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  // `notifications` peut être `null` tant que rien n'est chargé : sans ce
  // garde-fou, « tout » cocherait une liste vide et se dirait complète.
  const allSelected =
    (notifications?.length ?? 0) > 0 && selectedIds.size === (notifications?.length ?? 0);

  function toggleSelectAll() {
    setSelectedIds(allSelected ? new Set() : new Set((notifications ?? []).map((n) => n.id)));
  }

  const load = useCallback(async () => {
    if (!userId) return;
    const { data, error: fetchError } = await fetchNotifications(userId);
    if (fetchError) {
      setError(notificationErrorMessage(fetchError));
      return;
    }
    setError(null);
    setNotifications(data ?? []);

    /* Les avoir sous les yeux suffit à les avoir vues : on éteint la pastille
       et les fonds jaunes sans attendre qu'on ouvre chaque ligne. L'état
       local est posé d'abord pour que l'écran ne montre jamais un surlignage
       le temps de l'aller-retour ; la base suit. */
    if ((data ?? []).some((n) => !n.is_read)) {
      setNotifications((prev) => (prev ?? []).map((n) => ({ ...n, is_read: true })));
      markAllNotificationsRead(userId);
    }

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

  function toggleSelected(notificationId: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(notificationId)) next.delete(notificationId);
      else next.add(notificationId);
      return next;
    });
  }

  function handleBulkDelete() {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    const message = `${ids.length} notification${ids.length > 1 ? 's' : ''} seront définitivement supprimées.`;
    const run = async () => {
      const { error: deleteError } = await deleteNotifications(ids);
      if (deleteError) {
        setActionError(`Suppression impossible : ${deleteError.message}`);
        return;
      }
      setNotifications((prev) => (prev ?? []).filter((n) => !selectedIds.has(n.id)));
      setSelectedIds(new Set());
    };

    if (Platform.OS === 'web') {
      if (window.confirm(`Supprimer ${ids.length} notification${ids.length > 1 ? 's' : ''} ?\n\n${message}`)) run();
      return;
    }
    Alert.alert(`Supprimer ${ids.length} notification${ids.length > 1 ? 's' : ''} ?`, message, [
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
        {selectedIds.size > 0 ? (
          <>
            <Pressable onPress={() => setSelectedIds(new Set())} hitSlop={8}>
              <Text style={styles.cancelSelection}>Annuler</Text>
            </Pressable>
            <Text style={styles.headerTitle}>
              {selectedIds.size} sélectionnée{selectedIds.size > 1 ? 's' : ''}
            </Text>
            {/* Tout cocher d'un geste, sans renoncer au choix un par un : la
                sélection manuelle reste le défaut, ceci n'est qu'un raccourci
                — et il se retourne en « Tout désélectionner » une fois la
                liste entièrement cochée. */}
            <Pressable onPress={toggleSelectAll} hitSlop={8}>
              <Text style={styles.selectAll}>{allSelected ? 'Aucun' : 'Tout'}</Text>
            </Pressable>
            <Pressable onPress={handleBulkDelete} hitSlop={8}>
              <Trash2 size={22} color={colors.danger} strokeWidth={1.75} />
            </Pressable>
          </>
        ) : (
          <Text style={styles.headerTitle}>Notifications</Text>
        )}
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        {error && <Text style={styles.error}>{error}</Text>}
        {actionError && <Text style={styles.error}>{actionError}</Text>}

        {notifications === null && !error ? (
          <ActivityIndicator color={colors.text} style={styles.loader} />
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
            const selecting = selectedIds.size > 0;
            const selected = selectedIds.has(notification.id);
            return (
              <Pressable
                key={notification.id}
                onPress={() => (selecting ? toggleSelected(notification.id) : handlePress(notification))}
                onLongPress={() => toggleSelected(notification.id)}
                disabled={isGroupInvite && !selecting}
                style={({ pressed }) => [
                  styles.row,
                  pressed && styles.rowPressed,
                ]}
              >
                {selecting ? (
                  <View style={[styles.checkbox, selected && styles.checkboxChecked]}>
                    {selected && <Check size={12} color={colors.background} strokeWidth={2.5} />}
                  </View>
                ) : (
                  <View style={styles.iconSlot}>
                    <EnvelopeIcon variant={envelopeVariantForNotificationType(notification.type)} />
                  </View>
                )}
                <View style={styles.rowText}>
                  <Text style={styles.label}>{notificationLabel(notification)}</Text>
                  {notification.prediction?.author && (
                    <View style={styles.authorRow}>
                      <Avatar
                        url={notification.prediction.author.avatar_url}
                        username={notification.prediction.author.username}
                        size={21}
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

                  {isGroupInvite && !responded && !selecting && (
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

                {!selecting && (
                  <Pressable
                    onPress={() => handleDelete(notification.id)}
                    hitSlop={8}
                    style={styles.deleteButton}
                  >
                    <Trash2 size={18} color={colors.icon} strokeWidth={1.75} />
                  </Pressable>
                )}
              </Pressable>
            );
          })
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
    paddingTop: 14,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerTitle: {
    fontFamily: fonts.display,
    fontSize: 22,
    color: colors.text,
  },
  cancelSelection: { fontSize: 15, color: colors.text, fontWeight: '600' },
  selectAll: { fontFamily: fonts.label, fontSize: 15, color: colors.accent },
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
  // Une carte par notification, séparée des suivantes par du vide plutôt que
  // par un filet — même respiration que les cartes du Fil, et même écart.
  row: {
    position: 'relative',
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    padding: 14,
    marginBottom: 18,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.card,
    backgroundColor: colors.surface,
  },
  rowPressed: { opacity: 0.7 },
  iconSlot: { marginTop: 1 },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: radius.pill,
    borderWidth: 2,
    borderColor: colors.border,
    marginTop: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: { backgroundColor: colors.accent, borderColor: colors.accent },
  rowText: { flex: 1, paddingRight: 26 },
  deleteButton: { position: 'absolute', right: 14, bottom: 14 },
  label: { fontSize: 14, fontWeight: '600', color: colors.text },
  authorRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 },
  authorName: { fontSize: 14, fontWeight: '700', color: colors.textMuted },
  teaser: {
    fontFamily: fonts.sansBold,
    fontSize: 16,
    color: colors.text,
    marginTop: 4,
  },
  time: { fontSize: 14, color: colors.textFaint, marginTop: 6 },
  inviteActions: { flexDirection: 'row', gap: 8, marginTop: 10 },
  // Même traitement léger que les actions du Cercle (invitations de groupe) :
  // contour plutôt que jaune plein.
  pillGold: {
    borderWidth: 1,
    borderColor: colors.text,
    borderRadius: radius.pill,
    paddingHorizontal: 14,
    paddingVertical: 7,
    backgroundColor: colors.surface,
  },
  pillGoldText: { color: colors.text, fontSize: 15, fontWeight: '700' },
  pillOutline: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  pillOutlineText: { color: colors.textMuted, fontSize: 15, fontWeight: '600' },
  respondedText: { fontSize: 14, color: colors.textFaint, marginTop: 8 },
  });
}
