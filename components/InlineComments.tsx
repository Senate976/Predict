import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { addComment, commentErrorMessage, fetchComments, MAX_COMMENT_LENGTH, type Comment } from '../lib/comments';
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
}) {
  const [comments, setComments] = useState<Comment[] | null>(null);
  const [input, setInput] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(!truncate);
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
      const { error: addError } = await addComment(predictionId, userId, trimmed);
      if (addError) {
        setError(commentErrorMessage(addError));
        return;
      }
      setInput('');
      const { data } = await fetchComments(predictionId);
      setComments(data ?? []);
    } finally {
      setSubmitting(false);
    }
  }

  const hiddenCount = comments ? Math.max(0, comments.length - TRUNCATED_COUNT) : 0;
  const visibleComments =
    comments && !showAll ? comments.slice(-TRUNCATED_COUNT) : comments;

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
            {(visibleComments ?? []).map((comment) => (
              <View key={comment.id} style={styles.comment}>
                <Pressable
                  onPress={() => router.push(`/profile/${comment.author_id}`)}
                  style={styles.commentAuthorRow}
                  hitSlop={4}
                >
                  <Avatar url={comment.author.avatar_url} username={comment.author.username} size={20} />
                  <Text style={styles.commentAuthor}>{comment.author.username}</Text>
                </Pressable>
                <Text style={styles.commentContent}>{comment.content}</Text>
              </View>
            ))}
          </View>
        )
      )}

      {error && <Text style={styles.error}>{error}</Text>}

      <View style={styles.inputRow}>
        <TextInput
          value={input}
          onChangeText={setInput}
          placeholder={revealed ? 'Ajouter un commentaire…' : 'Une idée ? Une réaction ?'}
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
  commentAuthorRow: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start' },
  commentAuthor: { fontSize: 12, fontWeight: '700', color: colors.textMuted },
  commentContent: { fontSize: 14, color: colors.text, marginTop: 4, lineHeight: 19 },
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
