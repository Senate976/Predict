import { ThumbsUp } from 'lucide-react-native';
import { useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';

import {
  castEmojiReaction,
  EMOJI_REACTIONS,
  removeEmojiReaction,
  type EmojiReaction,
} from '../lib/predictions';
import { fonts, radius, spacing, type Colors } from '../lib/theme';
import { useColors } from '../lib/themeMode';
import { Text } from './Text';

/**
 * Réagir depuis l'écran détail d'une prédiction.
 *
 * Volontairement plus simple que la version du Fil : là-bas, maintenir le
 * pouce fait glisser vers l'emoji voulu (façon Facebook), ce qui suppose tout
 * un jeu de mesures et un `PanResponder`. Ici on ouvre une grille et on
 * touche — un écran de détail se parcourt au calme, l'économie de gestes n'y
 * a pas d'intérêt, et cette version n'a aucune des fragilités de l'autre.
 *
 * Sans ce composant, une notification de révélation menait à un écran où l'on
 * ne pouvait pas réagir : il fallait retrouver la carte dans le Fil.
 */
export function ReactionPicker({
  predictionId,
  userId,
  initialCounts,
  initialMine,
}: {
  predictionId: string;
  userId: string;
  initialCounts: Partial<Record<EmojiReaction, number>>;
  initialMine: EmojiReaction | null;
}) {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [open, setOpen] = useState(false);
  const [mine, setMine] = useState<EmojiReaction | null>(initialMine);
  const [counts, setCounts] = useState<Partial<Record<EmojiReaction, number>>>(initialCounts);

  // La prédiction peut être rechargée par l'écran parent (après un verdict,
  // par exemple) : on se recale alors sur les valeurs fraîches.
  useEffect(() => {
    setMine(initialMine);
    setCounts(initialCounts);
    // `initialCounts` est un objet recréé à chaque rendu du parent ; on ne suit
    // que sa version sérialisée pour ne pas boucler.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialMine, JSON.stringify(initialCounts)]);

  const total = Object.values(counts).reduce((sum, n) => sum + (n ?? 0), 0);

  /** Applique le changement à l'écran d'abord, à la base ensuite : réagir doit
   * répondre au doigt, pas à la latence. En cas d'échec, on revient en arrière. */
  async function choose(emoji: EmojiReaction) {
    const previous = mine;
    const next = previous === emoji ? null : emoji;
    setOpen(false);
    setMine(next);
    setCounts((c) => {
      const copy = { ...c };
      if (previous) copy[previous] = Math.max(0, (copy[previous] ?? 0) - 1);
      if (next) copy[next] = (copy[next] ?? 0) + 1;
      return copy;
    });

    const { error } = next
      ? await castEmojiReaction(predictionId, userId, next)
      : await removeEmojiReaction(predictionId, userId);

    if (error) {
      setMine(previous);
      setCounts(initialCounts);
    }
  }

  return (
    <View>
      <Pressable onPress={() => setOpen(true)} style={styles.trigger} hitSlop={6}>
        {mine ? (
          <Text style={styles.triggerEmoji}>{mine}</Text>
        ) : (
          <ThumbsUp size={21} color={total > 0 ? colors.text : colors.textFaint} strokeWidth={1.75} />
        )}
        {/* Le picto et son compte, sans le mot « Réagir » : un pouce n'a
            pas besoin qu'on explique ce qu'il fait, et la carte du Fil ne
            l'explique pas non plus. */}
        <Text style={[styles.triggerCount, total === 0 && styles.triggerCountEmpty]}>{total}</Text>
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          {/* `onPress` vide : un appui dans la grille ne referme pas la
              fenêtre par le fond. */}
          <Pressable style={styles.grid} onPress={() => {}}>
            {EMOJI_REACTIONS.map((emoji) => (
              <Pressable
                key={emoji}
                onPress={() => choose(emoji)}
                style={[styles.cell, mine === emoji && styles.cellActive]}
              >
                <Text style={styles.cellEmoji}>{emoji}</Text>
              </Pressable>
            ))}
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

function createStyles(colors: Colors) {
  return StyleSheet.create({
    trigger: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    triggerEmoji: { fontSize: 21, lineHeight: 26 },
    triggerCount: { fontFamily: fonts.label, fontSize: 15, fontWeight: '700', color: colors.text },
    triggerCountEmpty: { color: colors.textFaint },
    backdrop: {
      flex: 1,
      backgroundColor: 'rgba(28, 39, 55, 0.55)',
      justifyContent: 'center',
      padding: spacing.lg,
    },
    grid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'center',
      gap: 8,
      alignSelf: 'center',
      maxWidth: 320,
      backgroundColor: colors.surfaceRaised,
      borderRadius: radius.xl,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 16,
    },
    cell: {
      width: 46,
      height: 46,
      borderRadius: 23,
      alignItems: 'center',
      justifyContent: 'center',
    },
    cellActive: { backgroundColor: colors.accentSoft },
    cellEmoji: { fontSize: 26, lineHeight: 32, textAlign: 'center' },
  });
}
