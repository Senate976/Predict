import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { fetchCommentCount } from '../lib/comments';
import { formatCountdown } from '../lib/datetime';
import { isRevealed, type PredictionFeedItem } from '../lib/predictions';
import { colors, fonts, radius } from '../lib/theme';
import { AudioPlayerButton } from './AudioPlayerButton';
import { Avatar } from './Avatar';
import { InlineComments } from './InlineComments';

/**
 * Carte d'une prédiction, partagée entre les onglets À venir et Passées du
 * Fil. Toujours dépliée (teaser, puis contenu une fois révélé) ; un tap sur
 * la carte navigue vers l'écran détail (`onPress`), où l'auteur gère les
 * destinataires et chacun se prononce une fois révélée. Les commentaires,
 * eux, restent repliés derrière une icône dédiée — pas besoin de quitter le
 * Fil pour les consulter.
 */
export function PredictionCard({
  item,
  now,
  authorLabel,
  authorId,
  authorAvatarUrl,
  userId,
  onPress,
  hasVoted = false,
}: {
  item: PredictionFeedItem;
  now: Date;
  authorLabel?: string;
  authorId?: string;
  authorAvatarUrl?: string | null;
  userId: string;
  onPress?: () => void;
  /** Le destinataire s'est déjà prononcé sur cette prédiction — masque le lien
   * « Donner mon avis », qui n'a plus lieu d'être une fois le vote posé. */
  hasVoted?: boolean;
}) {
  const router = useRouter();
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [commentCount, setCommentCount] = useState<number | null>(null);
  const revealAt = new Date(item.reveal_at);
  const revealed = isRevealed(item, now);
  const isAuthor = item.author_id === userId;

  const verdict = revealed && item.final_status !== 'pending' ? item.final_status : null;

  useEffect(() => {
    let cancelled = false;
    fetchCommentCount(item.id).then(({ count }) => {
      if (!cancelled) setCommentCount(count);
    });
    return () => {
      cancelled = true;
    };
  }, [item.id]);

  return (
    <View
      style={[
        styles.card,
        verdict === 'realized' && styles.cardRealized,
        verdict === 'missed' && styles.cardMissed,
      ]}
    >
      <Pressable onPress={() => onPress?.()} style={({ pressed }) => pressed && styles.cardPressed}>
        <View style={styles.cardTop}>
          {authorLabel && (
            <Pressable
              onPress={() => authorId && router.push(`/profile/${authorId}`)}
              style={styles.authorBlock}
              hitSlop={4}
            >
              <Avatar url={authorAvatarUrl} username={authorLabel} size={30} />
              <Text style={styles.authorName} numberOfLines={1}>
                {authorLabel}
              </Text>
            </Pressable>
          )}

          {!verdict && !revealed && (
            <View style={[styles.badge, styles.badgeLocked]}>
              <Text style={[styles.badgeText, styles.badgeTextLocked]}>
                {formatCountdown(revealAt, now)}
              </Text>
            </View>
          )}
        </View>

        <Text style={styles.cardTeaser}>{item.teaser}</Text>

        {revealed && item.content && (
          <View style={styles.contentBox}>
            <Text style={styles.contentLabel}>Prédiction</Text>
            <Text style={styles.cardContent}>{item.content}</Text>
            {item.audio_path && (
              <View style={styles.audioRow}>
                <AudioPlayerButton path={item.audio_path} />
              </View>
            )}
          </View>
        )}
      </Pressable>

      {revealed && !isAuthor && !hasVoted && (
        <Pressable onPress={() => onPress?.()} style={styles.voteLink} hitSlop={4}>
          <Text style={styles.voteLinkText}>Donner mon avis sur cette prédiction →</Text>
        </Pressable>
      )}

      <Pressable onPress={() => setCommentsOpen((o) => !o)} style={styles.commentsToggle} hitSlop={4}>
        <Ionicons
          name={commentsOpen ? 'chatbubble' : 'chatbubble-outline'}
          size={16}
          color={colors.textMuted}
        />
        <Text style={styles.commentsToggleText}>{commentCount ?? 0}</Text>
      </Pressable>

      {commentsOpen && <InlineComments predictionId={item.id} userId={userId} truncate />}
    </View>
  );
}

const styles = StyleSheet.create({
  cardPressed: { opacity: 0.85 },
  card: {
    borderWidth: 1,
    borderColor: 'rgba(173, 138, 62, 0.28)',
    borderRadius: radius.xl,
    padding: 18,
    marginBottom: 22,
    backgroundColor: colors.surface,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 1,
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 10 },
  authorBlock: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1, maxWidth: '65%' },
  authorName: { fontSize: 13, fontWeight: '600', color: colors.textMuted, flexShrink: 1 },
  badge: {
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  badgeLocked: { backgroundColor: colors.goldSoft },
  badgeText: { fontSize: 12, fontWeight: '700' },
  badgeTextLocked: { color: colors.gold },
  cardRealized: { borderLeftWidth: 4, borderLeftColor: colors.success },
  cardMissed: { borderLeftWidth: 4, borderLeftColor: colors.danger },
  cardTeaser: {
    fontFamily: fonts.serifItalic,
    fontSize: 20,
    color: colors.text,
    lineHeight: 26,
  },
  contentBox: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  contentLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.gold,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 4,
  },
  cardContent: {
    fontFamily: fonts.serifItalic,
    fontSize: 20,
    color: colors.text,
    lineHeight: 26,
  },
  audioRow: { marginTop: 10 },
  voteLink: { marginTop: 10 },
  voteLinkText: { fontSize: 13, fontWeight: '600', color: colors.gold },
  commentsToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    marginTop: 10,
  },
  commentsToggleText: { fontSize: 13, fontWeight: '600', color: colors.textMuted },
});
