import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import {
  addComment,
  commentErrorMessage,
  deleteComment,
  fetchComments,
  MAX_COMMENT_LENGTH,
  type Comment,
} from '../lib/comments';
import { formatTimeAgo } from '../lib/datetime';
import { colors, radius } from '../lib/theme';
import { Avatar } from './Avatar';

/**
 * Fil de commentaires directement sur la carte (Fil, Archives), façon réseau
 * social — pas besoin d'ouvrir l'écran détail pour lire ou réagir. Autorisé
 * aussi bien sur un teaser (avant révélation) que sur une prédiction révélée ;
 * la RLS de `prediction_comments` fait le même contrôle d'accès dans les deux
 * cas (auteur ou destinataire), sans condition de date.
 */
const TRUNCATED_COUNT = 2;

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
  const router = useRouter();

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
        <ActivityIndicator color={colors.gold} style={styles.loader} />
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
                <View key={comment.id} style={styles.comment}>
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
                        <Ionicons name="trash-outline" size={14} color={colors.textFaint} />
                      </Pressable>
                    )}
                  </View>
                  {repliedTo && (
                    <Text style={styles.replyQuote} numberOfLines={1}>
                      ↳ Réponse à {repliedTo.author.username} : « {repliedTo.content} »
                    </Text>
                  )}
                  <Text style={styles.commentContent}>{comment.content}</Text>
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
            <Ionicons name="close" size={14} color={colors.textFaint} />
          </Pressable>
        </View>
      )}

      <View style={styles.inputRow}>
        <TextInput
          value={input}
          onChangeText={setInput}
          placeholder={revealed ? 'Ajouter un commentaire…' : 'Une idée ? Une réaction ?'}
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

const styles = StyleSheet.create({
  container: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  loader: { marginVertical: 8 },
  list: { gap: 8, marginBottom: 10 },
  comment: {},
  showMore: { alignSelf: 'flex-start', marginBottom: 2 },
  showMoreText: { fontSize: 12, fontWeight: '600', color: colors.gold },
  commentTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  commentAuthorRow: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', flexShrink: 1 },
  commentAuthor: { fontSize: 12, fontWeight: '700', color: colors.textMuted },
  commentTime: { fontSize: 11, color: colors.textFaint },
  commentContent: { fontSize: 14, color: colors.text, marginTop: 4, lineHeight: 19 },
  replyQuote: { fontSize: 12, color: colors.textFaint, marginTop: 4, fontStyle: 'italic' },
  replyLink: { alignSelf: 'flex-start', marginTop: 4 },
  replyLinkText: { fontSize: 11, fontWeight: '600', color: colors.gold },
  replyingBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    backgroundColor: colors.goldSoft,
    borderRadius: radius.sm,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginBottom: 6,
  },
  replyingText: { flex: 1, fontSize: 12, color: colors.textMuted },
  error: { color: colors.danger, fontSize: 12, marginBottom: 6 },
  inputRow: { flexDirection: 'row', gap: 8, alignItems: 'flex-end' },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 13,
    color: colors.text,
    backgroundColor: colors.surface,
    maxHeight: 80,
  },
  send: {
    backgroundColor: colors.goldSoft,
    borderRadius: radius.pill,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  sendText: { color: colors.gold, fontSize: 12, fontWeight: '700' },
});
