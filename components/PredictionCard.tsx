import { Pressable, StyleSheet, Text, View } from 'react-native';

import { formatCountdown, formatRevealAt } from '../lib/datetime';
import { isRevealed, type PredictionFeedItem } from '../lib/predictions';
import { colors, fonts, radius } from '../lib/theme';
import { SealBadge } from './SealBadge';

/**
 * Carte d'une prédiction, partagée entre le Fil et les Archives. `onPress` est
 * toujours fourni par l'appelant (navigue vers le détail) — auteur et
 * destinataires y ont accès, pour voter/commenter une fois révélée ou, pour
 * l'auteur, gérer les destinataires.
 */
export function PredictionCard({
  item,
  now,
  authorLabel,
  onPress,
}: {
  item: PredictionFeedItem;
  now: Date;
  authorLabel?: string;
  onPress: () => void;
}) {
  const revealAt = new Date(item.reveal_at);
  const revealed = isRevealed(item, now);

  return (
    <Pressable onPress={onPress} style={({ pressed }) => pressed && styles.cardPressed}>
      <View style={styles.card}>
        <View style={styles.cardTop}>
          {!revealed && <SealBadge />}
          <View style={[styles.badge, revealed ? styles.badgeOpen : styles.badgeLocked]}>
            <Text style={[styles.badgeText, revealed ? styles.badgeTextOpen : styles.badgeTextLocked]}>
              {revealed ? 'Révélée' : formatCountdown(revealAt, now)}
            </Text>
          </View>
        </View>

        {authorLabel && <Text style={styles.author}>{authorLabel}</Text>}
        <Text style={styles.cardTeaser}>{item.teaser}</Text>

        {revealed && item.content ? (
          <View style={styles.contentBox}>
            <Text style={styles.contentLabel}>Contenu</Text>
            <Text style={styles.cardContent}>{item.content}</Text>
          </View>
        ) : (
          <View style={styles.sealedBox}>
            <Text style={styles.sealedText}>Contenu scellé jusqu’à la révélation</Text>
          </View>
        )}

        <Text style={styles.cardMeta}>
          {revealed ? 'Révélée' : 'Se révèle'} {formatRevealAt(revealAt)}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  cardPressed: { opacity: 0.85 },
  card: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.xl,
    padding: 16,
    marginBottom: 12,
    backgroundColor: colors.surface,
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
  author: { fontSize: 12, color: colors.textFaint, marginBottom: 4 },
  cardTeaser: {
    fontFamily: fonts.serif,
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
    fontFamily: fonts.serif,
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
  cardMeta: { fontSize: 12, color: colors.textFaint, marginTop: 10 },
});
