import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  PanResponder,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { fetchCommentCount } from '../lib/comments';
import { formatCountdown } from '../lib/datetime';
import {
  beliefPercentage,
  CATEGORY_LABEL,
  castEmojiReaction,
  EMOJI_REACTIONS,
  isRevealed,
  removeEmojiReaction,
  setPredictionUserState,
  type EmojiReaction,
  type PredictionFeedItem,
} from '../lib/predictions';
import { colors, fonts, radius } from '../lib/theme';
import { Avatar } from './Avatar';
import { InlineComments } from './InlineComments';
import { PredictWord } from './PredictWord';

/** Largeur fixe de la bulle de réactions — nécessaire pour la centrer
 * précisément au-dessus du pouce via `marginLeft: -largeur/2`. */
const EMOJI_PANEL_WIDTH = 260;

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
  mentionedUsernames,
  userId,
  onPress,
  hasVoted = false,
  onDelete,
  onFavoriteChange,
  onHiddenChange,
}: {
  item: PredictionFeedItem;
  now: Date;
  authorLabel?: string;
  authorId?: string;
  authorAvatarUrl?: string | null;
  /** Pseudos des amis cités via « @pseudo » dans le teaser — affichés à côté
   * de l'auteur, sur la même ligne, pour ne pas ajouter de hauteur à
   * l'étiquette. */
  mentionedUsernames?: string[];
  userId: string;
  onPress?: () => void;
  /** Le destinataire s'est déjà prononcé sur cette prédiction — masque le lien
   * « Donner mon avis », qui n'a plus lieu d'être une fois le vote posé. */
  hasVoted?: boolean;
  /** Réservé à l'auteur d'une prédiction révélée — affiche l'icône de
   * suppression, avec confirmation, en bas à droite de la carte. */
  onDelete?: () => void;
  /** Préviennent l'écran parent (Fil) du nouvel état, pour que ses propres
   * listes filtrées (favoris, masquées) restent à jour sans recharger tout
   * le fil à chaque bascule. */
  onFavoriteChange?: (isFavorite: boolean) => void;
  onHiddenChange?: (isHidden: boolean) => void;
}) {
  const router = useRouter();
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [commentCount, setCommentCount] = useState<number | null>(null);
  const [emojiPanelOpen, setEmojiPanelOpen] = useState(false);
  const [isFavorite, setIsFavorite] = useState(item.is_favorite);
  const [isHidden, setIsHidden] = useState(item.is_hidden);
  const [myEmoji, setMyEmoji] = useState<EmojiReaction | null>(item.my_emoji_reaction);
  const [emojiCounts, setEmojiCounts] = useState(item.emoji_counts);
  const revealAt = new Date(item.reveal_at);
  const revealed = isRevealed(item, now);
  const isAuthor = item.author_id === userId;

  const verdict = revealed && item.final_status !== 'pending' ? item.final_status : null;
  const belief = item.is_immediate ? beliefPercentage(item) : null;

  useEffect(() => {
    let cancelled = false;
    fetchCommentCount(item.id).then(({ count }) => {
      if (!cancelled) setCommentCount(count);
    });
    return () => {
      cancelled = true;
    };
  }, [item.id]);

  function handleDeletePress() {
    const message =
      'Cette action est définitive : le contenu, les votes et les commentaires seront perdus pour tout le Cercle.';

    // `Alert.alert` de React Native Web ne fait rien (implémentation vide) —
    // sans ce repli, le bouton semble ne pas répondre du tout sur le web.
    if (Platform.OS === 'web') {
      if (window.confirm(`Supprimer ce Predict ?\n\n${message}`)) {
        onDelete?.();
      }
      return;
    }

    Alert.alert('Supprimer ce Predict ?', message, [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Supprimer', style: 'destructive', onPress: () => onDelete?.() },
    ]);
  }

  async function handleToggleFavorite() {
    const next = !isFavorite;
    setIsFavorite(next);
    onFavoriteChange?.(next);
    const { error } = await setPredictionUserState(item.id, userId, { favorite: next });
    if (error) {
      setIsFavorite(!next);
      onFavoriteChange?.(!next);
    }
  }

  async function handleToggleHidden() {
    const next = !isHidden;
    setIsHidden(next);
    onHiddenChange?.(next);
    const { error } = await setPredictionUserState(item.id, userId, { hidden: next });
    if (error) {
      setIsHidden(!next);
      onHiddenChange?.(!next);
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

  async function handleEmojiPress(emoji: EmojiReaction) {
    setEmojiPanelOpen(false);
    const previous = myEmoji;
    if (previous === emoji) {
      // Retape le même emoji : retire la réaction.
      setMyEmoji(null);
      setEmojiCounts((prev) => adjustCounts(prev, emoji, null));
      const { error } = await removeEmojiReaction(item.id, userId);
      if (error) {
        setMyEmoji(previous);
        setEmojiCounts((prev) => adjustCounts(prev, null, previous));
      }
      return;
    }

    setMyEmoji(emoji);
    setEmojiCounts((prev) => adjustCounts(prev, previous, emoji));
    const { error } = await castEmojiReaction(item.id, userId, emoji);
    if (error) {
      setMyEmoji(previous);
      setEmojiCounts((prev) => adjustCounts(prev, emoji, previous));
    }
  }

  const totalReactions = Object.values(emojiCounts).reduce((sum, count) => sum + (count ?? 0), 0);

  // Panneau de réactions façon Facebook : maintenir le doigt sur le pouce
  // fait apparaître la bulle, la faire glisser dessus grossit l'emoji
  // survolé, et relâcher le doigt sur l'un d'eux le valide. Un tap simple
  // (sans glissement) garde l'ancien comportement : ouvrir/fermer la bulle.
  const panelRef = useRef<View>(null);
  const panelLayoutRef = useRef<{ x: number; y: number; width: number; height: number } | null>(null);
  const hoveredIndexRef = useRef<number | null>(null);
  const panelOpenAtGrantRef = useRef(false);
  const scaleAnims = useRef(EMOJI_REACTIONS.map(() => new Animated.Value(1))).current;

  // Le PanResponder juste en dessous n'est créé qu'une seule fois
  // (`useRef`) : ses callbacks ne doivent donc JAMAIS lire directement
  // `emojiPanelOpen` ou `handleEmojiPress` — ils resteraient figés sur les
  // valeurs du tout premier rendu (la bulle s'ouvre, mais plus rien ne
  // répond ensuite). Ces deux refs, remises à jour à chaque rendu, leur
  // donnent un accès toujours frais.
  const emojiPanelOpenRef = useRef(emojiPanelOpen);
  emojiPanelOpenRef.current = emojiPanelOpen;
  const handleEmojiPressRef = useRef(handleEmojiPress);
  handleEmojiPressRef.current = handleEmojiPress;
  const myEmojiRef = useRef(myEmoji);
  myEmojiRef.current = myEmoji;

  function setHovered(index: number | null) {
    if (hoveredIndexRef.current === index) return;
    const previous = hoveredIndexRef.current;
    hoveredIndexRef.current = index;
    if (previous !== null) {
      Animated.spring(scaleAnims[previous], { toValue: 1, useNativeDriver: false, speed: 20 }).start();
    }
    if (index !== null) {
      Animated.spring(scaleAnims[index], { toValue: 1.7, useNativeDriver: false, speed: 20 }).start();
    }
  }

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        panelOpenAtGrantRef.current = emojiPanelOpenRef.current;
        panelLayoutRef.current = null;
        setEmojiPanelOpen(true);
      },
      onPanResponderMove: (_evt, gesture) => {
        const layout = panelLayoutRef.current;
        if (!layout) return;
        const withinX = gesture.moveX >= layout.x && gesture.moveX <= layout.x + layout.width;
        const withinY = gesture.moveY >= layout.y - 30 && gesture.moveY <= layout.y + layout.height + 30;
        if (!withinX || !withinY) {
          setHovered(null);
          return;
        }
        const relative = gesture.moveX - layout.x;
        const index = Math.min(
          EMOJI_REACTIONS.length - 1,
          Math.max(0, Math.floor((relative / layout.width) * EMOJI_REACTIONS.length))
        );
        setHovered(index);
      },
      onPanResponderRelease: (_evt, gesture) => {
        const moved = Math.abs(gesture.dx) > 4 || Math.abs(gesture.dy) > 4;
        const hovered = hoveredIndexRef.current;
        setHovered(null);
        if (!moved) {
          if (myEmojiRef.current) {
            // Une réaction est déjà posée : un tap simple sur le pouce
            // l'annule directement, comme un « unlike » — pas besoin de
            // rouvrir la bulle pour ça.
            handleEmojiPressRef.current(myEmojiRef.current);
            setEmojiPanelOpen(false);
          } else {
            // Pas de réaction encore : le tap simple ouvre/ferme la bulle.
            setEmojiPanelOpen(!panelOpenAtGrantRef.current);
          }
        } else if (hovered !== null) {
          handleEmojiPressRef.current(EMOJI_REACTIONS[hovered]);
          setEmojiPanelOpen(false);
        } else {
          // Glissé hors de la bulle : on annule, comme sur Facebook.
          setEmojiPanelOpen(false);
        }
      },
      onPanResponderTerminate: () => {
        setHovered(null);
        setEmojiPanelOpen(false);
      },
    })
  ).current;

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
              {mentionedUsernames && mentionedUsernames.length > 0 && (
                <Text style={styles.mentionTag} numberOfLines={1}>
                  · a cité {mentionedUsernames.map((u) => `@${u}`).join(', ')}
                </Text>
              )}
            </Pressable>
          )}

          <View style={styles.cardTopRight}>
            {!verdict && !revealed && (
              <View style={[styles.badge, styles.badgeLocked]}>
                <Text style={[styles.badgeText, styles.badgeTextLocked]}>
                  {item.open_ended ? 'Quand l’auteur le décide' : formatCountdown(revealAt, now)}
                </Text>
              </View>
            )}
            <Text style={styles.categoryTag}>Thème : {CATEGORY_LABEL[item.category]}</Text>
          </View>
        </View>

        <Text style={styles.cardTeaser}>{item.teaser}</Text>

        {item.is_immediate && (
          <Text style={styles.beliefScore}>
            {belief === null
              ? 'Personne n’a encore donné son avis.'
              : `${belief}% y croient · ${100 - belief}% n’y croient pas`}
          </Text>
        )}
      </Pressable>

      {revealed && !isAuthor && !hasVoted && (
        <Pressable onPress={() => onPress?.()} style={styles.voteLink} hitSlop={4}>
          <Text style={styles.voteLinkText}>Donner mon avis sur ce <PredictWord /> →</Text>
        </Pressable>
      )}

      <View style={styles.footerRow}>
        <Pressable onPress={() => setCommentsOpen((o) => !o)} style={styles.commentsToggle} hitSlop={4}>
          <Ionicons
            name={commentsOpen ? 'chatbubble' : 'chatbubble-outline'}
            size={17}
            color={colors.textMuted}
          />
          <Text style={styles.commentsToggleText}>{commentCount ?? 0}</Text>
        </Pressable>

        {/* Discret, façon Facebook : un pouce en filigrane (ou l'emoji déjà
            choisi) — maintenir le doigt fait apparaître la bulle de
            réactions au-dessus, la faire glisser dessus en sélectionne une. */}
        <View style={styles.reactionTriggerWrap}>
          <View style={styles.reactionTrigger} hitSlop={8} {...panResponder.panHandlers}>
            {myEmoji ? (
              <Text style={styles.reactionTriggerEmoji}>{myEmoji}</Text>
            ) : (
              <Ionicons name="thumbs-up-outline" size={17} color={colors.textFaint} />
            )}
            {totalReactions > 0 && <Text style={styles.reactionTriggerCount}>{totalReactions}</Text>}
          </View>

          {emojiPanelOpen && (
            <View
              ref={panelRef}
              style={styles.emojiPanel}
              onLayout={() => {
                panelRef.current?.measureInWindow((x, y, width, height) => {
                  panelLayoutRef.current = { x, y, width, height };
                });
              }}
            >
              {EMOJI_REACTIONS.map((emoji, i) => (
                <Animated.View key={emoji} style={{ transform: [{ scale: scaleAnims[i] }] }}>
                  {/* Un tap direct sur un emoji le sélectionne toujours,
                      indépendamment du glissé : sans ça, un utilisateur qui
                      relâche le pouce puis tape un emoji comme un bouton
                      normal (au lieu de glisser sans relâcher, à la
                      Facebook) ne déclenchait jamais rien. */}
                  <Pressable
                    onPress={() => handleEmojiPress(emoji)}
                    style={[styles.emojiBubbleItem, myEmoji === emoji && styles.emojiBubbleItemActive]}
                    hitSlop={4}
                  >
                    <Text style={styles.emojiButtonText}>{emoji}</Text>
                  </Pressable>
                </Animated.View>
              ))}
            </View>
          )}
        </View>

        <Pressable onPress={handleToggleFavorite} hitSlop={8}>
          <Ionicons
            name={isFavorite ? 'star' : 'star-outline'}
            size={18}
            color={isFavorite ? colors.gold : colors.textMuted}
          />
        </Pressable>

        <Pressable onPress={handleToggleHidden} hitSlop={8}>
          <Ionicons
            name={isHidden ? 'eye-off' : 'eye-off-outline'}
            size={18}
            color={isHidden ? colors.gold : colors.textMuted}
          />
        </Pressable>

        {revealed && isAuthor && onDelete && (
          <Pressable onPress={handleDeletePress} hitSlop={4}>
            <Ionicons name="trash-outline" size={17} color={colors.danger} />
          </Pressable>
        )}
      </View>

      {commentsOpen && (
        <InlineComments
          predictionId={item.id}
          userId={userId}
          truncate
          revealed={revealed}
          isPredictionAuthor={isAuthor}
        />
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
    marginBottom: 12,
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
  mentionTag: { fontSize: 12, fontWeight: '600', color: colors.gold, flexShrink: 1 },
  // Sur la droite de la carte (dans `cardTop`), pas sur sa propre ligne sous
  // le teaser — ça évite d'ajouter une ligne de hauteur à chaque carte.
  cardTopRight: { alignItems: 'flex-end', gap: 2 },
  categoryTag: {
    fontSize: 12,
    fontStyle: 'italic',
    fontWeight: '400',
    color: colors.textFaint,
    textAlign: 'right',
  },
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
  beliefScore: { fontSize: 13, fontWeight: '700', color: colors.gold, marginTop: 8 },
  voteLink: { marginTop: 10 },
  voteLinkText: { fontSize: 13, fontWeight: '600', color: colors.gold },
  // Une seule « grande bulle », façon Facebook — flottante au-dessus du
  // pouce (pas en dessous) pour ne pas être masquée par le doigt qui la
  // fait glisser, et pas des puces séparées.
  emojiPanel: {
    position: 'absolute',
    bottom: '100%',
    left: '50%',
    marginLeft: -EMOJI_PANEL_WIDTH / 2,
    marginBottom: 10,
    width: EMOJI_PANEL_WIDTH,
    zIndex: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 10,
    paddingVertical: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 8,
  },
  emojiBubbleItem: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emojiBubbleItemActive: { backgroundColor: colors.goldSoft },
  emojiButtonText: { fontSize: 20 },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 10,
  },
  commentsToggle: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  commentsToggleText: { fontSize: 13, fontWeight: '600', color: colors.textMuted },
  reactionTriggerWrap: { position: 'relative' },
  reactionTrigger: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  reactionTriggerEmoji: { fontSize: 17 },
  reactionTriggerCount: { fontSize: 11, fontWeight: '600', color: colors.textFaint },
});
