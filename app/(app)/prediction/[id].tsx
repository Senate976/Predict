import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
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

import { AudioPlayerButton } from '../../../components/AudioPlayerButton';
import { Avatar } from '../../../components/Avatar';
import { CreateFab } from '../../../components/CreateFab';
import { InlineComments } from '../../../components/InlineComments';
import { PredictWord } from '../../../components/PredictWord';
import { useAuth } from '../../../lib/auth';
import { formatAdvance, formatShortDateTime } from '../../../lib/datetime';
import { fetchFriendships, otherProfile, type FriendProfile } from '../../../lib/friends';
import {
  addRecipient,
  CATEGORY_LABEL,
  fetchPrediction,
  fetchPredictionRecipients,
  isRevealed,
  removeRecipient,
  revealPredictionNow,
  type PredictionFeedItem,
  type PredictionRecipient,
} from '../../../lib/predictions';
import { supabase } from '../../../lib/supabase';
import { colors, eyebrow, fonts, radius, spacing } from '../../../lib/theme';

export default function PredictionDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useAuth();
  const router = useRouter();
  const userId = session?.user.id;

  const [prediction, setPrediction] = useState<PredictionFeedItem | null>(null);
  const [author, setAuthor] = useState<{ username: string; avatar_url: string | null } | null>(null);
  const [recipients, setRecipients] = useState<PredictionRecipient[] | null>(null);
  const [friends, setFriends] = useState<FriendProfile[] | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [recipientsError, setRecipientsError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [recipientsOpen, setRecipientsOpen] = useState(false);
  const [revealing, setRevealing] = useState(false);
  const [revealError, setRevealError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id || !userId) return;

    const { data: item, error: fetchError } = await fetchPrediction(id);
    if (fetchError) {
      setError(`Chargement impossible : ${fetchError.message}`);
      return;
    }
    if (!item) {
      setError('Predict introuvable.');
      return;
    }
    setError(null);
    setPrediction(item);

    const isAuthorNow = item.author_id === userId;

    // Les destinataires se chargent pour tout le monde — ouvrir un Predict
    // doit montrer toute l'audience, pas seulement à l'auteur. Seuls l'ajout
    // et le retrait restent réservés à l'auteur (chargement des amis inclus).
    // L'auteur (avatar + pseudo) se charge aussi pour tout le monde — sans
    // ça, impossible de savoir qui a écrit ce qu'on est en train de lire.
    const [{ data: recipientsData, error: recipientsFetchError }, friendshipsResult, { data: authorProfile }] =
      await Promise.all([
        fetchPredictionRecipients(id),
        isAuthorNow ? fetchFriendships(userId) : Promise.resolve({ data: null }),
        supabase.from('profiles').select('username, avatar_url').eq('id', item.author_id).maybeSingle(),
      ]);
    setAuthor(authorProfile ?? null);
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

  function handleRevealNow() {
    if (!id) return;
    const message =
      'Le contenu deviendra visible pour tes destinataires et le verdict pourra être donné. Cette action est irréversible.';

    const run = async () => {
      setRevealError(null);
      setRevealing(true);
      try {
        const { error: revealErr } = await revealPredictionNow(id);
        if (revealErr) {
          setRevealError(`Révélation impossible : ${revealErr.message}`);
          return;
        }
        await load();
      } finally {
        setRevealing(false);
      }
    };

    if (Platform.OS === 'web') {
      if (window.confirm(`Révéler ce Predict maintenant ?\n\n${message}`)) run();
      return;
    }
    Alert.alert('Révéler ce Predict maintenant ?', message, [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Révéler', style: 'destructive', onPress: run },
    ]);
  }

  const isAuthor = prediction && userId && prediction.author_id === userId;
  const revealed = prediction ? isRevealed(prediction, new Date()) : false;
  // Écart entre le scellé et la révélation — juste informatif, pour souligner
  // à quel point la prédiction a été anticipée. Sans objet pour une prédiction
  // « ouverte » : `reveal_at` n'y porte qu'un repère technique lointain.
  const advanceLabel = prediction
    ? prediction.is_immediate
      ? 'Révélée immédiatement'
      : prediction.open_ended && !revealed
        ? 'Révélation laissée à la discrétion de l’auteur'
        : formatAdvance(new Date(prediction.created_at), new Date(prediction.reveal_at))
    : '';

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <Text style={styles.back}>Retour</Text>
        </Pressable>
        <Text style={styles.headerTitle}>
          <PredictWord />
        </Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        {error && <Text style={styles.error}>{error}</Text>}

        {!prediction && !error ? (
          <ActivityIndicator color={colors.text} style={styles.loader} />
        ) : prediction ? (
          <>
            {author && (
              <Pressable
                onPress={() => router.push(`/profile/${prediction.author_id}`)}
                style={styles.authorBlock}
                hitSlop={4}
              >
                <Avatar url={author.avatar_url} username={author.username} size={28} />
                <Text style={styles.authorName}>{author.username}</Text>
              </Pressable>
            )}

            <View style={styles.categoryBadge}>
              <Text style={styles.categoryBadgeText}>{CATEGORY_LABEL[prediction.category]}</Text>
            </View>

            <Text style={styles.teaser}>{prediction.teaser}</Text>

            {/* Avant révélation, seul l'écart annoncé compte — les deux dates
                elles-mêmes n'apportent rien de plus que le teaser et
                l'indice « sera révélée le » juste en dessous. Une fois
                révélée, la date de scellé redevient utile comme repère. */}
            {revealed ? (
              <View style={styles.datesBlock}>
                <Text style={styles.sealedDate}>
                  Scellé le {formatShortDateTime(new Date(prediction.created_at))}
                </Text>
                <Text style={styles.daysAdvance}>{advanceLabel}</Text>
              </View>
            ) : (
              <Text style={styles.daysAdvanceCentered}>{advanceLabel}</Text>
            )}

            {/* Le cœur de l'écran : le contenu de la prédiction prime sur tout
                le reste, y compris le verdict — repoussé tout en bas. Même
                taille de police que le Teaser, volontairement : les deux sont
                la promesse de l'auteur, avant et après révélation.
                L'auteur voit toujours son propre contenu, même avant
                révélation — seul un destinataire attend l'heure dite. */}
            <View style={styles.contentHero}>
              {(revealed || isAuthor) && prediction.content ? (
                <>
                  {/* Le flou ne concerne que les destinataires (avant
                      révélation, ils n'ont de toute façon rien à cet endroit
                      via la RLS) : l'auteur voit toujours son propre texte
                      net, y compris avant révélation. */}
                  <Text style={styles.contentHeroText}>{prediction.content}</Text>
                  {prediction.audio_path && (
                    <View style={styles.audioRow}>
                      <AudioPlayerButton path={prediction.audio_path} />
                    </View>
                  )}
                </>
              ) : (
                <Text style={styles.sealedHint}>
                  {prediction.open_ended
                    ? 'L’auteur choisira quand la révéler.'
                    : `Révélation le ${formatShortDateTime(new Date(prediction.reveal_at))}.`}
                </Text>
              )}
            </View>

            {isAuthor && !revealed && (
              <View style={styles.revealNowBox}>
                {revealError && <Text style={styles.error}>{revealError}</Text>}
                <Pressable
                  onPress={handleRevealNow}
                  disabled={revealing}
                  style={styles.revealNowButton}
                >
                  <Text style={styles.revealNowButtonText}>
                    {revealing ? 'Révélation…' : 'Révéler maintenant'}
                  </Text>
                </Pressable>
              </View>
            )}

            <Pressable
              onPress={() => setRecipientsOpen((o) => !o)}
              style={[styles.sectionToggle, styles.sectionSpacing]}
              hitSlop={4}
            >
              <Text style={styles.eyebrow}>Destinataires</Text>
              <Text style={styles.chevron}>{recipientsOpen ? ' ▲' : ' ▼'}</Text>
            </Pressable>

            {recipientsOpen && (
              <>
                {recipientsError && <Text style={styles.error}>{recipientsError}</Text>}
                {actionError && <Text style={styles.error}>{actionError}</Text>}
                {recipients === null ? (
                  <ActivityIndicator color={colors.text} style={styles.loader} />
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

                {/* Ajouter un destinataire n'a plus de sens une fois la
                    prédiction révélée — réservé à l'auteur, avant révélation. */}
                {isAuthor && !revealed && (
                  <>
                    <Text style={[styles.eyebrow, styles.sectionSpacing]}>Ajouter depuis le Cercle</Text>
                    {friends === null ? (
                      <ActivityIndicator color={colors.text} style={styles.loader} />
                    ) : addableFriends.length === 0 ? (
                      <Text style={styles.hint}>
                        Tout ton Cercle a déjà accès, ou tu n’as pas encore d’ami.
                      </Text>
                    ) : (
                      addableFriends.map((friend) => (
                        <View key={friend.id} style={styles.row}>
                          <View style={styles.usernameRow}>
                            <Avatar url={friend.avatar_url} username={friend.username} size={24} />
                            <Text style={styles.username}>{friend.username}</Text>
                          </View>
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
            )}

            <Text style={[styles.eyebrow, styles.sectionSpacing]}>Discussion</Text>
            <InlineComments
              predictionId={id}
              userId={userId!}
              revealed={revealed}
              isPredictionAuthor={!!isAuthor}
            />
          </>
        ) : null}
      </ScrollView>

      <CreateFab />
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
  headerTitle: {
    fontFamily: fonts.display,
    fontSize: 17,
    color: colors.text,
  },
  back: { fontSize: 15, color: colors.text, width: 56 },
  headerSpacer: { width: 56 },
  scroll: { padding: spacing.lg, paddingBottom: 48 },
  loader: { marginTop: 24 },
  eyebrow: { ...eyebrow },
  authorBlock: { flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'flex-start', marginBottom: 12 },
  authorName: { fontFamily: fonts.bodyEmphasis, fontSize: 16, color: colors.icon },
  // La catégorie n'apparaît plus sur la carte du Fil — seulement ici, une
  // fois le Predict ouvert. Jaune réservé aux éléments interactifs majeurs :
  // ici, simple étiquette au trait noir.
  categoryBadge: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: colors.text,
    borderRadius: radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 5,
    marginBottom: 10,
  },
  categoryBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.text,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  teaser: { fontFamily: fonts.sansBold, fontSize: 24, color: colors.text, lineHeight: 30 },
  datesBlock: { marginTop: 10 },
  // Un peu plus marqué que les autres repères secondaires de cet écran :
  // savoir quand le Predict a été scellé reste une information importante,
  // pas un simple détail à estomper.
  sealedDate: { fontSize: 13, fontWeight: '700', color: colors.textMuted },
  daysAdvance: { fontSize: 16, fontWeight: '600', color: colors.textMuted, marginTop: 2 },
  daysAdvanceCentered: { fontSize: 16, fontWeight: '600', color: colors.textMuted, textAlign: 'center', marginTop: 10 },
  contentHero: {
    marginTop: spacing.xl,
    marginBottom: spacing.lg,
    alignItems: 'center',
  },
  contentHeroText: {
    fontFamily: fonts.sansBold,
    fontSize: 24,
    color: colors.text,
    lineHeight: 30,
    textAlign: 'center',
  },
  audioRow: { marginTop: 16 },
  sealedHint: {
    fontSize: 14,
    color: colors.textFaint,
    textAlign: 'center',
  },
  revealNowBox: { alignItems: 'center', marginTop: spacing.md },
  // Même contour noir sur fond blanc que les autres actions de cet écran
  // (« Ajouter », « Retirer ») — pas un remplissage jaune, réservé au FAB.
  revealNowButton: {
    borderWidth: 1,
    borderColor: colors.text,
    borderRadius: radius.pill,
    paddingHorizontal: 20,
    paddingVertical: 11,
    backgroundColor: colors.surface,
  },
  revealNowButtonText: { fontSize: 13, fontWeight: '700', color: colors.text },
  sectionSpacing: { marginTop: spacing.lg, marginBottom: 8 },
  sectionToggle: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start' },
  chevron: { fontSize: 11, color: colors.textFaint },
  hint: { fontSize: 14, color: colors.textFaint, lineHeight: 20 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
  },
  username: { fontSize: 15, color: colors.text, fontWeight: '600' },
  usernameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  // Actions en ligne, allégées comme dans le Cercle : contour plutôt que
  // jaune plein.
  pillGold: {
    borderWidth: 1,
    borderColor: colors.text,
    borderRadius: radius.pill,
    paddingHorizontal: 14,
    paddingVertical: 7,
    backgroundColor: colors.surface,
  },
  pillGoldText: { color: colors.text, fontSize: 13, fontWeight: '700' },
  pillOutline: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    paddingHorizontal: 14,
    paddingVertical: 7,
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
