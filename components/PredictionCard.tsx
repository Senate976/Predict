import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { formatCountdown, formatRevealAt } from '../lib/datetime';
import { isRevealed, type PredictionFeedItem } from '../lib/predictions';
import { colors, fonts, radius } from '../lib/theme';
import { AudioPlayerButton } from './AudioPlayerButton';
import { Avatar } from './Avatar';
import { InlineComments } from './InlineComments';
import { SealBadge } from './SealBadge';

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

  function handlePress() {
    if (mode === 'accordion') {
      setExpanded((e) => !e);
    } else {
      onPress?.();
    }
  }

  return (
    <View style={styles.card}>
      <Pressable onPress={handlePress} style={({ pressed }) => pressed && styles.cardPressed}>
        <View style={styles.cardTop}>
          {!revealed && <SealBadge />}
          <View style={[styles.badge, revealed ? styles.badgeOpen : styles.badgeLocked]}>
            <Text style={[styles.badgeText, revealed ? styles.badgeTextOpen : styles.badgeTextLocked]}>
              {revealed ? 'Révélée' : formatCountdown(revealAt, now)}
            </Text>
          </View>
          {mode === 'accordion' && <Text style={styles.chevron}>{expanded ? '▲' : '▼'}</Text>}
        </View>

        {authorLabel && (
          <Pressable
            onPress={() => authorId && router.push(`/profile/${authorId}`)}
            style={styles.authorRow}
            hitSlop={4}
          >
            <Avatar url={authorAvatarUrl} username={authorLabel} size={18} />
            <Text style={styles.author}>{authorLabel}</Text>
          </Pressable>
        )}
        <Text style={styles.cardTeaser}>{item.teaser}</Text>

        {showBody &&
          (revealed && item.content ? (
            <View style={styles.contentBox}>
              <Text style={styles.contentLabel}>Contenu</Text>
              <Text style={styles.cardContent}>{item.content}</Text>
              {item.audio_path && (
                <View style={styles.audioRow}>
                  <AudioPlayerButton path={item.audio_path} />
                </View>
              )}
            </View>
          ) : (
            <View style={styles.sealedBox}>
              <Text style={styles.sealedText}>Contenu scellé jusqu’à la révélation</Text>
            </View>
          ))}

        <Text style={styles.cardMeta}>
          {revealed ? 'Révélée' : 'Se révèle'} {formatRevealAt(revealAt)}
        </Text>
      </Pressable>

      {showBody && <InlineComments predictionId={item.id} userId={userId} truncate />}
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
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  badge: {
    alignSelf: 'flex-start',
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  badgeLocked: { backgroundColor: colors.goldSoft },
  badgeOpen: { backgroundColor: colors.successSoft },
  badgeText: { fontSize: 12, fontWeight: '700' },
  badgeTextLocked: { color: colors.gold },
  badgeTextOpen: { color: colors.success },
  chevron: { marginLeft: 'auto', fontSize: 11, color: colors.textFaint },
  authorRow: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', marginBottom: 4 },
  author: { fontSize: 12, color: colors.textFaint },
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
    fontSize: 17,
    color: colors.text,
    lineHeight: 23,
  },
  sealedBox: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  sealedText: { fontSize: 13, color: colors.textFaint, fontStyle: 'italic' },
  audioRow: { marginTop: 10 },
  cardMeta: { fontSize: 12, color: colors.textFaint, marginTop: 10 },
});
