import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { formatCountdown, formatRevealAt } from '../lib/datetime';
import { isRevealed, type PredictionFeedItem } from '../lib/predictions';
import { colors, fonts, radius } from '../lib/theme';
import { AudioPlayerButton } from './AudioPlayerButton';
import { Avatar } from './Avatar';
import { InlineComments } from './InlineComments';

/**
 * Carte d'une prédiction, partagée entre le Fil et les Archives.
 *
 * `mode: 'link'` (Fil, par défaut) : la carte est toujours dépliée, un tap
 * navigue vers l'écran détail (`onPress`) où l'auteur gère les destinataires
 * et chacun se prononce une fois révélée.
 *
 * `mode: 'accordion'` (Archives) : repliée par défaut (teaser seul), un tap
 * déplie/replie le contenu et les commentaires sur place — pas de navigation.
 */
export function PredictionCard({
  item,
  now,
  authorLabel,
  authorId,
  authorAvatarUrl,
  userId,
  onPress,
  mode = 'link',
}: {
  item: PredictionFeedItem;
  now: Date;
  authorLabel?: string;
  authorId?: string;
  authorAvatarUrl?: string | null;
  userId: string;
  onPress?: () => void;
  mode?: 'link' | 'accordion';
}) {
  const router = useRouter();
  const [expanded, setExpanded] = useState(mode !== 'accordion');
  const revealAt = new Date(item.reveal_at);
  const revealed = isRevealed(item, now);
  const showBody = mode === 'link' || expanded;
  const isAuthor = item.author_id === userId;

  const verdict = revealed && item.final_status !== 'pending' ? item.final_status : null;

  function handlePress() {
    if (mode === 'accordion') {
      setExpanded((e) => !e);
    } else {
      onPress?.();
    }
  }

  return (
    <View
      style={[
        styles.card,
        verdict === 'realized' && styles.cardRealized,
        verdict === 'missed' && styles.cardMissed,
      ]}
    >
      <Pressable onPress={handlePress} style={({ pressed }) => pressed && styles.cardPressed}>
        <View style={styles.cardTop}>
          {authorLabel && (
            <Pressable
              onPress={() => authorId && router.push(`/profile/${authorId}`)}
              style={styles.authorBlock}
              hitSlop={4}
            >
              <Avatar url={authorAvatarUrl} username={authorLabel} size={36} />
              <Text style={styles.authorName} numberOfLines={1}>
                {authorLabel}
              </Text>
            </Pressable>
          )}

          <View style={styles.cardTopRight}>
            {mode === 'accordion' && <Text style={styles.chevron}>{expanded ? '▲' : '▼'}</Text>}
            {!verdict && (
              <View style={[styles.badge, !revealed ? styles.badgeLocked : styles.badgeNeutral]}>
                <Text style={[styles.badgeText, !revealed ? styles.badgeTextLocked : styles.badgeTextNeutral]}>
                  {!revealed ? formatCountdown(revealAt, now) : 'Révélée'}
                </Text>
              </View>
            )}
          </View>
        </View>

        <Text style={styles.cardTeaser}>{item.teaser}</Text>

        {showBody && revealed && item.content && (
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

        {item.recipient_usernames.length > 0 && (
          <Text style={styles.recipientsLine} numberOfLines={2}>
            Destiné à : {item.recipient_usernames.join(', ')}
          </Text>
        )}

        {/* Date de révélation volontairement absente du Fil — seul l'écran
            détail la précise ; ici, l'encart « dans X » en haut de carte
            suffit à savoir que ça arrive bientôt. */}
        <View style={styles.dateRow}>
          <MaterialCommunityIcons name="seal" size={14} color={colors.textMuted} />
          <Text style={styles.cardMeta}>{formatRevealAt(new Date(item.created_at))}</Text>
        </View>
      </Pressable>

      {showBody && (
        <>
          {mode === 'accordion' && revealed && (
            <Pressable onPress={() => onPress?.()} style={styles.voteLink} hitSlop={4}>
              <Text style={styles.voteLinkText}>
                {isAuthor ? 'Voir les destinataires →' : 'Donner mon avis sur cette prédiction →'}
              </Text>
            </Pressable>
          )}
          <InlineComments predictionId={item.id} userId={userId} truncate />
        </>
      )}
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
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, marginBottom: 10 },
  cardTopRight: { alignItems: 'flex-end', gap: 6 },
  authorBlock: { alignItems: 'center', maxWidth: 88 },
  authorName: { fontSize: 13, fontWeight: '600', color: colors.textMuted, marginTop: 4, textAlign: 'center' },
  badge: {
    alignSelf: 'flex-end',
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  badgeLocked: { backgroundColor: colors.goldSoft },
  badgeNeutral: { backgroundColor: colors.border },
  badgeText: { fontSize: 12, fontWeight: '700' },
  badgeTextLocked: { color: colors.gold },
  badgeTextNeutral: { color: colors.textMuted },
  chevron: { fontSize: 11, color: colors.textFaint },
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
  recipientsLine: { fontSize: 12, color: colors.textMuted, fontWeight: '600', marginTop: 10 },
  dateRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 6 },
  cardMeta: { fontSize: 12, color: colors.textFaint },
  voteLink: { marginTop: 10 },
  voteLinkText: { fontSize: 13, fontWeight: '600', color: colors.gold },
});
