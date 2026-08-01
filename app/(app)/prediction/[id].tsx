import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '../../../lib/auth';
import { formatRevealAt } from '../../../lib/datetime';
import { fetchFriendships, otherProfile, type FriendProfile } from '../../../lib/friends';
import {
  addRecipient,
  fetchPrediction,
  fetchPredictionRecipients,
  isRevealed,
  removeRecipient,
  type PredictionFeedItem,
  type PredictionRecipient,
} from '../../../lib/predictions';
import { colors, fonts, radius, spacing } from '../../../lib/theme';

export default function PredictionDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useAuth();
  const router = useRouter();
  const userId = session?.user.id;

  const [prediction, setPrediction] = useState<PredictionFeedItem | null>(null);
  const [recipients, setRecipients] = useState<PredictionRecipient[] | null>(null);
  const [friends, setFriends] = useState<FriendProfile[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id || !userId) return;

    const { data: item, error: fetchError } = await fetchPrediction(id);
    if (fetchError) {
      setError(`Chargement impossible : ${fetchError.message}`);
      return;
    }
    if (!item) {
      setError('Prédiction introuvable.');
      return;
    }
    setError(null);
    setPrediction(item);

    if (item.author_id !== userId) return;

    const [{ data: recipientsData }, { data: friendships }] = await Promise.all([
      fetchPredictionRecipients(id),
      fetchFriendships(userId),
    ]);
    setRecipients(recipientsData ?? []);

    const accepted = (friendships ?? []).filter((f) => f.status === 'accepted');
    setFriends(accepted.map((f) => otherProfile(f, userId)));
  }, [id, userId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const recipientIds = new Set((recipients ?? []).map((r) => r.user_id));
  const addableFriends = (friends ?? []).filter((f) => !recipientIds.has(f.id));

  async function handleAdd(friendId: string) {
    if (!id) return;
    setActionError(null);
    setPendingId(friendId);
    try {
      const { error: addError } = await addRecipient(id, friendId);
      if (addError) {
        setActionError(`Ajout impossible : ${addError.message}`);
        return;
      }
      await load();
    } finally {
      setPendingId(null);
    }
  }

  async function handleRemove(friendId: string) {
    if (!id) return;
    setActionError(null);
    setPendingId(friendId);
    try {
      const { error: removeError } = await removeRecipient(id, friendId);
      if (removeError) {
        setActionError(`Retrait impossible : ${removeError.message}`);
        return;
      }
      await load();
    } finally {
      setPendingId(null);
    }
  }

  const isAuthor = prediction && userId && prediction.author_id === userId;
  const revealed = prediction ? isRevealed(prediction, new Date()) : false;

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <Text style={styles.back}>Retour</Text>
        </Pressable>
        <Text style={styles.headerTitle}>Ma prédiction</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        {error && <Text style={styles.error}>{error}</Text>}

        {!prediction && !error ? (
          <ActivityIndicator color={colors.gold} style={styles.loader} />
        ) : prediction ? (
          <>
            <Text style={styles.teaser}>{prediction.teaser}</Text>
            {revealed && prediction.content ? (
              <Text style={styles.content}>{prediction.content}</Text>
            ) : (
              <Text style={styles.sealedHint}>Contenu scellé jusqu’à la révélation.</Text>
            )}
            <Text style={styles.meta}>
              {revealed ? 'Révélée' : 'Se révèle'} {formatRevealAt(new Date(prediction.reveal_at))}
            </Text>

            {!isAuthor ? (
              <Text style={styles.notAuthor}>
                Seul l’auteur peut gérer les destinataires de cette prédiction.
              </Text>
            ) : (
              <>
                {actionError && <Text style={styles.error}>{actionError}</Text>}

                <Text style={styles.sectionLabel}>Destinataires</Text>
                {recipients === null ? (
                  <ActivityIndicator color={colors.gold} style={styles.loader} />
                ) : recipients.length === 0 ? (
                  <Text style={styles.hint}>Personne pour l’instant.</Text>
                ) : (
                  recipients.map((r) => (
                    <View key={r.user_id} style={styles.row}>
                      <Text style={styles.username}>{r.profile.username}</Text>
                      <Pressable
                        onPress={() => handleRemove(r.user_id)}
                        disabled={pendingId === r.user_id}
                        style={styles.pillOutline}
                      >
                        <Text style={styles.pillOutlineText}>Retirer</Text>
                      </Pressable>
                    </View>
                  ))
                )}

                <Text style={[styles.sectionLabel, styles.sectionSpacing]}>
                  Ajouter depuis le Cercle
                </Text>
                {friends === null ? (
                  <ActivityIndicator color={colors.gold} style={styles.loader} />
                ) : addableFriends.length === 0 ? (
                  <Text style={styles.hint}>
                    Tout ton Cercle a déjà accès, ou tu n’as pas encore d’ami.
                  </Text>
                ) : (
                  addableFriends.map((friend) => (
                    <View key={friend.id} style={styles.row}>
                      <Text style={styles.username}>{friend.username}</Text>
                      <Pressable
                        onPress={() => handleAdd(friend.id)}
                        disabled={pendingId === friend.id}
                        style={styles.pillGold}
                      >
                        <Text style={styles.pillGoldText}>Ajouter</Text>
                      </Pressable>
                    </View>
                  ))
                )}
              </>
            )}
          </>
        ) : null}
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
  headerTitle: { fontFamily: fonts.serif, fontSize: 18, color: colors.text },
  headerSpacer: { width: 56 },
  back: { fontSize: 15, color: colors.gold, width: 56 },
  scroll: { padding: spacing.lg, paddingBottom: 48 },
  loader: { marginTop: 24 },
  teaser: { fontFamily: fonts.serif, fontSize: 24, color: colors.text, lineHeight: 30 },
  content: {
    fontFamily: fonts.serif,
    fontSize: 18,
    color: colors.text,
    lineHeight: 24,
    marginTop: 14,
  },
  sealedHint: {
    fontSize: 13,
    color: colors.textFaint,
    fontStyle: 'italic',
    marginTop: 14,
  },
  meta: { fontSize: 12, color: colors.textFaint, marginTop: 10 },
  notAuthor: { fontSize: 13, color: colors.textMuted, marginTop: spacing.lg, lineHeight: 19 },
  sectionLabel: {
    fontFamily: fonts.serif,
    fontSize: 18,
    color: colors.text,
    marginBottom: 8,
  },
  sectionSpacing: { marginTop: spacing.lg },
  hint: { fontSize: 14, color: colors.textFaint, lineHeight: 20 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  username: { fontSize: 15, color: colors.text, fontWeight: '600' },
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
  error: {
    color: colors.danger,
    backgroundColor: colors.dangerSoft,
    borderRadius: radius.sm,
    padding: 12,
    fontSize: 14,
    marginBottom: spacing.md,
  },
});
