import { BlurView } from 'expo-blur';
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
import { fetchCommentCount } from '../lib/comments';
import {
  beliefPercentage,
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
import { castVote, voteErrorMessage } from '../lib/votes';
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
  mentionLabel,
  userId,
  onPress,
  hasVoted = false,
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
  /** Le destinataire s'est déjà prononcé sur cette prédiction — masque le lien
   * « Donner mon avis », qui n'a plus lieu d'être une fois le vote posé. */
  hasVoted?: boolean;
  /** Pas encore ouverte par ce destinataire — surlignage discret + compte
   * dans le badge de l'onglet correspondant. */
  unseen?: boolean;
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
  const [menuOpen, setMenuOpen] = useState(false);
  const [isFavorite, setIsFavorite] = useState(item.is_favorite);
  const [isHidden, setIsHidden] = useState(item.is_hidden);
  const [myEmoji, setMyEmoji] = useState<EmojiReaction | null>(item.my_emoji_reaction);
  const [emojiCounts, setEmojiCounts] = useState(item.emoji_counts);
  const [reactorsOpen, setReactorsOpen] = useState(false);
  const [reactors, setReactors] = useState<EmojiReactor[] | null>(null);
  const [reactorsLoading, setReactorsLoading] = useState(false);
  const [reactorsError, setReactorsError] = useState<string | null>(null);
  const [believeVotes, setBelieveVotes] = useState(item.believe_votes);
  const [disbelieveVotes, setDisbelieveVotes] = useState(item.disbelieve_votes);
  const [localVote, setLocalVote] = useState<'believe' | 'disbelieve' | null>(null);
  const [voting, setVoting] = useState(false);
  const [voteError, setVoteError] = useState<string | null>(null);
  const revealed = isRevealed(item, now);
  const isAuthor = item.author_id === userId;

  const verdict = revealed && item.final_status !== 'pending' ? item.final_status : null;
  const belief = item.is_immediate
    ? beliefPercentage({ ...item, believe_votes: believeVotes, disbelieve_votes: disbelieveVotes })
    : null;
  const voted = hasVoted || localVote !== null;

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

  /** Vote rapide « 🔥 confiant / ❌ pas confiant », posé sans quitter le Fil. */
  async function handleQuickVote(value: 'believe' | 'disbelieve') {
    if (voting) return;
    setVoting(true);
    setVoteError(null);
    const { error } = await castVote(item.id, userId, value);
    setVoting(false);
    if (error) {
      setVoteError(voteErrorMessage(error));
      return;
    }
    setLocalVote(value);
    if (value === 'believe') setBelieveVotes((v) => v + 1);
    else setDisbelieveVotes((v) => v + 1);
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
            révélée ou si on en est l'auteur, donc ce test suffit.
            Avant révélation, seul l'auteur voit son propre texte (les autres
            n'ont tout simplement rien à cet endroit) : flouté tant que
            « scellé », net dès que « révélée » — le flou matérialise le
            secret plutôt qu'un simple retrait du contenu. */}
        {(revealed || isAuthor) && item.content && (
          revealed || item.is_immediate ? (
            <Text style={styles.cardContent}>{item.content}</Text>
          ) : (
            <View style={styles.blurWrap}>
              <Text style={styles.cardContent}>{item.content}</Text>
              <BlurView intensity={35} tint="light" style={StyleSheet.absoluteFill} />
            </View>
          )
        )}

        {item.is_immediate && (
          <View style={styles.confidenceBlock}>
            {belief === null ? (
              <Text style={styles.beliefScore}>Personne n’a encore donné son avis.</Text>
            ) : (
              <>
                {/* Le chiffre flotte au-dessus du curseur plutôt que sur sa
                    propre ligne pleine largeur — rien d'écrit sur la jauge
                    elle-même, juste ce repère ponctuel. Positionné via
                    `justifyContent` (gauche/centre/droite selon le tiers où
                    tombe le curseur) plutôt qu'un pourcentage exact : robuste
                    sans mesurer la largeur du texte. */}
                <View
                  style={[
                    styles.confidenceLabelRow,
                    {
                      justifyContent: belief < 35 ? 'flex-start' : belief > 65 ? 'flex-end' : 'center',
                    },
                  ]}
                >
                  <Text style={styles.confidenceLabel}>
                    {belief}% confiants ({believeVotes + disbelieveVotes} vote
                    {believeVotes + disbelieveVotes > 1 ? 's' : ''})
                  </Text>
                </View>
                <ConfidenceGauge belief={belief} />
              </>
            )}
          </View>
        )}
      </Pressable>

      {item.is_immediate && revealed && !isAuthor && !voted && (
        <View style={styles.quickVoteRow}>
          <Pressable
            onPress={() => handleQuickVote('believe')}
            disabled={voting}
            style={styles.quickVotePill}
            hitSlop={4}
          >
            <Text style={styles.quickVotePillText}>🔥 confiant</Text>
          </Pressable>
          <Pressable
            onPress={() => handleQuickVote('disbelieve')}
            disabled={voting}
            style={styles.quickVotePill}
            hitSlop={4}
          >
            <Text style={styles.quickVotePillText}>❌ pas confiant</Text>
          </Pressable>
        </View>
      )}
      {voteError && <Text style={styles.voteError}>{voteError}</Text>}

      {!item.is_immediate && revealed && !isAuthor && !hasVoted && (
        <Pressable onPress={() => onPress?.()} style={styles.voteLink} hitSlop={4}>
          <Text style={styles.voteLinkText}>Donner mon avis sur ce <PredictWord /> →</Text>
        </Pressable>
      )}

      <View style={styles.footerRow}>
        {/* Trois colonnes de largeur égale — le pouce reste ainsi centré sur
            la carte quel que soit l'espace pris par les commentaires à
            gauche et la poubelle à droite, plutôt que plaqué au bord. */}
        <View style={styles.footerCellLeft}>
          {/* Sobre quand il n'y a rien à voir ; icône plus marquée et chiffre
              en gras noir dès qu'il y a au moins un commentaire. */}
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

        <View style={styles.footerCellCenter}>
          {/* Discret, façon Facebook : un pouce en filigrane (ou l'emoji déjà
              choisi) — maintenir le doigt fait apparaître la bulle de
              réactions au-dessus, la faire glisser dessus en sélectionne une.
              Le chiffre est un bouton à part : un tap dessus ouvre le détail
              de qui a réagi avec quoi, sans interférer avec le geste du pouce. */}
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

        <View style={styles.footerCellRight}>
          {/* Suppression réservée à l'auteur — plus la peine de révéler
              d'abord (la RLS `predictions_delete_own` ne l'a jamais exigé,
              seule l'UI le faisait) : à tout moment sur son propre Predict. */}
          {isAuthor && onDelete && (
            <Pressable onPress={handleDeletePress} hitSlop={8}>
              <Trash2 size={17} color={colors.icon} strokeWidth={1.75} />
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
  authorName: { fontFamily: fonts.bodyEmphasis, fontSize: 14, color: colors.icon, flexShrink: 1, minWidth: 0 },
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
  // Secondaire : simple amorce au-dessus de la vraie prédiction, jamais
  // l'élément qu'on retient de la carte — même registre mono/tracké que la
  // signalétique d'état, pour rester discret. `letterSpacing` + majuscules
  // plutôt que la graisse : c'est ce qui la distingue du corps, pas son poids.
  cardTeaser: {
    fontFamily: fonts.label,
    fontSize: 12,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: colors.textFaint,
    marginBottom: 4,
  },
  // La vraie prédiction est le cœur de la carte : plus grande, plus foncée,
  // en gras marqué — jamais grisée, y compris floutée avant révélation (le
  // flou matérialise déjà le secret, un texte terne en plus serait redondant
  // et affaiblirait l'impact au moment où elle devient lisible).
  cardContent: {
    fontFamily: fonts.bodyEmphasis,
    fontSize: 18,
    color: colors.text,
    lineHeight: 25,
  },
  // `overflow: hidden` : le flou (`BlurView`) ne doit jamais déborder sur le
  // teaser au-dessus ou le reste de la carte en dessous.
  blurWrap: { overflow: 'hidden', borderRadius: radius.sm },
  beliefScore: { fontSize: 13, color: colors.textMuted, marginTop: 10 },
  // Jauge d'opinion : rien d'écrit sur la barre elle-même — juste un curseur
  // à la position du pourcentage, et le chiffre qui flotte au-dessus.
  confidenceBlock: { marginTop: 12 },
  confidenceLabelRow: { flexDirection: 'row', marginBottom: 4 },
  confidenceLabel: { fontSize: 12, fontWeight: '700', color: colors.text },
  // Deux actions d'engagement immédiat, sans quitter le Fil. Contour fin +
  // fond blanc : présentes sans écraser la carte.
  quickVoteRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
  quickVotePill: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    paddingVertical: 9,
    alignItems: 'center',
    backgroundColor: colors.surface,
  },
  quickVotePillText: { fontSize: 13, fontWeight: '700', color: colors.text },
  voteError: { fontSize: 12, color: colors.danger, marginTop: 8 },
  voteLink: { marginTop: 10 },
  voteLinkText: { fontFamily: fonts.bodyEmphasis, fontSize: 13, color: colors.text },
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
  // fait glisser, et pas des puces séparées.
  // Ancrée par son bord droit sur le pouce (plutôt que centrée) : le pouce
  // est proche du bord droit de la carte, une bulle centrée débordait hors
  // de l'écran.
  emojiPanel: {
    position: 'absolute',
    bottom: '100%',
    right: 0,
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
    marginTop: 10,
  },
  // Trois cellules de largeur égale : le pouce (cellule centrale) reste ainsi
  // centré sur la carte quels que soient la largeur des commentaires à
  // gauche et la présence ou non de la poubelle à droite.
  footerCellLeft: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  footerCellCenter: { flex: 1, alignItems: 'center' },
  footerCellRight: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end' },
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
