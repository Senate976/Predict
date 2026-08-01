import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { addComment, commentErrorMessage, fetchComments, MAX_COMMENT_LENGTH, type Comment } from '../../../lib/comments';
import { useAuth } from '../../../lib/auth';
import { formatRevealAt } from '../../../lib/datetime';
import { fetchFriendships, otherProfile, type FriendProfile } from '../../../lib/friends';
import {
  addRecipient,
  fetchPrediction,
  fetchPredictionOutcome,
  fetchPredictionRecipients,
  isRevealed,
  removeRecipient,
  type PredictionFeedItem,
  type PredictionOutcome,
  type PredictionRecipient,
} from '../../../lib/predictions';
import { colors, eyebrow, fonts, radius, spacing } from '../../../lib/theme';
import { castVote, fetchMyVote, voteErrorMessage, type Vote, type VoteValue } from '../../../lib/votes';

const STATUS_LABEL: Record<string, string> = {
  pending: 'En attente du verdict',
  realized: 'Réalisée, selon le Cercle',
  missed: 'Manquée, selon le Cercle',
};

export default function PredictionDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useAuth();
  const router = useRouter();
  const userId = session?.user.id;

  const [prediction, setPrediction] = useState<PredictionFeedItem | null>(null);
  const [recipients, setRecipients] = useState<PredictionRecipient[] | null>(null);
  const [friends, setFriends] = useState<FriendProfile[] | null>(null);
  const [outcome, setOutcome] = useState<PredictionOutcome | null>(null);
  const [myVote, setMyVote] = useState<Vote | null>(null);
  const [comments, setComments] = useState<Comment[] | null>(null);
  const [commentInput, setCommentInput] = useState('');

  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [voteError, setVoteError] = useState<string | null>(null);
  const [commentError, setCommentError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [voting, setVoting] = useState(false);
  const [submittingComment, setSubmittingComment] = useState(false);

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

    const isAuthorNow = item.author_id === userId;

    if (isAuthorNow) {
      const [{ data: recipientsData }, { data: friendships }] = await Promise.all([
        fetchPredictionRecipients(id),
        fetchFriendships(userId),
      ]);
      setRecipients(recipientsData ?? []);
      const accepted = (friendships ?? []).filter((f) => f.status === 'accepted');
      setFriends(accepted.map((f) => otherProfile(f, userId)));
    }

    if (isRevealed(item, new Date())) {
      const [{ data: outcomeData }, { data: commentsData }] = await Promise.all([
        fetchPredictionOutcome(id),
        fetchComments(id),
      ]);
      setOutcome(outcomeData ?? null);
      setComments(commentsData ?? []);

      if (!isAuthorNow) {
        const { data: voteData } = await fetchMyVote(id, userId);
        setMyVote(voteData ?? null);
      }
    }
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

  async function handleVote(value: VoteValue) {
    if (!id || !userId) return;
    setVoteError(null);
    setVoting(true);
    try {
      const { error: castError } = await castVote(id, userId, value);
      if (castError) {
        setVoteError(voteErrorMessage(castError));
        return;
      }
      await load();
    } finally {
      setVoting(false);
    }
  }

  async function handleComment() {
    const trimmed = commentInput.trim();
    if (!id || !userId || !trimmed) return;
    setCommentError(null);
    setSubmittingComment(true);
    try {
      const { error: addError } = await addComment(id, userId, trimmed);
      if (addError) {
        setCommentError(commentErrorMessage(addError));
        return;
      }
      setCommentInput('');
      const { data } = await fetchComments(id);
      setComments(data ?? []);
    } finally {
      setSubmittingComment(false);
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
        <Text style={styles.headerTitle}>Prédiction</Text>
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

            {revealed && outcome && (
              <View style={styles.verdictBox}>
                <Text style={styles.eyebrow}>Verdict du Cercle</Text>
                <Text style={styles.verdict}>{STATUS_LABEL[outcome.final_status]}</Text>
                <Text style={styles.tally}>
                  {outcome.realized_votes} réalisée{outcome.realized_votes > 1 ? 's' : ''} ·{' '}
                  {outcome.missed_votes} manquée{outcome.missed_votes > 1 ? 's' : ''}
                </Text>

                {!isAuthor && (
                  <>
                    {voteError && <Text style={styles.error}>{voteError}</Text>}
                    <View style={styles.voteRow}>
                      <Pressable
                        onPress={() => handleVote('realized')}
                        disabled={voting}
                        style={[
                          styles.voteButton,
                          myVote?.vote_value === 'realized' && styles.voteButtonRealizedActive,
                        ]}
                      >
                        <Text
                          style={[
                            styles.voteButtonText,
                            myVote?.vote_value === 'realized' && styles.voteButtonTextActive,
                          ]}
                        >
                          Réalisée
                        </Text>
                      </Pressable>
                      <Pressable
                        onPress={() => handleVote('missed')}
                        disabled={voting}
                        style={[
                          styles.voteButton,
                          myVote?.vote_value === 'missed' && styles.voteButtonMissedActive,
                        ]}
                      >
                        <Text
                          style={[
                            styles.voteButtonText,
                            myVote?.vote_value === 'missed' && styles.voteButtonTextActive,
                          ]}
                        >
                          Manquée
                        </Text>
                      </Pressable>
                    </View>
                  </>
                )}
              </View>
            )}

            {!isAuthor ? (
              <Text style={styles.notAuthor}>
                Seul l’auteur peut gérer les destinataires de cette prédiction.
              </Text>
            ) : (
              <>
                {actionError && <Text style={styles.error}>{actionError}</Text>}

                <Text style={[styles.eyebrow, styles.sectionSpacing]}>Destinataires</Text>
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

                <Text style={[styles.eyebrow, styles.sectionSpacing]}>Ajouter depuis le Cercle</Text>
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

            {revealed && (
              <>
                <Text style={[styles.eyebrow, styles.sectionSpacing]}>Discussion</Text>
                {comments === null ? (
                  <ActivityIndicator color={colors.gold} style={styles.loader} />
                ) : comments.length === 0 ? (
                  <Text style={styles.hint}>Aucun commentaire pour l’instant.</Text>
                ) : (
                  comments.map((comment) => (
                    <View key={comment.id} style={styles.comment}>
                      <Text style={styles.commentAuthor}>{comment.author.username}</Text>
                      <Text style={styles.commentContent}>{comment.content}</Text>
                    </View>
                  ))
                )}

                {commentError && <Text style={styles.error}>{commentError}</Text>}
                <View style={styles.commentInputRow}>
                  <TextInput
                    value={commentInput}
                    onChangeText={setCommentInput}
                    placeholder="Ajouter un commentaire…"
                    multiline
                    maxLength={MAX_COMMENT_LENGTH}
                    editable={!submittingComment}
                    style={styles.commentInput}
                  />
                  <Pressable
                    onPress={handleComment}
                    disabled={submittingComment || !commentInput.trim()}
                    style={styles.pillGold}
                  >
                    <Text style={styles.pillGoldText}>Envoyer</Text>
                  </Pressable>
                </View>
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
  eyebrow: { ...eyebrow },
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
  verdictBox: {
    marginTop: spacing.lg,
    padding: 16,
    borderRadius: radius.xl,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  verdict: { fontFamily: fonts.serif, fontSize: 19, color: colors.text, marginTop: 6 },
  tally: { fontSize: 13, color: colors.textFaint, marginTop: 6 },
  voteRow: { flexDirection: 'row', gap: 10, marginTop: 14 },
  voteButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    paddingVertical: 12,
    alignItems: 'center',
    backgroundColor: colors.background,
  },
  voteButtonRealizedActive: { borderColor: colors.success, backgroundColor: colors.successSoft },
  voteButtonMissedActive: { borderColor: colors.danger, backgroundColor: colors.dangerSoft },
  voteButtonText: { fontSize: 13, fontWeight: '600', color: colors.textMuted },
  voteButtonTextActive: { color: colors.text },
  notAuthor: { fontSize: 13, color: colors.textMuted, marginTop: spacing.lg, lineHeight: 19 },
  sectionSpacing: { marginTop: spacing.lg, marginBottom: 8 },
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
  comment: {
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  commentAuthor: { fontSize: 12, fontWeight: '700', color: colors.textMuted },
  commentContent: { fontSize: 14, color: colors.text, marginTop: 2, lineHeight: 20 },
  commentInputRow: { flexDirection: 'row', gap: 8, marginTop: 12, alignItems: 'flex-end' },
  commentInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: colors.text,
    backgroundColor: colors.surface,
    maxHeight: 90,
  },
  error: {
    color: colors.danger,
    backgroundColor: colors.dangerSoft,
    borderRadius: radius.sm,
    padding: 12,
    fontSize: 14,
    marginBottom: spacing.md,
  },
});
