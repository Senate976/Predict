import { useRouter } from 'expo-router';
import { Eye, EyeOff, Lock, MessageCircle, Star, ThumbsUp, Trash2 } from 'lucide-react-native';
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

import { fetchCommentCount } from '../lib/comments';
import { formatCountdown, toDateInput } from '../lib/datetime';
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
  const [reactorsOpen, setReactorsOpen] = useState(false);
  const [reactors, setReactors] = useState<EmojiReactor[] | null>(null);
  const [reactorsLoading, setReactorsLoading] = useState(false);
  const [reactorsError, setReactorsError] = useState<string | null>(null);
  const revealed = isRevealed(item, now);
  const isAuthor = item.author_id === userId;

  const verdict = revealed && item.final_status !== 'pending' ? item.final_status : null;

  /** Bandeau d'état en tête de carte : la nature de la prédiction d'un coup
   * d'œil, avant même de lire le teaser. Remplace l'ancien liseré de verdict
   * dans l'en-tête — ce bandeau couvre désormais les 4 états. */
  const statusBanner: { kind: 'sealed' | 'active' | 'realized' | 'missed'; label: string; extra?: string } = !revealed
    ? {
        kind: 'sealed',
        label: `Scellé le ${toDateInput(new Date(item.created_at))}`,
        extra: item.open_ended ? undefined : `Révélé ${formatCountdown(new Date(item.reveal_at), now)}`,
      }
    : verdict === 'realized'
      ? { kind: 'realized', label: 'Réalisé' }
      : verdict === 'missed'
        ? { kind: 'missed', label: 'Manqué' }
        : { kind: 'active', label: 'En cours' };

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
      {/* Bandeau d'état : la nature de la carte (scellée / en cours / réalisée
          / manquée) d'un coup d'œil, avant même de lire le teaser. Tout en
          haut, en dehors de la zone tappable et à cheval sur le padding de la
          carte (marges négatives) pour occuper toute sa largeur et venir
          affleurer ses coins arrondis — `overflow: hidden` sur la carte fait
          le reste. Trois cellules de largeur égale, comme le pied de carte
          plus bas, pour que le libellé central reste centré même quand une
          cellule (compte à rebours) est vide de l'autre côté. */}
      <View
        style={[
          styles.statusBanner,
          statusBanner.kind === 'sealed' && styles.statusBannerSealed,
          statusBanner.kind === 'active' && styles.statusBannerActive,
          statusBanner.kind === 'realized' && styles.statusBannerRealized,
          statusBanner.kind === 'missed' && styles.statusBannerMissed,
        ]}
      >
        <View style={styles.statusBannerSide} />
        <View style={styles.statusBannerCenter}>
          {statusBanner.kind === 'sealed' && (
            <Lock size={11} color={colors.gold} strokeWidth={2} style={styles.statusBannerIcon} />
          )}
          <Text
            style={[
              styles.statusBannerText,
              statusBanner.kind === 'sealed' && styles.statusBannerTextSealed,
              statusBanner.kind === 'missed' && styles.statusBannerTextMissed,
            ]}
            numberOfLines={1}
          >
            {statusBanner.label}
          </Text>
        </View>
        <View style={[styles.statusBannerSide, styles.statusBannerSideRight]}>
          {statusBanner.extra && (
            <View style={styles.statusBannerBubble}>
              <Text style={styles.statusBannerBubbleText} numberOfLines={1}>
                {statusBanner.extra}
              </Text>
            </View>
          )}
        </View>
      </View>

      <Pressable onPress={() => onPress?.()} style={({ pressed }) => pressed && styles.cardPressed}>
        {/* Une seule ligne : [avatar][pseudo] ...espace flexible... */}
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
            Le flou ne concerne que les destinataires (avant révélation, ils
            n'ont de toute façon rien à cet endroit) : l'auteur voit toujours
            son propre texte net, y compris avant révélation. */}
        {(revealed || isAuthor) && item.content && (
          <Text style={styles.cardContent}>{item.content}</Text>
        )}
      </Pressable>

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

          {/* Favori : étoile pleine dès qu'activée, discrète sinon — remis en
              icône directe plutôt que caché dans un menu, pour un accès en un
              tap comme le commentaire et la réaction juste à côté. */}
          <Pressable onPress={handleToggleFavorite} hitSlop={8}>
            <Star
              size={16}
              color={isFavorite ? colors.gold : colors.textFaint}
              fill={isFavorite ? colors.gold : 'none'}
              strokeWidth={1.75}
            />
          </Pressable>
        </View>

        <View style={styles.footerCellCenter}>
          {/* Discret, façon Facebook : un pouce en filigrane (ou l'emoji déjà
              choisi) — maintenir le doigt fait apparaître la bulle de
              réactions au-dessus, la faire glisser dessus en sélectionne une.
              Le chiffre est un bouton à part : un tap dessus ouvre le détail
              de qui a réagi avec quoi, sans interférer avec le geste du pouce. */}
          <View style={styles.reactionTriggerRow}>
            <View style={styles.reactionTriggerWrap}>
              <View style={styles.reactionTrigger} hitSlop={8} {...panResponder.panHandlers}>
                {myEmoji ? (
                  <Text style={styles.reactionTriggerEmoji}>{myEmoji}</Text>
                ) : (
                  <ThumbsUp size={17} color={totalReactions > 0 ? colors.icon : colors.textFaint} strokeWidth={1.75} />
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
            {totalReactions > 0 && (
              <Pressable onPress={openReactors} hitSlop={8}>
                <Text style={styles.reactionTriggerCount}>{totalReactions}</Text>
              </Pressable>
            )}
          </View>
        </View>

        <View style={styles.footerCellRight}>
          {/* Masquer : préférence personnelle (comme le favori), pas réservée
              à l'auteur — remis en icône directe pour le même accès rapide. */}
          <Pressable onPress={handleToggleHidden} hitSlop={8}>
            {isHidden ? (
              <Eye size={16} color={colors.icon} strokeWidth={1.75} />
            ) : (
              <EyeOff size={16} color={colors.textFaint} strokeWidth={1.75} />
            )}
          </Pressable>

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
    // Le bandeau d'état (juste en dessous) déborde volontairement du padding
    // via des marges négatives pour occuper toute la largeur de la carte —
    // `overflow: hidden` le clippe proprement aux coins arrondis plutôt que
    // de les déborder en carré.
    overflow: 'hidden',
    // Web uniquement : sans ça, glisser le pouce vers un emoji du panneau
    // sélectionne le texte de la carte au passage, ce qui coupe le geste
    // (`onPanResponderTerminate`) au lieu de faire glisser la sélection
    // d'emoji comme sur Facebook.
    ...(Platform.OS === 'web' ? { userSelect: 'none' } : null),
  },
  // Non lue : fine bordure lumineuse + fond très légèrement teinté, assez
  // discret pour ne pas jurer avec le reste de la charte noir/blanc/jaune.
  cardUnseen: {
    borderColor: colors.gold,
    backgroundColor: colors.goldSoft,
  },
  // Bandeau d'état : toute la largeur de la carte, tout en haut — les marges
  // négatives annulent le padding de la carte sur les 3 côtés concernés,
  // `overflow: hidden` sur la carte fait le reste pour les coins arrondis.
  // Trois cellules de largeur égale (comme le pied de carte plus bas) pour
  // garder le libellé central vraiment centré, que la cellule de droite
  // porte un compte à rebours ou reste vide.
  statusBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: -18,
    marginHorizontal: -18,
    marginBottom: 12,
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  statusBannerSide: { flex: 1 },
  statusBannerSideRight: { alignItems: 'flex-end' },
  statusBannerCenter: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  statusBannerIcon: { marginRight: 4 },
  // Sceller : anthracite, seul état sans texte noir ni jaune en fond — le
  // cadenas jaune reste le seul rappel de la charte sur ce bandeau-là.
  statusBannerSealed: { backgroundColor: colors.bannerSealedBg },
  // En cours / Réalisé / Manqué : fonds à 75% d'opacité (charte), Manqué garde
  // sa teinte magenta de marque — seul le mot « Manqué » se grise, pas le fond.
  statusBannerActive: { backgroundColor: 'rgba(250, 204, 21, 0.75)' },
  statusBannerRealized: { backgroundColor: 'rgba(54, 168, 160, 0.75)' },
  statusBannerMissed: { backgroundColor: 'rgba(156, 29, 110, 0.75)' },
  // `flexShrink` (et non 0) : quand la cellule de droite porte un compte à
  // rebours, le libellé central doit pouvoir se tronquer plutôt que déborder
  // dessus — la date de scellé reste lisible même sur un écran étroit. Noir
  // par défaut (en cours / réalisé) ; le scellé, seul état sur fond sombre,
  // s'éclaircit via `statusBannerTextSealed` ; le manqué grise via
  // `statusBannerTextMissed` tout en gardant son fond magenta.
  statusBannerText: {
    flexShrink: 1,
    minWidth: 0,
    textAlign: 'center',
    fontFamily: fonts.label,
    fontSize: 12,
    fontWeight: '600',
    color: colors.text,
  },
  statusBannerTextSealed: { color: colors.bannerSealedText },
  statusBannerTextMissed: { color: colors.textFaint },
  // Toujours sur fond anthracite (seul état à porter cette cellule).
  // Bulle distincte plutôt qu'un texte se fondant dans le bandeau — la date
  // de révélation reste une information à part, pas une suite du libellé.
  statusBannerBubble: {
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    borderRadius: radius.pill,
    paddingHorizontal: 8,
    paddingVertical: 2,
    marginRight: 8,
  },
  statusBannerBubbleText: { fontSize: 11, fontWeight: '600', color: colors.bannerSealedText },
  // Tout sur une seule ligne : [avatar 32][pseudo] ...espace flexible...
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  headerSpacer: { flex: 1, minWidth: 8 },
  // `flexShrink` sur le bloc auteur ET sur le pseudo : c'est le pseudo qui se
  // tronque avec ellipse si la place manque.
  authorBlock: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1, minWidth: 0 },
  authorName: { fontFamily: fonts.bodyEmphasis, fontSize: 16, color: colors.icon, flexShrink: 1, minWidth: 0 },
  // Sur sa propre ligne, sous l'en-tête — jamais accolée au pseudo.
  mentionTag: { fontSize: 12, fontWeight: '500', color: colors.textMuted, marginTop: -4, marginBottom: 10 },
  // Secondaire : simple amorce au-dessus de la vraie prédiction, jamais
  // l'élément qu'on retient de la carte — même registre mono/tracké que la
  // signalétique d'état, pour rester discret. `letterSpacing` + majuscules
  // plutôt que la graisse : c'est ce qui la distingue du corps, pas son poids.
  cardTeaser: {
    fontFamily: fonts.label,
    fontSize: 14,
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
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  // Une seule « grande bulle », façon Facebook — flottante au-dessus du
  // pouce (pas en dessous) pour ne pas être masquée par le doigt qui la
  // fait glisser, et pas des puces séparées.
  // Centrée sur le pouce lui-même (`reactionTriggerWrap` ne contient plus que
  // l'icône, plus le compteur) : un ancrage par le bord droit débordait hors
  // du cadre à gauche, le pouce étant au centre de la carte.
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
    marginTop: 10,
  },
  // Trois cellules de largeur égale : le pouce (cellule centrale) reste ainsi
  // centré sur la carte quels que soient la largeur des commentaires à
  // gauche et la présence ou non de la poubelle à droite.
  footerCellLeft: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 16 },
  footerCellCenter: { flex: 1, alignItems: 'center' },
  footerCellRight: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 16 },
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
