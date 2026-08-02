import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AudioPlayerButton } from '../../../components/AudioPlayerButton';
import { InlineComments } from '../../../components/InlineComments';
import { QuickCreateButton } from '../../../components/QuickCreateButton';
import { RoyalSeal } from '../../../components/RoyalSeal';
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

  const [error, setError] = useState<string | null>(null);
  const [recipientsError, setRecipientsError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [voteError, setVoteError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [voting, setVoting] = useState(false);

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

    // Les destinataires se chargent pour tout le monde — ouvrir une prédiction
    // doit montrer toute l'audience, pas seulement à l'auteur. Seuls l'ajout
    // et le retrait restent réservés à l'auteur (chargement des amis inclus).
    const [{ data: recipientsData, error: recipientsFetchError }, friendshipsResult] =
      await Promise.all([
        fetchPredictionRecipients(id),
        isAuthorNow ? fetchFriendships(userId) : Promise.resolve({ data: null }),
      ]);
    if (recipientsFetchError) {
      // Ne jamais confondre une vraie erreur avec « personne pour l'instant » :
      // sans ça, un souci de chargement se lisait comme une prédiction sans
      // aucun destinataire, ce qui n'est jamais vrai (l'auteur a toujours au
      // moins lui-même, et le scope choisi à la création peuple toujours
      // `prediction_access`).
      setRecipientsError(`Chargement des destinataires impossible : ${recipientsFetchError.message}`);
      setRecipients([]);
    } else {
      setRecipientsError(null);
      setRecipients(recipientsData ?? []);
    }
    if (isAuthorNow) {
      const accepted = (friendshipsResult.data ?? []).filter((f) => f.status === 'accepted');
      setFriends(accepted.map((f) => otherProfile(f, userId)));
    }

    if (isRevealed(item, new Date())) {
      const { data: outcomeData } = await fetchPredictionOutcome(id);
      setOutcome(outcomeData ?? null);

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

  const isAuthor = prediction && userId && prediction.author_id === userId;
  const revealed = prediction ? isRevealed(prediction, new Date()) : false;

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <Text style={styles.back}>Retour</Text>
        </Pressable>
        <Text style={styles.headerTitle}>Prédiction</Text>
        <QuickCreateButton />
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        {error && <Text style={styles.error}>{error}</Text>}

        {!prediction && !error ? (
          <ActivityIndicator color={colors.gold} style={styles.loader} />
        ) : prediction ? (
          <>
            {/* Date de scellé bien en évidence, juste au-dessus du Teaser. */}
            <View style={styles.sealedDateRow}>
              <RoyalSeal size={16} />
              <Text style={styles.sealedDate}>{formatRevealAt(new Date(prediction.created_at))}</Text>
            </View>

            <Text style={styles.teaser}>{prediction.teaser}</Text>

            {/* Le cœur de l'écran : le contenu de la prédiction prime sur tout
                le reste, y compris le verdict — repoussé tout en bas. Même
                taille de police que le Teaser, volontairement : les deux sont
                la promesse de l'auteur, avant et après révélation. */}
            <View style={styles.contentHero}>
              {revealed && prediction.content ? (
                <>
                  <Text style={styles.contentHeroText}>{prediction.content}</Text>
                  {prediction.audio_path && (
                    <View style={styles.audioRow}>
                      <AudioPlayerButton path={prediction.audio_path} />
                    </View>
                  )}
                </>
              ) : (
                <Text style={styles.sealedHint}>Contenu scellé jusqu’à la révélation.</Text>
              )}
            </View>

            {/* Depuis que le Fil n'affiche plus ni la date de scellé ni celle
                de révélation, cet écran détail est la seule à les montrer —
                toujours visible, avant comme après la révélation. */}
            <View style={styles.datesBlock}>
              <View style={styles.dateLineRow}>
                <Ionicons name="lock-open" size={13} color={colors.textFaint} />
                <Text style={styles.dateLine}>{formatRevealAt(new Date(prediction.reveal_at))}</Text>
              </View>
            </View>

            <Text style={[styles.eyebrow, styles.sectionSpacing]}>Destinataires</Text>
            {recipientsError && <Text style={styles.error}>{recipientsError}</Text>}
            {actionError && <Text style={styles.error}>{actionError}</Text>}
            {recipients === null ? (
              <ActivityIndicator color={colors.gold} style={styles.loader} />
            ) : recipients.length === 0 ? (
              <Text style={styles.hint}>Personne pour l’instant.</Text>
            ) : (
              recipients.map((r) => (
                <View key={r.user_id} style={styles.row}>
                  <Text style={styles.username}>{r.profile.username}</Text>
                  {isAuthor && (
                    <Pressable
                      onPress={() => handleRemove(r.user_id)}
                      disabled={pendingId === r.user_id}
                      style={styles.pillOutline}
                    >
                      <Text style={styles.pillOutlineText}>Retirer</Text>
                    </Pressable>
                  )}
                </View>
              ))
            )}

            {isAuthor && (
              <>
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

            <Text style={[styles.eyebrow, styles.sectionSpacing]}>Discussion</Text>
            <InlineComments predictionId={id} userId={userId!} />

            {revealed && outcome && (
              <View style={styles.verdictBox}>
                <Text style={styles.eyebrowSmall}>Verdict du Cercle</Text>
                <Text style={styles.verdict}>{STATUS_LABEL[outcome.final_status]}</Text>
                <Text style={styles.tally}>
                  {outcome.realized_votes} réalisée{outcome.realized_votes > 1 ? 's' : ''} ·{' '}
                  {outcome.missed_votes} manquée{outcome.missed_votes > 1 ? 's' : ''}
                </Text>

                {!isAuthor && (
                  <>
                    {voteError && <Text style={styles.error}>{voteError}</Text>}
                    {myVote ? (
                      // Choix définitif une fois posé : jamais de bouton pour en
                      // reprendre un autre, seulement un rappel de ce qui a été dit.
                      <Text style={styles.voteLockedText}>
                        Tu as indiqué : {myVote.vote_value === 'realized' ? 'Réalisée' : 'Manquée'}
                      </Text>
                    ) : (
                      <View style={styles.voteRow}>
                        <Pressable
                          onPress={() => handleVote('realized')}
                          disabled={voting}
                          style={styles.voteButton}
                        >
                          <Text style={styles.voteButtonText}>Réalisée</Text>
                        </Pressable>
                        <Pressable
                          onPress={() => handleVote('missed')}
                          disabled={voting}
                          style={styles.voteButton}
                        >
                          <Text style={styles.voteButtonText}>Manquée</Text>
                        </Pressable>
                      </View>
                    )}
                  </>
                )}
              </View>
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
  headerTitle: { fontFamily: fonts.serifItalic, fontSize: 18, color: colors.text },
  back: { fontSize: 15, color: colors.gold, width: 56 },
  scroll: { padding: spacing.lg, paddingBottom: 48 },
  loader: { marginTop: 24 },
  eyebrow: { ...eyebrow },
  eyebrowSmall: { ...eyebrow, fontSize: 10 },
  sealedDateRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 },
  sealedDate: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.textMuted,
  },
  teaser: { fontFamily: fonts.serifItalic, fontSize: 28, color: colors.text, lineHeight: 36 },
  contentHero: {
    marginTop: spacing.xl,
    marginBottom: spacing.lg,
    alignItems: 'center',
  },
  contentHeroText: {
    fontFamily: fonts.serifItalic,
    fontSize: 28,
    color: colors.text,
    lineHeight: 36,
    textAlign: 'center',
  },
  audioRow: { marginTop: 16 },
  sealedHint: {
    fontSize: 14,
    color: colors.textFaint,
    fontStyle: 'italic',
    textAlign: 'center',
  },
  datesBlock: { alignItems: 'center', marginBottom: spacing.md },
  dateLineRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 },
  dateLine: { fontSize: 12, color: colors.textFaint },
  verdictBox: {
    marginTop: spacing.xl,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  verdict: { fontFamily: fonts.serifItalic, fontSize: 15, color: colors.text, marginTop: 4 },
  tally: { fontSize: 12, color: colors.textFaint, marginTop: 4 },
  voteRow: { flexDirection: 'row', gap: 8, marginTop: 10 },
  voteButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    paddingVertical: 8,
    alignItems: 'center',
    backgroundColor: colors.background,
  },
  voteButtonText: { fontSize: 12, fontWeight: '600', color: colors.textMuted },
  voteLockedText: { fontSize: 14, fontWeight: '700', color: colors.text, marginTop: 10 },
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
  error: {
    color: colors.danger,
    backgroundColor: colors.dangerSoft,
    borderRadius: radius.sm,
    padding: 12,
    fontSize: 14,
    marginBottom: spacing.md,
  },
});
