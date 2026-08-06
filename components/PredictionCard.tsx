import { useRouter } from 'expo-router';
import { MessageCircle, MoreHorizontal, ThumbsUp, Trash2 } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import { Text } from './Text';

import { ConfidenceGauge } from './ConfidenceGauge';
import { ConfidenceVotesModal } from './ConfidenceVotesModal';
import { fetchCommentCount } from '../lib/comments';
import { formatCountdown } from '../lib/datetime';
import {
  castEmojiReaction,
  EMOJI_REACTIONS,
  fetchEmojiReactors,
  isRevealed,
  removeEmojiReaction,
  setPredictionUserState,
  type EmojiReaction,
  type EmojiReactor,
  type PredictionFeedItem,
} from '../lib/predictions';
import { colors, fonts, radius } from '../lib/theme';
import { Avatar } from './Avatar';
import { InlineComments } from './InlineComments';
import { PredictWord } from './PredictWord';

/** Largeur fixe de la bulle de réactions, ancrée par son bord droit sur le pouce. */
const EMOJI_PANEL_WIDTH = 260;

/**
 * Carte d'une prédiction, partagée entre les onglets À venir et Passées du
 * Fil. Toujours dépliée (teaser, puis contenu une fois révélé) ; un tap sur
 * la carte navigue vers l'écran détail (`onPress`), où l'auteur gère les
 * destinataires. Les commentaires, eux, restent repliés derrière une icône
 * dédiée — pas besoin de quitter le Fil pour les consulter.
 */
export function PredictionCard({
  item,
  now,
  authorLabel,
  authorId,
  authorAvatarUrl,
  mentionLabel,
  userId,
  onPress,
  unseen = false,
  onDelete,
  onFavoriteChange,
  onHiddenChange,
}: {
  item: PredictionFeedItem;
  now: Date;
  authorLabel?: string;
  authorId?: string;
  authorAvatarUrl?: string | null;
  /** Étiquette déjà résolue (« X cité, ainsi que d'autres personnes ») pour
   * les amis cités via « @pseudo » dans le teaser — voir `buildMentionLabel`.
   * Sur sa propre ligne, jamais accolée au pseudo de l'auteur : la liste
   * complète des pseudos y empiétait. */
  mentionLabel?: string | null;
  userId: string;
  onPress?: () => void;
  /** Pas encore ouverte par ce destinataire — surlignage discret + compte
   * dans le badge de l'onglet correspondant. */
  unseen?: boolean;
  /** Réservé à un destinataire (jamais l'auteur, qui ne peut plus supprimer
   * sa propre prédiction) — retire son propre accès, en bas à droite de la
   * carte. */
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
  const [menuOpen, setMenuOpen] = useState(false);
  const [isFavorite, setIsFavorite] = useState(item.is_favorite);
  const [isHidden, setIsHidden] = useState(item.is_hidden);
  const [myEmoji, setMyEmoji] = useState<EmojiReaction | null>(item.my_emoji_reaction);
  const [emojiCounts, setEmojiCounts] = useState(item.emoji_counts);
  const [reactorsOpen, setReactorsOpen] = useState(false);
  const [reactors, setReactors] = useState<EmojiReactor[] | null>(null);
  const [reactorsLoading, setReactorsLoading] = useState(false);
  const [reactorsError, setReactorsError] = useState<string | null>(null);
  const [confidenceOpen, setConfidenceOpen] = useState(false);
  const [avgConfidence, setAvgConfidence] = useState(item.avg_confidence);
  const [confidenceVoteCount, setConfidenceVoteCount] = useState(item.confidence_vote_count);
  const [myConfidence, setMyConfidence] = useState(item.my_confidence);
  const revealAt = new Date(item.reveal_at);
  const revealed = isRevealed(item, now);
  const isAuthor = item.author_id === userId;

  const verdict = revealed && item.final_status !== 'pending' ? item.final_status : null;
  const canVote = revealed && !isAuthor;

  useEffect(() => {
    let cancelled = false;
    fetchCommentCount(item.id).then(({ count }) => {
      if (!cancelled) setCommentCount(count);
    });
    return () => {
      cancelled = true;
    };
  }, [item.id]);

  function handleVoted(confidence: number) {
    const hadVote = myConfidence !== null;
    setMyConfidence(confidence);
    setConfidenceVoteCount((prev) => (hadVote ? prev : prev + 1));
    setAvgConfidence((prev) => {
      const count = hadVote ? confidenceVoteCount : confidenceVoteCount + 1;
      const previousTotal = (prev ?? 0) * confidenceVoteCount - (hadVote ? (myConfidence ?? 0) : 0);
      return Math.round(((previousTotal + confidence) / count) * 10) / 10;
    });
  }

  function handleDeletePress() {
    const message =
      'Tu perdras l’accès à ce Predict : il disparaîtra de ton fil, sauf si l’auteur t’y réinvite.';

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

  /** Charge le détail « qui a réagi avec quoi », une seule fois par carte. */
  async function openReactors() {
    setReactorsOpen(true);
    if (reactors !== null) return;
    setReactorsLoading(true);
    const { data, error } = await fetchEmojiReactors(item.id);
    // Ne jamais confondre un échec de chargement avec « personne n'a réagi » :
    // ce panneau ne s'ouvre que si le compteur est > 0, donc une liste vide
    // serait forcément un mensonge. `reactors` reste `null` pour permettre un
    // nouvel essai à la prochaine ouverture.
    if (error) {
      setReactorsError('Chargement impossible.');
    } else {
      setReactorsError(null);
      setReactors(data ?? []);
    }
    setReactorsLoading(false);
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
    <View style={[styles.card, unseen && styles.cardUnseen]}>
      <Pressable onPress={() => onPress?.()} style={({ pressed }) => pressed && styles.cardPressed}>
        {/* Contestation en cours sur cette prédiction — bien plus visible que
            le reste de la carte : c'est justement le but, ça concerne tout
            le monde. */}
        {item.resolution_status === 'mauvaise_foi' && (
          <View style={styles.badFaithBanner}>
            <Text style={styles.badFaithBannerText}>🚩 MAUVAISE FOI — le Cercle tranche</Text>
          </View>
        )}

        {/* Une seule ligne : [avatar][pseudo] ...espace flexible... [badge] [menu]. */}
        <View style={styles.cardHeader}>
          {authorLabel && (
            <Pressable
              onPress={() => authorId && router.push(`/profile/${authorId}`)}
              style={styles.authorBlock}
              hitSlop={4}
            >
              <Avatar url={authorAvatarUrl} username={authorLabel} size={32} />
              <Text style={styles.authorName} numberOfLines={1}>
                {authorLabel}
              </Text>
            </Pressable>
          )}

          <View style={styles.headerSpacer} />

          {!verdict && !revealed && (
            <Text style={styles.badgeText} numberOfLines={1}>
              {item.open_ended ? 'En temps voulu' : formatCountdown(revealAt, now)}
            </Text>
          )}
          {/* Révélée mais sans majorité encore formée (aucun vote, ou égalité)
              — sans ça, l'en-tête restait vide sur l'onglet Predict alors que
              la prédiction est bien révélée. */}
          {!verdict && revealed && (
            <Text style={styles.badgeText} numberOfLines={1}>
              Révélée
            </Text>
          )}
          {verdict && (
            // Liseré très discret sur le bord gauche plutôt qu'une pastille
            // pleine — juste de quoi confirmer le sens du mot d'un coup d'œil.
            <View
              style={[
                styles.badge,
                verdict === 'realized' ? styles.badgeRealized : styles.badgeMissed,
              ]}
            >
              <Text style={styles.badgeText}>{verdict === 'realized' ? 'Réalisé' : 'Manqué'}</Text>
            </View>
          )}

          <Pressable onPress={() => setMenuOpen(true)} style={styles.menuButton} hitSlop={8}>
            <MoreHorizontal size={18} color={colors.icon} strokeWidth={1.75} />
          </Pressable>
        </View>

        {/* Sur sa propre ligne, jamais accolée au pseudo — la liste complète
            des personnes citées y empiétait dès qu'il y en avait plusieurs. */}
        {mentionLabel && <Text style={styles.mentionTag} numberOfLines={1}>{mentionLabel}</Text>}

        <Text style={styles.cardTeaser}>{item.teaser}</Text>

        {/* Le contenu (la vraie prédiction, derrière la promesse du teaser)
            devient visible directement sur la carte une fois révélée — sans
            ça, l'onglet Predict n'avait rien de plus à montrer qu'un teaser
            déjà lu avant révélation. La RLS ne renvoie `content` que si
            révélée ou si on en est l'auteur, donc ce test suffit. */}
        {(revealed || isAuthor) && item.content && (
          <Text style={styles.cardContent}>{item.content}</Text>
        )}

        {/* Jauge de confiance universelle : moyenne de la communauté, quel
            que soit le type de prédiction — remplace l'ancien affichage
            réservé aux immédiates. Le tap ouvre le détail des votes (et,
            pour un destinataire éligible, le slider pour poser le sien). */}
        <Pressable
          onPress={(e) => {
            e.stopPropagation?.();
            setConfidenceOpen(true);
          }}
          style={styles.confidenceBlock}
        >
          {avgConfidence === null ? (
            <Text style={styles.beliefScore}>
              {canVote ? 'Sois le premier à voter →' : 'Personne n’a encore voté.'}
            </Text>
          ) : (
            <>
              {/* Le chiffre flotte au-dessus du curseur plutôt que sur sa
                  propre ligne pleine largeur — rien d'écrit sur la jauge
                  elle-même, juste ce repère ponctuel. */}
              <View
                style={[
                  styles.confidenceLabelRow,
                  {
                    justifyContent: avgConfidence < 35 ? 'flex-start' : avgConfidence > 65 ? 'flex-end' : 'center',
                  },
                ]}
              >
                <Text style={styles.confidenceLabel}>
                  {avgConfidence}% de confiance · {confidenceVoteCount} vote
                  {confidenceVoteCount > 1 ? 's' : ''}
                </Text>
              </View>
              <ConfidenceGauge belief={avgConfidence} />
            </>
          )}
        </Pressable>
      </Pressable>

      {canVote && myConfidence === null && (
        <Pressable onPress={() => setConfidenceOpen(true)} style={styles.voteLink} hitSlop={4}>
          <Text style={styles.voteLinkText}>Voter sur ce <PredictWord /> →</Text>
        </Pressable>
      )}

      <View style={styles.footerRow}>
        {/* Sobre quand il n'y a rien à voir ; icône plus marquée et chiffre
            en gras noir dès qu'il y a au moins un commentaire. */}
        <View style={styles.footerSide}>
          <Pressable onPress={() => setCommentsOpen((o) => !o)} style={styles.commentsToggle} hitSlop={4}>
            <MessageCircle
              size={17}
              color={(commentCount ?? 0) > 0 ? colors.icon : colors.textFaint}
              strokeWidth={1.75}
              fill={commentsOpen ? colors.icon : 'none'}
            />
            {(commentCount ?? 0) > 0 && (
              <Text style={styles.commentsToggleText}>{commentCount}</Text>
            )}
          </Pressable>
        </View>

        {/* Discret, façon Facebook : un pouce en filigrane (ou l'emoji déjà
            choisi), désormais au centre du pied de carte — la poubelle prend
            sa place habituelle à droite. Maintenir le doigt fait apparaître
            la bulle de réactions au-dessus, la faire glisser dessus en
            sélectionne une. Le chiffre est un bouton à part : un tap dessus
            ouvre le détail de qui a réagi avec quoi. */}
        <View style={styles.footerCenter}>
          <View style={styles.reactionTriggerWrap}>
            <View style={styles.reactionTriggerRow}>
              <View style={styles.reactionTrigger} hitSlop={8} {...panResponder.panHandlers}>
                {myEmoji ? (
                  <Text style={styles.reactionTriggerEmoji}>{myEmoji}</Text>
                ) : (
                  <ThumbsUp size={17} color={totalReactions > 0 ? colors.icon : colors.textFaint} strokeWidth={1.75} />
                )}
              </View>
              {totalReactions > 0 && (
                <Pressable onPress={openReactors} hitSlop={8}>
                  <Text style={styles.reactionTriggerCount}>{totalReactions}</Text>
                </Pressable>
              )}
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
        </View>

        <View style={[styles.footerSide, styles.footerSideRight]}>
          {/* Jamais pour l'auteur : il ne peut plus supprimer sa propre
              prédiction (pour ne pas pouvoir effacer un Manqué ou une
              Mauvaise foi confirmée). Un destinataire peut en revanche
              toujours se retirer lui-même. */}
          {!isAuthor && onDelete && (
            <Pressable onPress={handleDeletePress} hitSlop={8}>
              <Trash2 size={17} color={colors.textFaint} strokeWidth={1.75} />
            </Pressable>
          )}
        </View>
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

      <Modal visible={menuOpen} transparent animationType="fade" onRequestClose={() => setMenuOpen(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setMenuOpen(false)}>
          <Pressable style={styles.menuBox} onPress={() => {}}>
            <Pressable
              onPress={() => {
                setMenuOpen(false);
                handleToggleFavorite();
              }}
              style={styles.menuRow}
            >
              <Text style={styles.menuRowText}>
                {isFavorite ? 'Retirer des favoris' : 'Ajouter aux favoris'}
              </Text>
            </Pressable>

            <Pressable
              onPress={() => {
                setMenuOpen(false);
                handleToggleHidden();
              }}
              style={styles.menuRowLast}
            >
              <Text style={styles.menuRowText}>{isHidden ? 'Afficher à nouveau' : 'Masquer'}</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        visible={reactorsOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setReactorsOpen(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setReactorsOpen(false)}>
          <Pressable style={styles.reactorsBox} onPress={() => {}}>
            <Text style={styles.reactorsTitle}>Réactions</Text>
            {reactorsLoading ? (
              <ActivityIndicator color={colors.text} style={styles.reactorsLoader} />
            ) : reactorsError ? (
              <Text style={styles.reactorsEmpty}>{reactorsError}</Text>
            ) : reactors && reactors.length > 0 ? (
              reactors.map((r) => (
                <View key={r.user_id} style={styles.reactorRow}>
                  <Avatar url={r.avatar_url} username={r.username} size={26} />
                  <Text style={styles.reactorName} numberOfLines={1}>
                    {r.username}
                  </Text>
                  <Text style={styles.reactorEmoji}>{r.emoji}</Text>
                </View>
              ))
            ) : (
              <Text style={styles.reactorsEmpty}>Personne n’a encore réagi.</Text>
            )}
          </Pressable>
        </Pressable>
      </Modal>

      <ConfidenceVotesModal
        visible={confidenceOpen}
        predictionId={item.id}
        userId={userId}
        canVote={canVote}
        myConfidence={myConfidence}
        onVoted={handleVoted}
        onClose={() => setConfidenceOpen(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  cardPressed: { opacity: 0.85 },
  // Fine bordure noire, fond blanc pur, pas d'ombre lourde — carte sobre
  // façon presse plutôt que carte « flottante ».
  card: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.xl,
    padding: 18,
    marginBottom: 12,
    backgroundColor: colors.surface,
  },
  badFaithBanner: {
    marginHorizontal: -18,
    marginTop: -18,
    marginBottom: 12,
    paddingVertical: 8,
    paddingHorizontal: 18,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    backgroundColor: colors.dangerSoft,
  },
  badFaithBannerText: { fontSize: 12, fontWeight: '700', color: colors.danger },
  // Non lue : fine bordure lumineuse + fond très légèrement teinté, assez
  // discret pour ne pas jurer avec le reste de la charte noir/blanc/jaune.
  cardUnseen: {
    borderColor: colors.gold,
    backgroundColor: colors.goldSoft,
  },
  // Tout sur une seule ligne :
  // [avatar 32][pseudo] ...espace flexible... [badge temps] [menu '...'].
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  headerSpacer: { flex: 1, minWidth: 8 },
  // `flexShrink` sur le bloc auteur ET sur le pseudo : c'est le pseudo qui se
  // tronque avec ellipse si la place manque, jamais le badge ni le menu.
  authorBlock: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1, minWidth: 0 },
  authorName: { fontSize: 14, fontWeight: '600', color: colors.text, flexShrink: 1, minWidth: 0 },
  // Sur sa propre ligne, sous l'en-tête — jamais accolée au pseudo.
  mentionTag: { fontSize: 12, fontWeight: '500', color: colors.textMuted, marginTop: -4, marginBottom: 10 },
  menuButton: { padding: 2 },
  // Texte simple pour le délai (rien à signaler encore) ; pour le verdict,
  // un fin liseré sur le bord gauche plutôt qu'une pastille pleine — le
  // jaune plein ne convenait pas ici, réservé aux éléments interactifs
  // majeurs. `flexShrink: 0` : jamais compressé par un long pseudo.
  badge: { flexShrink: 0, paddingLeft: 7 },
  badgeRealized: { borderLeftWidth: 2, borderLeftColor: colors.verdictRealized },
  badgeMissed: { borderLeftWidth: 2, borderLeftColor: colors.verdictMissed },
  badgeText: { fontSize: 12, fontWeight: '600', color: colors.textMuted, flexShrink: 0 },
  cardTeaser: {
    fontFamily: fonts.sansBold,
    fontSize: 16,
    color: colors.text,
    lineHeight: 22,
  },
  // Poids plus léger que le teaser : le teaser reste le titre de la carte,
  // le contenu qui suit en est le corps.
  cardContent: {
    fontSize: 14,
    color: colors.textMuted,
    lineHeight: 20,
    marginTop: 6,
  },
  beliefScore: { fontSize: 13, color: colors.textMuted, marginTop: 10 },
  // Jauge de confiance : rien d'écrit sur la barre elle-même — juste un
  // curseur à la position de la moyenne, et le chiffre qui flotte au-dessus.
  confidenceBlock: { marginTop: 12 },
  confidenceLabelRow: { flexDirection: 'row', marginBottom: 4 },
  confidenceLabel: { fontSize: 12, fontWeight: '700', color: colors.text },
  voteLink: { marginTop: 10 },
  voteLinkText: { fontSize: 13, fontWeight: '600', color: colors.text, textDecorationLine: 'underline' },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  menuBox: {
    width: '100%',
    maxWidth: 320,
    borderRadius: 16,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  menuRow: {
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  menuRowLast: { paddingHorizontal: 18, paddingVertical: 14 },
  menuRowText: { fontSize: 14, fontWeight: '600', color: colors.text },
  // Une seule « grande bulle », façon Facebook — flottante au-dessus du
  // pouce (pas en dessous) pour ne pas être masquée par le doigt qui la
  // fait glisser, et pas des puces séparées. Centrée sur le déclencheur
  // (désormais au milieu du pied de carte), plutôt qu'ancrée à droite.
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
  // Trois zones égales (gauche/centre/droite) : les commentaires restent à
  // gauche, le pouce de réaction passe au centre, la poubelle (destinataire
  // seulement) prend la place qu'occupait le pouce, à droite.
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
  },
  footerSide: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  footerSideRight: { justifyContent: 'flex-end' },
  footerCenter: { flex: 1, alignItems: 'center' },
  commentsToggle: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  // Affiché seulement s'il y a au moins un commentaire — donc toujours en
  // gras noir : c'est une interaction réelle, pas un zéro décoratif.
  commentsToggleText: { fontSize: 13, fontWeight: '700', color: colors.text },
  reactionTriggerWrap: { position: 'relative' },
  reactionTriggerRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  reactionTrigger: { flexDirection: 'row', alignItems: 'center' },
  reactionTriggerEmoji: { fontSize: 17 },
  reactionTriggerCount: { fontSize: 13, fontWeight: '700', color: colors.text },
  // Détail « qui a réagi avec quoi » — une ligne par personne, ouverte en
  // tapant le compteur de réactions.
  reactorsBox: {
    width: '100%',
    maxWidth: 320,
    borderRadius: 16,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 14,
    paddingHorizontal: 18,
  },
  reactorsTitle: { fontSize: 15, fontWeight: '700', color: colors.text, marginBottom: 10 },
  reactorsLoader: { marginVertical: 12 },
  reactorsEmpty: { fontSize: 13, color: colors.textFaint },
  reactorRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 7 },
  reactorName: { flex: 1, fontSize: 14, fontWeight: '600', color: colors.text },
  reactorEmoji: { fontSize: 18 },
});
