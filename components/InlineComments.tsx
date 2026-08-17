import { useRouter } from 'expo-router';
import { Trash2, X } from 'lucide-react-native';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Platform, Pressable, StyleSheet, View } from 'react-native';
import { Text } from './Text';
import { TextInput } from './TextInput';

import {
  addComment,
  castCommentEmojiReaction,
  commentErrorMessage,
  deleteComment,
  fetchComments,
  MAX_COMMENT_LENGTH,
  removeCommentEmojiReaction,
  type Comment,
} from '../lib/comments';
import { formatTimeAgo } from '../lib/datetime';
import { EMOJI_REACTIONS, type EmojiReaction } from '../lib/predictions';
import { fonts, radius, type Colors } from '../lib/theme';
import { useColors } from '../lib/themeMode';
import { Avatar } from './Avatar';

/**
 * Fil de commentaires directement sur la carte (Fil, Archives), façon réseau
 * social — pas besoin d'ouvrir l'écran détail pour lire ou réagir. Autorisé
 * aussi bien sur un teaser (avant révélation) que sur une prédiction révélée ;
 * la RLS de `prediction_comments` fait le même contrôle d'accès dans les deux
 * cas (auteur ou destinataire), sans condition de date.
 */
const TRUNCATED_COUNT = 2;

function commentTotalReactions(comment: Comment): number {
  return Object.values(comment.emoji_counts).reduce((sum: number, count) => sum + (count ?? 0), 0);
}

export function InlineComments({
  predictionId,
  userId,
  truncate = false,
  revealed = true,
  isPredictionAuthor = false,
}: {
  predictionId: string;
  userId: string;
  /** Replie la liste aux `TRUNCATED_COUNT` commentaires les plus récents,
   * derrière un bouton « Voir les X autres » — utilisé sur les cartes du Fil
   * et des Archives. L'écran détail, lui, montre toute la discussion. */
  truncate?: boolean;
  /** Avant révélation, le contenu scellé n'est pas encore connu — le
   * placeholder invite à réagir sur le Teaser plutôt qu'à commenter un
   * contenu déjà jugé. */
  revealed?: boolean;
  /** L'auteur de la prédiction peut aussi supprimer les commentaires des
   * autres sur ses propres scellés (modération), pas seulement les siens. */
  isPredictionAuthor?: boolean;
}) {
  const [comments, setComments] = useState<Comment[] | null>(null);
  const [input, setInput] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(!truncate);
  const [replyingTo, setReplyingTo] = useState<{ id: string; username: string; preview: string } | null>(
    null
  );
  // Un seul picker ouvert à la fois, identifié par l'id du commentaire visé —
  // jamais deux bulles de réactions ouvertes en même temps sur le même fil.
  const [reactingTo, setReactingTo] = useState<string | null>(null);
  const router = useRouter();
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);

  useEffect(() => {
    let cancelled = false;
    fetchComments(predictionId).then(({ data }) => {
      if (!cancelled) setComments(data ?? []);
    });
    return () => {
      cancelled = true;
    };
  }, [predictionId]);

  async function handleSend() {
    const trimmed = input.trim();
    if (!trimmed) return;
    setError(null);
    setSubmitting(true);
    try {
      const { error: addError } = await addComment(predictionId, userId, trimmed, replyingTo?.id);
      if (addError) {
        setError(commentErrorMessage(addError));
        return;
      }
      setInput('');
      setReplyingTo(null);
      const { data } = await fetchComments(predictionId);
      setComments(data ?? []);
    } finally {
      setSubmitting(false);
    }
  }

  function adjustCounts(
    counts: Partial<Record<EmojiReaction, number>>,
    remove: EmojiReaction | null,
    add: EmojiReaction | null
  ): Partial<Record<EmojiReaction, number>> {
    const next = { ...counts };
    if (remove) next[remove] = Math.max(0, (next[remove] ?? 0) - 1);
    if (add) next[add] = (next[add] ?? 0) + 1;
    return next;
  }

  /** Même logique optimiste que la réaction sur la prédiction entière
   * (`PredictionCard`) : pose/retire tout de suite, revient en arrière si
   * l'appel échoue. */
  async function handleCommentEmojiPress(comment: Comment, emoji: EmojiReaction) {
    setReactingTo(null);
    const previous = comment.my_emoji_reaction;
    const next = previous === emoji ? null : emoji;
    setComments((prev) =>
      (prev ?? []).map((c) =>
        c.id === comment.id
          ? { ...c, my_emoji_reaction: next, emoji_counts: adjustCounts(c.emoji_counts, previous, next) }
          : c
      )
    );
    const { error: reactError } =
      next === null
        ? await removeCommentEmojiReaction(comment.id, userId)
        : await castCommentEmojiReaction(comment.id, userId, next);
    if (reactError) {
      setComments((prev) =>
        (prev ?? []).map((c) =>
          c.id === comment.id
            ? { ...c, my_emoji_reaction: previous, emoji_counts: adjustCounts(c.emoji_counts, next, previous) }
            : c
        )
      );
    }
  }

  function handleDelete(commentId: string) {
    const message = 'Ce commentaire sera définitivement supprimé.';
    const run = async () => {
      const { error: deleteError } = await deleteComment(commentId);
      if (deleteError) {
        setError(`Suppression impossible : ${deleteError.message}`);
        return;
      }
      setComments((prev) => (prev ?? []).filter((c) => c.id !== commentId));
    };

    if (Platform.OS === 'web') {
      if (window.confirm(`Supprimer ce commentaire ?\n\n${message}`)) run();
      return;
    }
    Alert.alert('Supprimer ce commentaire ?', message, [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Supprimer', style: 'destructive', onPress: run },
    ]);
  }

  const hiddenCount = comments ? Math.max(0, comments.length - TRUNCATED_COUNT) : 0;
  const visibleComments =
    comments && !showAll ? comments.slice(-TRUNCATED_COUNT) : comments;
  // Toujours construite sur la liste complète (pas `visibleComments`) : une
  // réponse repliée hors de la troncature doit quand même pouvoir citer son
  // commentaire d'origine.
  const commentsById = new Map((comments ?? []).map((c) => [c.id, c]));

  return (
    <View style={styles.container}>
      {comments === null ? (
        <ActivityIndicator color={colors.text} style={styles.loader} />
      ) : (
        comments.length > 0 && (
          <View style={styles.list}>
            {hiddenCount > 0 && !showAll && (
              <Pressable onPress={() => setShowAll(true)} style={styles.showMore}>
                <Text style={styles.showMoreText}>
                  Voir les {hiddenCount} autre{hiddenCount > 1 ? 's' : ''} commentaire
                  {hiddenCount > 1 ? 's' : ''}
                </Text>
              </Pressable>
            )}
            {(visibleComments ?? []).map((comment) => {
              const canDelete = comment.author_id === userId || isPredictionAuthor;
              const repliedTo = comment.reply_to_id ? commentsById.get(comment.reply_to_id) : null;
              return (
                <View
                  key={comment.id}
                  style={[styles.comment, repliedTo && styles.commentReply]}
                >
                  <View style={styles.commentTopRow}>
                    <Pressable
                      onPress={() => router.push(`/profile/${comment.author_id}`)}
                      style={styles.commentAuthorRow}
                      hitSlop={4}
                    >
                      <Avatar url={comment.author.avatar_url} username={comment.author.username} size={20} />
                      <Text style={styles.commentAuthor}>{comment.author.username}</Text>
                      <Text style={styles.commentTime}>{formatTimeAgo(comment.created_at, new Date())}</Text>
                    </Pressable>
                    {canDelete && (
                      <Pressable onPress={() => handleDelete(comment.id)} hitSlop={8}>
                        <Trash2 size={14} color={colors.icon} strokeWidth={1.75} />
                      </Pressable>
                    )}
                  </View>
                  <Text style={styles.commentContent}>
                    {repliedTo && (
                      <Text
                        style={styles.replyMention}
                        onPress={() => router.push(`/profile/${repliedTo.author_id}`)}
                      >
                        {repliedTo.author.username}{' '}
                      </Text>
                    )}
                    {comment.content}
                  </Text>
                  <View style={styles.commentActionsRow}>
                    <Pressable
                      onPress={() =>
                        setReplyingTo({
                          id: comment.id,
                          username: comment.author.username,
                          preview: comment.content,
                        })
                      }
                      style={styles.replyLink}
                      hitSlop={4}
                    >
                      <Text style={styles.replyLinkText}>Répondre</Text>
                    </Pressable>

                    <Pressable
                      onPress={() => setReactingTo((prev) => (prev === comment.id ? null : comment.id))}
                      style={styles.reactLink}
                      hitSlop={4}
                    >
                      <Text style={styles.reactLinkText}>
                        {commentTotalReactions(comment) > 0
                          ? `${comment.my_emoji_reaction ?? '👍'} ${commentTotalReactions(comment)}`
                          : 'Réagir'}
                      </Text>
                    </Pressable>
                  </View>

                  {reactingTo === comment.id && (
                    <View style={styles.commentEmojiPanel}>
                      {EMOJI_REACTIONS.map((emoji) => (
                        <Pressable
                          key={emoji}
                          onPress={() => handleCommentEmojiPress(comment, emoji)}
                          style={[
                            styles.commentEmojiItem,
                            comment.my_emoji_reaction === emoji && styles.commentEmojiItemActive,
                          ]}
                          hitSlop={2}
                        >
                          <Text style={styles.commentEmojiItemText}>{emoji}</Text>
                        </Pressable>
                      ))}
                    </View>
                  )}
                </View>
              );
            })}
          </View>
        )
      )}

      {error && <Text style={styles.error}>{error}</Text>}

      {replyingTo && (
        <View style={styles.replyingBox}>
          <Text style={styles.replyingText} numberOfLines={1}>
            Réponse à {replyingTo.username} : « {replyingTo.preview} »
          </Text>
          <Pressable onPress={() => setReplyingTo(null)} hitSlop={8}>
            <X size={14} color={colors.icon} strokeWidth={1.75} />
          </Pressable>
        </View>
      )}

      <View style={styles.inputRow}>
        <TextInput
          value={input}
          onChangeText={setInput}
          placeholder="Commentaire"
          placeholderTextColor={colors.textFaint}
          multiline
          maxLength={MAX_COMMENT_LENGTH}
          editable={!submitting}
          style={styles.input}
        />
        <Pressable onPress={handleSend} disabled={submitting || !input.trim()} style={styles.send}>
          <Text style={styles.sendText}>Envoyer</Text>
        </Pressable>
      </View>
    </View>
  );
}

function createStyles(colors: Colors) {
  return StyleSheet.create({
  // Aucun trait de séparation : c'est le fond distinct du bloc, posé par
  // l'appelant, qui le détache de la carte. Un liseré tombait ici pile sur le
  // bord bas de l'enveloppe et s'y doublait.
  container: {},
  loader: { marginVertical: 8 },
  list: { gap: 8, marginBottom: 10 },
  comment: {},
  // Façon Facebook : une réponse est décalée du bord de page, avec un repère
  // vertical discret qui la rattache visuellement au fil de discussion.
  commentReply: {
    marginLeft: 20,
    paddingLeft: 10,
    borderLeftWidth: 2,
    borderLeftColor: colors.border,
  },
  showMore: { alignSelf: 'flex-start', marginBottom: 2 },
  showMoreText: { fontFamily: fonts.bodyEmphasis, fontSize: 14, color: colors.text },
  commentTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  commentAuthorRow: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', flexShrink: 1 },
  commentAuthor: { fontSize: 14, fontWeight: '700', color: colors.textMuted },
  commentTime: { fontSize: 13, color: colors.textFaint },
  commentContent: { fontSize: 17, color: colors.text, marginTop: 4, lineHeight: 23 },
  replyMention: { fontWeight: '700', color: colors.text },
  commentActionsRow: { flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 4 },
  replyLink: { alignSelf: 'flex-start' },
  replyLinkText: { fontFamily: fonts.bodyEmphasis, fontSize: 13, color: colors.text },
  reactLink: { alignSelf: 'flex-start' },
  reactLinkText: { fontFamily: fonts.bodyEmphasis, fontSize: 13, color: colors.text },
  // Petite bulle inline (pas de geste glissé, contrairement à celle de la
  // prédiction entière) — un tap ouvre/ferme, un tap sur un emoji réagit.
  commentEmojiPanel: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    marginTop: 6,
    padding: 6,
    backgroundColor: colors.surfaceRaised,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    alignSelf: 'flex-start',
  },
  commentEmojiItem: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  commentEmojiItemActive: { backgroundColor: colors.accentSoft },
  commentEmojiItemText: { fontSize: 16 },
  replyingBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    backgroundColor: colors.accentSoft,
    borderRadius: radius.sm,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginBottom: 6,
  },
  replyingText: { flex: 1, fontSize: 12, color: colors.textMuted },
  error: { color: colors.danger, fontSize: 12, marginBottom: 6 },
  // `alignItems: 'center'` plutôt que `flex-end` : le bouton Envoyer se
  // callait sur le bas d'un champ multiligne, ce qui le poussait visiblement
  // plus bas que le texte de la première ligne au lieu d'être centré dessus.
  inputRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  // Zones agrandies d'environ 20 % (padding, taille de texte, hauteur max) —
  // les précédentes se lisaient comme trop petites, y compris pour répondre
  // à un commentaire (même champ, partagé avec un premier commentaire).
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 16,
    color: colors.text,
    backgroundColor: colors.surface,
    maxHeight: 96,
  },
  send: {
    backgroundColor: colors.accent,
    borderRadius: radius.pill,
    paddingHorizontal: 17,
    paddingVertical: 12,
  },
  sendText: { color: colors.textOnAccent, fontSize: 14, fontWeight: '700' },
  });
}
