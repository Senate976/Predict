import { useRouter } from 'expo-router';
import { Eye, EyeOff, Lock, MessageCircle, MoreHorizontal, Star, ThumbsUp, Trash2 } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Image,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import { Text } from './Text';

import { fetchCommentCount } from '../lib/comments';
import { formatStampDate } from '../lib/datetime';
import {
  castEmojiReaction,
  EMOJI_REACTIONS,
  fetchEmojiReactors,
  isRevealed,
  removeEmojiReaction,
  setPredictionUserState,
  setPredictionVerdict,
  type EmojiReaction,
  type EmojiReactor,
  type PredictionFeedItem,
} from '../lib/predictions';
import { colors, fonts, radius } from '../lib/theme';
import { Avatar } from './Avatar';
import { InlineComments } from './InlineComments';

/** Largeur fixe de la bulle de réactions, ancrée par son bord droit sur le pouce. */
const EMOJI_PANEL_WIDTH = 272;
/** 12 réactions sur 2 rangées de 6 plutôt qu'une seule rangée trop dense. */
const EMOJI_COLUMNS = 6;
const EMOJI_ROWS = Math.ceil(EMOJI_REACTIONS.length / EMOJI_COLUMNS);
/** Artwork du Sceau d'Orgueil — dérivé de la vraie photo de référence
 * (assets/images/stamp-encore-raison-source.png) par scripts/erase_stamp_date.py,
 * qui efface uniquement la date d'exemple gravée dans la source. Anneaux et
 * texte « ENCORE RAISON » restent la photo telle quelle ; seule la date, qui
 * change à chaque prédiction, est superposée dynamiquement par-dessus. */
const STAMP_IMAGE = require('../assets/images/stamp-encore-raison.png');
/** Même principe pour le verdict manqué, à partir de la photo
 * assets/images/stamp-fail-source.png (scripts/erase_stamp_fail_date.py). */
const STAMP_FAIL_IMAGE = require('../assets/images/stamp-fail.png');
/** Diamètre d'affichage des deux tampons — identique pour les deux verdicts,
 * largeur et hauteur égales pour rester un cercle parfait. */
const STAMP_DIAMETER = 96;
/** Position de la date et de son soulignement, en fraction du diamètre —
 * doit rester cohérente avec la zone effacée par scripts/erase_stamp_date.py
 * (dont ce script imprime les fractions exactes à chaque exécution). */
const STAMP_DATE_TOP_FRACTION = 0.6;
const STAMP_DATE_RULE_TOP_FRACTION = 0.696;
/** Idem pour le tampon « FAIL » — voir scripts/erase_stamp_fail_date.py. Pas
 * de soulignement ici : le trait doré de cette photo est gravé au-dessus de
 * la date (pas en dessous), donc déjà présent dans l'artwork lui-même. */
const STAMP_FAIL_DATE_TOP_FRACTION = 0.665;
/** Légère rotation du tampon « ENCORE RAISON », façon coup de tampon donné
 * à la main plutôt que parfaitement aligné. */
const STAMP_REALIZED_ROTATION_DEG = 10;

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
  onVerdictChange,
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
  /** Prévient l'écran parent une fois le verdict affirmé par l'auteur, pour
   * que son onglet « Mes Predicts » reflète le nouveau statut sans recharger
   * tout le fil. */
  onVerdictChange?: (verdict: 'realized' | 'missed') => void;
}) {
  const router = useRouter();
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
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
  // Écho optimiste de `setPredictionVerdict` : le statut canonique vient de
  // `item.final_status` (props), mais attendre le prochain chargement du fil
  // pour voir le tampon apparaître, après un tap sur Réalisé/Manqué, serait
  // trop lent. `null` tant que l'auteur n'a rien affirmé pendant cette
  // session — la valeur posée en base fait foi dès le rechargement suivant.
  const [localVerdict, setLocalVerdict] = useState<'realized' | 'missed' | null>(null);
  // Écho optimiste de la date du Sceau d'Orgueil, posée en même temps que
  // `localVerdict` — sans lui, le tampon afficherait `item.verdict_set_at`
  // (encore `null` avant le prochain chargement du fil) au lieu du jour où
  // l'auteur vient tout juste d'affirmer son verdict.
  const [localVerdictSetAt, setLocalVerdictSetAt] = useState<Date | null>(null);
  const [verdictPending, setVerdictPending] = useState(false);
  const [verdictError, setVerdictError] = useState<string | null>(null);
  const revealed = isRevealed(item, now);
  const isAuthor = item.author_id === userId;

  const verdict = localVerdict ?? (revealed && item.final_status !== 'pending' ? item.final_status : null);
  const verdictSetAt =
    localVerdictSetAt ?? (item.verdict_set_at ? new Date(item.verdict_set_at) : new Date(item.reveal_at));

  /** Les 4 états visuels de la carte — un contour néon dédié (voir `styles`)
   * à tous, mais un libellé en haut à droite seulement pour Scellé/En cours :
   * une fois le verdict affirmé, le tampon en dessous porte seul la réponse,
   * `label` reste `undefined` plutôt que de la répéter en haut de la carte. */
  const cardState: { kind: 'sealed' | 'active' | 'realized' | 'missed'; label?: string } = !revealed
    ? { kind: 'sealed', label: 'SCELLÉ' }
    : verdict === 'realized'
      ? { kind: 'realized' }
      : verdict === 'missed'
        ? { kind: 'missed' }
        : { kind: 'active', label: 'EN COURS' };

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

  /** Geste unique et définitif — la RPC elle-même refuse un second appel une
   * fois le verdict posé (voir `set_prediction_verdict`), donc pas de retour
   * en arrière possible ici non plus si l'appel échoue en cours de route :
   * on efface simplement l'écho optimiste pour retenter. */
  async function handleSetVerdict(next: 'realized' | 'missed') {
    setVerdictPending(true);
    setVerdictError(null);
    setLocalVerdict(next);
    setLocalVerdictSetAt(new Date());
    const { error } = await setPredictionVerdict(item.id, next);
    setVerdictPending(false);
    if (error) {
      setLocalVerdict(null);
      setLocalVerdictSetAt(null);
      setVerdictError('Action impossible.');
      return;
    }
    onVerdictChange?.(next);
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
      Animated.spring(scaleAnims[index], { toValue: 1.9, useNativeDriver: false, speed: 20 }).start();
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
        // Grille 2D (6 colonnes × 2 rangées) : la position du doigt se lit
        // séparément sur chaque axe, puis se combine en index de tableau
        // (ordre ligne par ligne, identique à l'ordre d'affichage du `.map`).
        const relativeX = gesture.moveX - layout.x;
        const relativeY = gesture.moveY - layout.y;
        const col = Math.min(EMOJI_COLUMNS - 1, Math.max(0, Math.floor((relativeX / layout.width) * EMOJI_COLUMNS)));
        const row = Math.min(EMOJI_ROWS - 1, Math.max(0, Math.floor((relativeY / layout.height) * EMOJI_ROWS)));
        const index = Math.min(EMOJI_REACTIONS.length - 1, row * EMOJI_COLUMNS + col);
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
        cardState.kind === 'sealed' && styles.cardSealed,
        cardState.kind === 'active' && styles.cardActive,
        cardState.kind === 'realized' && styles.cardRealized,
        cardState.kind === 'missed' && styles.cardMissed,
        unseen && styles.cardUnseen,
      ]}
    >
      {/* Sur sa propre ligne, au-dessus de [avatar][pseudo] plutôt qu'inline
          dans l'en-tête : le pseudo garde toute la largeur de sa ligne au
          lieu de la disputer à ce libellé. Absent pour Réalisé/Manqué — le
          tampon en dessous porte seul la réponse, plus de titre à répéter. */}
      {cardState.label && (
        <View style={styles.stateRow}>
          {cardState.kind === 'sealed' && <Lock size={12} color={colors.sealedLabel} strokeWidth={2} />}
          <Text
            style={[
              styles.stateLabel,
              cardState.kind === 'sealed' && styles.stateLabelSealed,
              cardState.kind === 'active' && styles.stateLabelActive,
            ]}
            numberOfLines={1}
          >
            {cardState.label}
          </Text>
        </View>
      )}

      {/* Invite l'auteur à trancher dès que sa prédiction est révélée mais
          encore en attente de verdict — nulle part ailleurs que sur sa propre
          carte, en dehors de la zone tappable (`onPress` navigue vers le
          détail) : un tap sur un bouton ne doit jamais aussi ouvrir l'écran
          détail. Rien que les deux boutons, aucun texte d'accompagnement —
          une fois posé, revenir dessus n'est plus possible ici, seulement
          depuis l'écran détail (voir `set_prediction_verdict`, section 35). */}
      {isAuthor && revealed && verdict === null && (
        <View style={styles.verdictPrompt}>
          <View style={styles.verdictPromptButtons}>
            <Pressable
              onPress={() => handleSetVerdict('realized')}
              disabled={verdictPending}
              style={[styles.verdictPromptButton, styles.verdictPromptButtonRealized]}
            >
              <Text style={styles.verdictPromptButtonText}>Réalisé</Text>
            </Pressable>
            <Pressable
              onPress={() => handleSetVerdict('missed')}
              disabled={verdictPending}
              style={[styles.verdictPromptButton, styles.verdictPromptButtonMissed]}
            >
              <Text style={styles.verdictPromptButtonText}>Manqué</Text>
            </Pressable>
          </View>
          {verdictError && <Text style={styles.verdictPromptError}>{verdictError}</Text>}
        </View>
      )}

      {/* Le corps de la carte (avatar, pseudo, texte, réactions) — jamais le
          badge d'état ci-dessus — s'assourdit légèrement une fois Manquée :
          la carte reste lisible, mais se lit d'emblée comme secondaire par
          rapport à un Predict Réalisé. Scellée reste à pleine opacité — la
          lisibilité prime, seul le contour néon doré marque son statut. */}
      <View style={[cardState.kind === 'missed' && styles.cardBodyMissed]}>
        <Pressable onPress={() => onPress?.()} style={({ pressed }) => pressed && styles.cardPressed}>
        {/* Une seule ligne : [avatar][pseudo] ...espace flexible... [bulle de
            révélation (si programmée et pas encore révélée) ou tampon de
            verdict (une fois affirmé par l'auteur) — jamais les deux à la
            fois, les deux conditions s'excluent]. */}
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

          {/* Favoris, masquer, supprimer : des actions de gestion, pas des
              réactions sociales — regroupées ici plutôt que dans le pied de
              carte, qui ne garde que commentaire et réaction. */}
          <Pressable onPress={() => setMenuOpen(true)} hitSlop={8} style={styles.headerMenuButton}>
            <MoreHorizontal size={18} color={colors.icon} strokeWidth={1.75} />
          </Pressable>
        </View>

        <View>
          {/* Sur sa propre ligne, jamais accolée au pseudo — la liste
              complète des personnes citées y empiétait dès qu'il y en avait
              plusieurs. */}
          {mentionLabel && <Text style={styles.mentionTag} numberOfLines={1}>{mentionLabel}</Text>}

          <Text style={styles.cardTeaser}>{item.teaser}</Text>

          {/* Le contenu (la vraie prédiction, derrière la promesse du
              teaser) devient visible directement sur la carte une fois
              révélée — sans ça, l'onglet Predict n'avait rien de plus à
              montrer qu'un teaser déjà lu avant révélation. La RLS ne
              renvoie `content` que si révélée ou si on en est l'auteur : lui
              seul voit toujours son propre texte en clair, y compris avant
              révélation — jamais masqué, même pour lui. */}
          {(revealed || isAuthor) && item.content && (
            <Text style={styles.cardContent}>{item.content}</Text>
          )}

          {/* Le tampon certifie le verdict sous la prédiction, dans le flux
              normal (plus en position absolue par-dessus le texte), pour ne
              jamais chevaucher ni gêner la lecture du contenu au-dessus — que
              ce soit « ENCORE RAISON » ou « FAIL », chacun dérivé d'une vraie
              photo de référence (scripts/erase_stamp_date.py et
              scripts/erase_stamp_fail_date.py), seule la date de l'auteur
              étant superposée par-dessus, la seule partie qui change d'une
              prédiction à l'autre. Même diamètre pour les deux verdicts ;
              seul « ENCORE RAISON » est légèrement pivoté, façon coup de
              tampon donné à la main. */}
          {verdict === 'realized' && (
            <View style={styles.verdictStampRealized}>
              <Image source={STAMP_IMAGE} style={styles.verdictStampRealizedImage} resizeMode="contain" />
              <Text style={styles.verdictStampRealizedDate}>{formatStampDate(verdictSetAt)}</Text>
              <View style={styles.verdictStampRealizedDateRule} />
            </View>
          )}
          {verdict === 'missed' && (
            <View style={styles.verdictStampFail}>
              <Image source={STAMP_FAIL_IMAGE} style={styles.verdictStampRealizedImage} resizeMode="contain" />
              <Text style={styles.verdictStampFailDate}>{formatStampDate(verdictSetAt)}</Text>
            </View>
          )}
        </View>
      </Pressable>

      {/* Fil épuré façon réseau social : plus que les deux interactions
          sociales, alignées à gauche et groupées de près — favoris, masquer
          et supprimer sont désormais des actions de gestion, reléguées au
          menu ••• de l'en-tête. Le chiffre s'affiche toujours (y compris à
          zéro), pas seulement dès la première interaction. */}
      <View style={styles.footerRow}>
        <Pressable onPress={() => setCommentsOpen((o) => !o)} style={styles.commentsToggle} hitSlop={4}>
          <View style={styles.iconSlot}>
            <MessageCircle
              size={18}
              color={(commentCount ?? 0) > 0 ? colors.text : colors.footerIconInactive}
              strokeWidth={1.75}
              fill={commentsOpen ? colors.text : 'none'}
            />
          </View>
          <Text style={[styles.commentsToggleText, (commentCount ?? 0) === 0 && styles.footerCountInactive]}>
            {commentCount ?? 0}
          </Text>
        </Pressable>

        {/* Discret, façon Facebook : un pouce en filigrane (ou l'emoji déjà
            choisi) — maintenir le doigt fait apparaître la bulle de
            réactions au-dessus, la faire glisser dessus en sélectionne une.
            Le chiffre est un bouton à part : un tap dessus ouvre le détail
            de qui a réagi avec quoi, sans interférer avec le geste du pouce. */}
        <View style={styles.reactionTriggerRow}>
          <View style={styles.reactionTriggerWrap}>
            <View style={[styles.reactionTrigger, styles.iconSlot]} hitSlop={8} {...panResponder.panHandlers}>
              {myEmoji ? (
                <Text style={styles.reactionTriggerEmoji}>{myEmoji}</Text>
              ) : (
                <ThumbsUp
                  size={18}
                  color={totalReactions > 0 ? colors.text : colors.footerIconInactive}
                  strokeWidth={1.75}
                />
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
          <Pressable onPress={openReactors} hitSlop={8}>
            <Text style={[styles.reactionTriggerCount, totalReactions === 0 && styles.footerCountInactive]}>
              {totalReactions}
            </Text>
          </Pressable>
        </View>
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

      {/* Menu de gestion (favoris / masquer / supprimer) — déplacé ici
          depuis le pied de carte, qui ne garde plus que les réactions
          sociales. Ouvert depuis le bouton ••• de l'en-tête. */}
      <Modal
        visible={menuOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setMenuOpen(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setMenuOpen(false)}>
          <Pressable style={styles.cardMenuBox} onPress={() => {}}>
            <Pressable
              onPress={() => {
                setMenuOpen(false);
                handleToggleFavorite();
              }}
              style={styles.cardMenuRow}
            >
              <Star
                size={18}
                color={isFavorite ? colors.gold : colors.icon}
                fill={isFavorite ? colors.gold : 'none'}
                strokeWidth={1.75}
              />
              <Text style={styles.cardMenuRowText}>
                {isFavorite ? 'Retirer des favoris' : 'Ajouter aux favoris'}
              </Text>
            </Pressable>

            <Pressable
              onPress={() => {
                setMenuOpen(false);
                handleToggleHidden();
              }}
              style={[styles.cardMenuRow, !(isAuthor && onDelete) && styles.cardMenuRowLast]}
            >
              {isHidden ? (
                <Eye size={18} color={colors.icon} strokeWidth={1.75} />
              ) : (
                <EyeOff size={18} color={colors.icon} strokeWidth={1.75} />
              )}
              <Text style={styles.cardMenuRowText}>{isHidden ? 'Afficher à nouveau' : 'Masquer'}</Text>
            </Pressable>

            {isAuthor && onDelete && (
              <Pressable
                onPress={() => {
                  setMenuOpen(false);
                  handleDeletePress();
                }}
                style={[styles.cardMenuRow, styles.cardMenuRowLast]}
              >
                <Trash2 size={18} color={colors.danger} strokeWidth={1.75} />
                <Text style={[styles.cardMenuRowText, styles.cardMenuRowTextDanger]}>Supprimer</Text>
              </Pressable>
            )}
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
  // Fond anthracite distinct du fond de page quasi-noir, fine bordure
  // blanche à faible opacité par défaut (état Scellé) — Predict/Réalisé/
  // Manqué reprennent cette même bordure en néon (`cardActive`/`cardRealized`
  // /`cardMissed`) plutôt qu'un aplat de couleur vive en fond ou en en-tête.
  card: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.xl,
    padding: 18,
    marginBottom: 12,
    backgroundColor: colors.surface,
    // Web uniquement : sans ça, glisser le pouce vers un emoji du panneau
    // sélectionne le texte de la carte au passage, ce qui coupe le geste
    // (`onPanResponderTerminate`) au lieu de faire glisser la sélection
    // d'emoji comme sur Facebook.
    ...(Platform.OS === 'web' ? { userSelect: 'none' } : null),
  },
  // Scellée : même traitement glow que les 3 autres états, doré plutôt que
  // cyan/vert/rouge — un halo discret (`shadowOpacity` faible), pas la lueur
  // marquée des deux verdicts. Fond `surface` inchangé : la lisibilité prime,
  // seul le contour néon marque le statut.
  cardSealed: {
    borderColor: colors.sealedBorder,
    shadowColor: colors.sealedBorder,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 4,
  },
  // Predict revélé, en attente de verdict : contour néon cyan, sans lueur —
  // la lueur externe (`shadow*`) reste réservée aux verdicts et à Scellée.
  cardActive: { borderColor: colors.neonCyan },
  // Les deux verdicts, l'élément clé du site : contour néon + lueur externe
  // (`shadow*` — se traduit en `box-shadow` sur le web, `elevation` sur
  // Android n'en reprend que l'ombre portée, sans teinte colorée).
  cardRealized: {
    borderColor: colors.neonGreen,
    shadowColor: colors.neonGreen,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.55,
    shadowRadius: 14,
    elevation: 10,
  },
  cardMissed: {
    borderColor: colors.neonRed,
    shadowColor: colors.neonRed,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.55,
    shadowRadius: 14,
    elevation: 10,
  },
  // Non lue : fine bordure lumineuse + fond très légèrement teinté, assez
  // discret pour ne pas jurer avec le reste de la charte sombre/jaune.
  // Toujours appliquée en dernier : elle prime sur la couleur néon de l'état
  // — signaler « pas encore vue » reste plus urgent que le statut lui-même.
  cardUnseen: {
    borderColor: colors.gold,
    backgroundColor: colors.goldSoft,
  },
  // Libellé d'état sur sa propre ligne, au-dessus de [avatar][pseudo] —
  // jamais inline dans l'en-tête, où il disputerait la largeur au pseudo.
  stateRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 6, marginBottom: 10 },
  stateLabel: {
    fontFamily: fonts.label,
    fontSize: 11,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  stateLabelSealed: { color: colors.sealedLabel },
  stateLabelActive: { color: colors.neonCyan },
  // Corps de carte assourdi une fois Manquée — jamais le badge d'état,
  // rendu séparément avant ce conteneur et donc toujours à `opacity: 1`.
  cardBodyMissed: { opacity: 0.85 },
  headerMenuButton: { padding: 2 },
  // Invite l'auteur à trancher — au-dessus de la carte tappable, jamais
  // dedans, pour qu'un tap sur un bouton ne navigue jamais aussi vers le
  // détail (`onPress` de la `Pressable` qui suit). Rien que les deux
  // boutons, alignés à droite comme le reste des compléments de carte
  // (bulle de révélation, tampon) — aucun texte d'accompagnement.
  verdictPrompt: { marginBottom: 12 },
  verdictPromptButtons: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8 },
  verdictPromptButton: {
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  // Mêmes couleurs néon que le contour de carte une fois le verdict affirmé
  // (`cardRealized`/`cardMissed`) — cohérence entre le choix proposé ici et
  // son résultat visuel une fois posé.
  verdictPromptButtonRealized: {
    borderColor: colors.neonGreen,
    backgroundColor: 'rgba(0, 230, 118, 0.12)',
  },
  verdictPromptButtonMissed: {
    borderColor: colors.neonRed,
    backgroundColor: 'rgba(255, 23, 68, 0.12)',
  },
  verdictPromptButtonText: { fontFamily: fonts.label, fontSize: 12, fontWeight: '700', color: colors.text },
  verdictPromptError: { fontSize: 11, color: colors.danger, marginTop: 6, textAlign: 'right' },
  // Le Sceau d'Orgueil « ENCORE RAISON » : artwork photo (voir
  // scripts/erase_stamp_date.py), la date de l'auteur superposée par-dessus
  // en position absolue. Toujours dans le flux normal, aligné à droite,
  // jamais en surimpression du texte de la prédiction — légèrement pivoté,
  // façon coup de tampon donné à la main plutôt qu'un cercle parfaitement
  // droit.
  verdictStampRealized: {
    alignSelf: 'flex-end',
    marginTop: 8,
    width: STAMP_DIAMETER,
    height: STAMP_DIAMETER,
    // L'artwork est une vraie photo d'encre sombre sur papier (détouré en
    // transparence) — sur la carte désormais sombre, cette encre s'y fondrait
    // sans ce disque couleur papier qui restaure le contraste d'origine.
    borderRadius: STAMP_DIAMETER / 2,
    backgroundColor: 'rgba(245, 242, 232, 0.94)',
    transform: [{ rotate: `${STAMP_REALIZED_ROTATION_DEG}deg` }],
  },
  verdictStampRealizedImage: { width: '100%', height: '100%' },
  // Positionnée par-dessus l'artwork, dans l'espace laissé vide sous
  // « ENCORE RAISON » — voir `STAMP_DATE_TOP_FRACTION` et le script de
  // génération pour la correspondance des positions.
  verdictStampRealizedDate: {
    position: 'absolute',
    top: STAMP_DIAMETER * STAMP_DATE_TOP_FRACTION,
    left: 0,
    right: 0,
    fontFamily: fonts.bodyEmphasis,
    fontSize: 9,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    // Posée sur le disque couleur papier du tampon, pas sur la carte sombre —
    // toujours une teinte sombre ici, jamais `text` (clair en mode sombre).
    color: colors.textOnGold,
    textAlign: 'center',
  },
  verdictStampRealizedDateRule: {
    position: 'absolute',
    top: STAMP_DIAMETER * STAMP_DATE_RULE_TOP_FRACTION,
    left: '27%',
    width: '46%',
    height: 1,
    backgroundColor: colors.textOnGold,
  },
  // Le tampon « FAIL », même gabarit (diamètre identique) mais droit, sans
  // rotation — voir scripts/erase_stamp_fail_date.py. Le trait doré de cette
  // photo est gravé au-dessus de la date, déjà présent dans l'artwork : pas
  // de second soulignement dessiné par l'app ici.
  verdictStampFail: {
    alignSelf: 'flex-end',
    marginTop: 8,
    width: STAMP_DIAMETER,
    height: STAMP_DIAMETER,
    // Même disque couleur papier que le tampon « ENCORE RAISON » — voir ce
    // style pour le détail.
    borderRadius: STAMP_DIAMETER / 2,
    backgroundColor: 'rgba(245, 242, 232, 0.94)',
  },
  verdictStampFailDate: {
    position: 'absolute',
    top: STAMP_DIAMETER * STAMP_FAIL_DATE_TOP_FRACTION,
    left: 0,
    right: 0,
    fontFamily: fonts.bodyEmphasis,
    fontSize: 9,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    // Voir `verdictStampRealizedDate` — même disque couleur papier en fond.
    color: colors.textOnGold,
    textAlign: 'center',
  },
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
    fontSize: 15,
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
  // 12 réactions ne tiennent plus sur une seule rangée : `flexWrap` bascule
  // sur 2 rangées de `EMOJI_COLUMNS`, un rectangle arrondi plutôt qu'une
  // pilule (qui n'a de sens que sur une seule ligne).
  emojiPanel: {
    position: 'absolute',
    bottom: '100%',
    left: '50%',
    marginLeft: -EMOJI_PANEL_WIDTH / 2,
    marginBottom: 10,
    width: EMOJI_PANEL_WIDTH,
    zIndex: 20,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    rowGap: 6,
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
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
  // Fil épuré façon réseau social : les deux blocs restants (commentaire,
  // réaction) packés à gauche avec un espacement modeste, plus le
  // `space-between` sur toute la largeur qui n'a plus lieu d'être une fois
  // favoris/masquer/supprimer partis dans le menu ••• de l'en-tête.
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: 20,
    marginTop: 10,
  },
  // Boîte identique (taille + centrage) pour les icônes du pied de carte.
  iconSlot: { width: 22, height: 22, alignItems: 'center', justifyContent: 'center' },
  commentsToggle: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  // Toujours affiché, y compris à zéro — noir dès qu'il y a au moins une
  // interaction, zinc discret sinon (voir `footerCountInactive`).
  commentsToggleText: { fontSize: 13, fontWeight: '700', color: colors.text },
  reactionTriggerWrap: { position: 'relative' },
  reactionTriggerRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  reactionTrigger: { flexDirection: 'row', alignItems: 'center' },
  reactionTriggerEmoji: { fontSize: 17 },
  reactionTriggerCount: { fontSize: 13, fontWeight: '700', color: colors.text },
  footerCountInactive: { color: colors.footerIconInactive },
  // Menu ••• de gestion (favoris / masquer / supprimer), ouvert depuis
  // l'en-tête — même registre visuel que `reactorsBox` (boîte centrée sur
  // fond assombri).
  cardMenuBox: {
    width: '100%',
    maxWidth: 260,
    borderRadius: 16,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 6,
    overflow: 'hidden',
  },
  cardMenuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  cardMenuRowLast: { borderBottomWidth: 0 },
  cardMenuRowText: { fontSize: 15, fontWeight: '600', color: colors.text },
  cardMenuRowTextDanger: { color: colors.danger },
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
