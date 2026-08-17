import { useRouter } from 'expo-router';
import {
  Eye,
  EyeOff,
  MessageCircle,
  MoreHorizontal,
  Star,
  ThumbsUp,
  Trash2,
  Users,
} from 'lucide-react-native';
import { useEffect, useMemo, useRef, useState } from 'react';
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
import { formatCountdown } from '../lib/datetime';
import { uploadVerdictPhoto } from '../lib/photos';
import {
  castEmojiReaction,
  EMOJI_REACTIONS,
  fetchEmojiReactors,
  isRevealed,
  removeEmojiReaction,
  revealPredictionNow,
  setPredictionUserState,
  setPredictionVerdict,
  type EmojiReaction,
  type EmojiReactor,
  type PredictionFeedItem,
} from '../lib/predictions';
import { fonts, radius, type Colors } from '../lib/theme';
import { useColors } from '../lib/themeMode';
import { Avatar } from './Avatar';
import {
  BADGE_CENTER,
  BADGE_SIZE,
  ENVELOPE_RATIO,
  FLAP_DEPTH,
  FlapDown,
  FlapUp,
  LETTER_BORDER,
  LETTER_HEIGHT,
  LETTER_RADIUS,
  LETTER_RISE,
  LETTER_WIDTH,
  letterInk,
  letterPaper,
  PredictBadge,
  WASH,
} from './EnvelopeArt';
import { InlineComments } from './InlineComments';
import { InlineQuestionAnswer } from './InlineQuestionAnswer';
import { PhotoAttachButton } from './PhotoAttachButton';
import { PredictionPhoto } from './PredictionPhoto';

/** Largeur fixe de la bulle de réactions, ancrée par son bord droit sur le pouce. */
const EMOJI_PANEL_WIDTH = 272;
/** 12 réactions sur 2 rangées de 6 plutôt qu'une seule rangée trop dense. */
const EMOJI_COLUMNS = 6;
const EMOJI_ROWS = Math.ceil(EMOJI_REACTIONS.length / EMOJI_COLUMNS);
/** Silhouette affichée à la place du contenu pour un destinataire, avant
 * révélation — la RLS ne lui donne aucun `content` à cet endroit (voir plus
 * bas), donc rien de réel à flouter. Un texte de longueur plausible plutôt
 * que des barres pleines : rendu avec le même style que `cardContent` et le
 * même flou, il se fond visuellement dans le même traitement que le vrai
 * texte flouté vu par l'auteur, au lieu de lire comme un composant à part. */
const SEALED_CONTENT_PLACEHOLDER =
  'Un secret bien gardé jusqu’à la date de révélation, connu de son seul auteur pour l’instant.';

/** Durée d'une pulsation du glow de renforcement (Réalisé) : moitié montée,
 * moitié descente. Deux pulsations dos à dos = `GLOW_PULSE_TOTAL_MS`. */
const GLOW_PULSE_CYCLE_MS = 750;
const GLOW_PULSE_TOTAL_MS = GLOW_PULSE_CYCLE_MS * 2;

/* Toutes les cotes de l'enveloppe viennent de `components/EnvelopeArt.tsx`,
 * où elles sont relevées au pixel près sur les maquettes de référence. Ici on
 * ne fait que les composer avec le contenu de la carte — aucune valeur de
 * forme n'est redéfinie dans ce fichier. */

/** De combien la photo, glissée derrière la lettre comme une seconde page,
 * dépasse à droite et en bas — assez pour qu'on la reconnaisse, jamais au
 * point de concurrencer la lettre. */
const PAGE_PEEK = 26;
/** L'inclinaison qui lui donne son air de carte mal remise dans le paquet. */
const PAGE_TILT = 4;

function easeInOutQuad(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - ((-2 * t + 2) ** 2) / 2;
}

/** `shadow*` est déprécié (avertissement React Native) au profit de
 * `boxShadow`, qui attend une couleur `rgba()` plutôt qu'un hex + une
 * opacité séparée — nécessaire ici puisque l'opacité varie pendant la
 * pulsation. */
function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * L'enveloppe scellée, reproduite depuis `predict scellé.png` : un rectangle
 * de ratio `ENVELOPE_RATIO`, un rabat triangulaire pleine largeur pointant
 * vers le bas, et le badge doré posé sur sa pointe.
 *
 * `width` vient d'un `onLayout` sur la carte : toutes les cotes de la maquette
 * sont des fractions de cette largeur, donc une seule mesure suffit à poser
 * l'ensemble aux bonnes proportions, quelle que soit la taille d'écran.
 */
function SealedEnvelope({ width, glyph }: { width: number; glyph: 'P' | '?' }) {
  const height = width / ENVELOPE_RATIO;
  const badge = width * BADGE_SIZE;
  return (
    <View style={{ width: '100%', height, backgroundColor: WASH.sealedBody }}>
      <FlapDown height={height * FLAP_DEPTH} />
      <View
        style={{
          position: 'absolute',
          left: '50%',
          top: height * BADGE_CENTER,
          marginLeft: -badge / 2,
          marginTop: -badge / 2,
        }}
      >
        <PredictBadge glyph={glyph} size={badge} />
      </View>
    </View>
  );
}

/** Le tampon de verdict — encré, oblique, surdimensionné : le seul élément
 * graphique fort de toute l'app (voir design « Le pli », section 04).
 * Bordeaux pour « encore raison », encre neutre pour « manqué » — jamais de
 * vert/rouge. Posé en surimpression du coin de la lettre, il ne bouge
 * jamais : une contestation ouvre une discussion, jamais ce tampon. */
function VerdictStamp({ verdict, colors }: { verdict: 'realized' | 'missed'; colors: Colors }) {
  const tint = verdict === 'realized' ? colors.accent : colors.ink;
  return (
    <View
      style={[
        stampStyles.stamp,
        verdict === 'realized' ? stampStyles.stampRealized : stampStyles.stampMissed,
        { borderColor: tint },
      ]}
    >
      <Text style={[stampStyles.stampText, { color: tint }]}>
        {verdict === 'realized' ? 'ENCORE\nRAISON' : 'MANQUÉ'}
      </Text>
    </View>
  );
}

/**
 * Carte d'une prédiction, partagée entre les onglets À venir et Passées du
 * Fil. Toujours dépliée (teaser, puis contenu une fois révélé) ; un tap sur
 * la carte navigue vers l'écran détail (`onPress`), où l'auteur gère les
 * destinataires et chacun se prononce une fois révélée. Les commentaires,
 * eux, restent repliés derrière une icône dédiée — pas besoin de quitter le
 * Fil pour les consulter.
 *
 * Visuellement, c'est une enveloppe (voir `EnvelopeFlap`/`WaxSeal` ci-dessus)
 * plutôt qu'une carte à bordure de statut : fermée et scellée de cire tant
 * qu'elle est masquée, ouverte avec la lettre qui en sort une fois révélée —
 * voir le handoff de design « Le pli » pour la grammaire complète.
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
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
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
  // Ouvre la photo jointe en grand — voir la « seconde page » derrière la lettre.
  const [photoOpen, setPhotoOpen] = useState(false);
  // Écho optimiste de `setPredictionVerdict` : le statut canonique vient de
  // `item.final_status` (props), mais attendre le prochain chargement du fil
  // pour voir le tampon apparaître, après un tap sur Réalisé/Manqué, serait
  // trop lent. `null` tant que l'auteur n'a rien affirmé pendant cette
  // session — la valeur posée en base fait foi dès le rechargement suivant.
  const [localVerdict, setLocalVerdict] = useState<'realized' | 'missed' | null>(null);
  const [verdictPending, setVerdictPending] = useState(false);
  const [verdictError, setVerdictError] = useState<string | null>(null);
  // Lequel des deux boutons a été touché — affiche l'étape « photo-preuve
  // (facultative) » avant d'envoyer réellement le verdict, `null` tant que
  // l'auteur n'a rien touché ou vient d'annuler cette étape.
  const [pendingVerdictChoice, setPendingVerdictChoice] = useState<'realized' | 'missed' | null>(null);
  const [verdictPhotoUri, setVerdictPhotoUri] = useState<string | null>(null);
  // Écho optimiste du chemin renvoyé par `handleSetVerdict`, affiché tout de
  // suite sans attendre le prochain chargement du fil.
  const [localVerdictPhotoPath, setLocalVerdictPhotoPath] = useState<string | null>(null);
  const verdictPhotoPath = localVerdictPhotoPath ?? item.verdict_photo_path;
  // Écho optimiste de `revealPredictionNow` : une fois l'appel réussi, la
  // carte doit basculer en « En cours » sans attendre le prochain
  // chargement du fil, où `item.reveal_at` (encore dans le futur côté props)
  // continuerait sinon de la montrer scellée.
  const [localRevealed, setLocalRevealed] = useState(false);
  const [revealPending, setRevealPending] = useState(false);
  const [revealError, setRevealError] = useState<string | null>(null);
  const revealed = localRevealed || isRevealed(item, now);
  const isAuthor = item.author_id === userId;

  // Largeur réelle de l'enveloppe, mesurée une fois au rendu : toutes les
  // cotes des maquettes sont des fractions de cette largeur (voir
  // `components/EnvelopeArt.tsx`), donc cette seule mesure suffit à poser
  // toute la forme aux bonnes proportions sur n'importe quel écran.
  const [envelopeWidth, setEnvelopeWidth] = useState(0);
  const env = useMemo(() => {
    const W = envelopeWidth;
    const H = W / ENVELOPE_RATIO;
    const letterW = W * LETTER_WIDTH;
    const letterH = H * LETTER_HEIGHT;
    // Hauteur du rabat ouvert, de sa pointe jusqu'au haut du corps.
    const flapH = H * FLAP_DEPTH;
    // De combien la pointe du rabat dépasse au-dessus du haut de la lettre.
    const flapPeek = flapH - H * LETTER_RISE;
    // Du bas de la lettre jusqu'au bas du corps de l'enveloppe.
    const bodyTail = H - letterH + H * LETTER_RISE;
    const badge = W * BADGE_SIZE;
    return {
      envH: H,
      badge,
      badgeTop: H * BADGE_CENTER - badge / 2,
      // Bas du sceau : c'est là que commence le teaser, pour qu'il s'écrive
      // sur le corps de l'enveloppe et non en travers du rabat.
      badgeBottom: H * BADGE_CENTER + badge / 2,
      flapH,
      flapPeek,
      bodyTail,
      letterW,
      letterH,
      letterRadius: letterW * LETTER_RADIUS,
      // Le liseré vaut 0,29 % de la largeur de la lettre sur la maquette, soit
      // moins d'un point sur un écran de téléphone : plancher à 1 pour qu'il
      // ne disparaisse jamais complètement.
      letterBorder: Math.max(1, letterW * LETTER_BORDER),
    };
  }, [envelopeWidth]);

  const verdict = localVerdict ?? (revealed && item.final_status !== 'pending' ? item.final_status : null);

  // Verrou posé seulement au premier vrai tick de l'animation (pas à la
  // programmation du premier `requestAnimationFrame`) : en développement,
  // React invoque un effet une fois « pour de faux » puis le nettoie avant
  // même la prochaine frame — verrouiller trop tôt éteindrait l'animation
  // avant qu'elle n'ait joué une seule frame.
  const hasAnimatedGlowRef = useRef(false);
  // 0 = état neutre (glow standard) ; 1 = pic d'intensité pendant une
  // pulsation. Piloté par `requestAnimationFrame` plutôt que par `Animated` :
  // `shadowOpacity`/`shadowRadius` se combinent en un seul `box-shadow` CSS
  // sur le web, une composition que `Animated` ne recalcule pas à chaque
  // frame — seul un nombre simple, posé via `useState`, s'y reflète correctement.
  const [glowIntensity, setGlowIntensity] = useState(0);
  const glowShadowOpacity = 0.45 + glowIntensity * (0.75 - 0.45);
  const glowShadowRadius = 12 + glowIntensity * (20 - 12);

  const isQuestion = item.type === 'question';

  /** Trois états de l'enveloppe (voir `EnvelopeFlap`/`WaxSeal`/`VerdictStamp`
   * ci-dessus) : Scellée (sealed), Ouverte (tous les autres) — Réalisé/
   * Manqué s'y distinguent par le tampon, jamais par une couleur de contour.
   * `label` reste le petit repère textuel au-dessus de l'enveloppe (état
   * d'attente ou type Question) — absent pour Réalisé/Manqué, où le tampon
   * porte seul la réponse.
   *
   * Une Question n'entre jamais dans la machine à états Scellé → Réalisé/
   * Manqué : c'est un objet différent, qui répond « j'ai posé/répondu à une
   * question » plutôt que « j'ai affirmé un secret ». Une fois close, le
   * même repère (le pourcentage de bonnes réponses) s'affiche pour tout le
   * monde — y compris pour l'auteur d'une réponse correcte : pas de mention
   * personnelle distincte, jamais de « toi tu as eu juste » séparé. */
  // `correct_answer_count` ne reflète que les réponses déjà validées par
  // l'auteur, jamais une estimation sur celles encore en attente de verdict.
  const correctAnswerPercent =
    item.answer_count > 0 ? Math.round((item.correct_answer_count / item.answer_count) * 100) : null;

  const cardState: {
    kind: 'sealed' | 'active' | 'realized' | 'missed' | 'question_open' | 'question_closed';
    label?: string;
  } = isQuestion
    ? revealed
      ? {
          kind: 'question_closed',
          label: correctAnswerPercent !== null ? `${correctAnswerPercent} % ONT EU RAISON` : 'SONDAGE · CLÔTURÉE',
        }
      : { kind: 'question_open', label: 'PREDICT PUBLIC' }
    : !revealed
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

  /** Renforcement visuel du passage à Réalisé : deux pulsations du glow
   * (0,75 s chacune, 1,5 s au total), jouées une seule fois par utilisateur
   * — auteur compris — puis jamais rejouées, y compris après un rechargement
   * (persistance via `verdict_seen`, voir lib/predictions.ts). */
  useEffect(() => {
    if (cardState.kind !== 'realized' || item.is_verdict_seen || hasAnimatedGlowRef.current) return;
    let cancelled = false;
    let frameId: ReturnType<typeof requestAnimationFrame> | undefined;
    const start = Date.now();
    const tick = () => {
      if (cancelled) return;
      // Posé ici, à la première frame qui joue réellement — jamais avant de
      // programmer la frame — pour ne pas verrouiller une animation que
      // React aurait immédiatement nettoyée sans qu'elle n'ait rien joué.
      if (!hasAnimatedGlowRef.current) {
        hasAnimatedGlowRef.current = true;
        setPredictionUserState(item.id, userId, { verdictSeen: true });
      }
      const elapsed = Date.now() - start;
      if (elapsed >= GLOW_PULSE_TOTAL_MS) {
        setGlowIntensity(0);
        return;
      }
      const cyclePos = elapsed % GLOW_PULSE_CYCLE_MS;
      const half = GLOW_PULSE_CYCLE_MS / 2;
      const rising = cyclePos < half;
      const localT = (rising ? cyclePos : cyclePos - half) / half;
      const eased = easeInOutQuad(localT);
      setGlowIntensity(rising ? eased : 1 - eased);
      frameId = requestAnimationFrame(tick);
    };
    frameId = requestAnimationFrame(tick);
    return () => {
      cancelled = true;
      if (frameId !== undefined) cancelAnimationFrame(frameId);
    };
  }, [cardState.kind, item.id, item.is_verdict_seen, userId]);

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

  /** Réservée à l'auteur d'une carte encore Scellée — rend visible qu'un
   * Predict attend sa révélation plutôt que de laisser deviner s'il y a
   * simplement une date programmée. Irréversible (la RLS de
   * `reveal_prediction_now` refuse tout appel une fois déjà révélée), donc
   * confirmée avant d'agir, comme la suppression. */
  function handleRevealNow() {
    const message =
      'Le contenu deviendra visible pour tes destinataires et le verdict pourra être donné. Cette action est irréversible.';

    const run = async () => {
      setRevealError(null);
      setRevealPending(true);
      const { error } = await revealPredictionNow(item.id);
      setRevealPending(false);
      if (error) {
        setRevealError('Révélation impossible.');
        return;
      }
      setLocalRevealed(true);
    };

    if (Platform.OS === 'web') {
      if (window.confirm(`Révéler ce Predict maintenant ?\n\n${message}`)) run();
      return;
    }
    Alert.alert('Révéler ce Predict maintenant ?', message, [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Révéler', style: 'destructive', onPress: run },
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

  /** Envoie d'abord la photo-preuve éventuelle (son propre bucket, voir
   * lib/photos.ts), puis pose le verdict avec son chemin dans le même geste
   * — jamais les deux dans des appels indépendants, pour ne jamais afficher
   * un verdict sans sa preuve si l'envoi de la photo échoue en cours de
   * route. */
  async function handleSetVerdict(next: 'realized' | 'missed') {
    setVerdictPending(true);
    setVerdictError(null);
    setLocalVerdict(next);

    let photoPath: string | null = null;
    if (verdictPhotoUri) {
      const { path, error: uploadError } = await uploadVerdictPhoto(item.id, verdictPhotoUri);
      if (uploadError || !path) {
        setVerdictPending(false);
        setLocalVerdict(null);
        setVerdictError('Envoi de la photo impossible.');
        return;
      }
      photoPath = path;
    }

    const { error } = await setPredictionVerdict(item.id, next, photoPath);
    setVerdictPending(false);
    if (error) {
      setLocalVerdict(null);
      setVerdictError('Action impossible.');
      return;
    }
    if (photoPath) setLocalVerdictPhotoPath(photoPath);
    setPendingVerdictChoice(null);
    setVerdictPhotoUri(null);
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

  /* Les boutons d'action. Rendus une seule fois ici puis placés selon
     l'état : sur l'enveloppe elle-même quand elle est Scellée (elle porte
     alors tout, il n'y a plus de bandeau sous elle), sous la carte sinon. */
  /* Fil épuré façon réseau social : les deux interactions sociales, alignées
     à gauche. Le chiffre s'affiche toujours (y compris à zéro), pas seulement
     dès la première interaction. */
  const actionsRow = (
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

            {/* Propre à une Question : compteur de réponses, visible même avant
                Clôture — jamais leur contenu. Répondre se fait juste au-dessus,
                directement sur la carte (`InlineQuestionAnswer`). */}
            {isQuestion && (
              <View style={styles.answersRow}>
                <View style={styles.iconSlot}>
                  <Users
                    size={18}
                    color={item.answer_count > 0 ? colors.text : colors.footerIconInactive}
                    strokeWidth={1.75}
                  />
                </View>
                <Text style={[styles.answersCountText, item.answer_count === 0 && styles.footerCountInactive]}>
                  {item.answer_count}
                </Text>
              </View>
            )}

          </View>
  );

  /* Le bloc commun aux deux enveloppes, posé au même endroit sur l'une comme
     sur l'autre (voir la maquette d'écran) : l'auteur et le menu de gestion
     sur une ligne, le teaser dessous, puis les boutons d'action à gauche et la
     date de révélation à droite sur une dernière ligne. Sur une carte Scellée
     il vient sous le badge, sur une carte ouverte sous la lettre. */
  const envelopeFooter = (
    <View style={styles.envFooter}>
      <View style={styles.envAuthorRow}>
        {authorLabel && (
          <Pressable
            onPress={() => authorId && router.push(`/profile/${authorId}`)}
            style={styles.authorBlock}
            hitSlop={4}
          >
            <Avatar url={authorAvatarUrl} username={authorLabel} size={20} />
            <Text style={styles.envAuthorName} numberOfLines={1}>
              {authorLabel}
            </Text>
          </Pressable>
        )}
        <View style={styles.headerSpacer} />
        <Pressable onPress={() => setMenuOpen(true)} hitSlop={8} style={styles.headerMenuButton}>
          <MoreHorizontal size={18} color={colors.icon} strokeWidth={1.75} />
        </Pressable>
      </View>

      {mentionLabel && (
        <Text style={styles.envMentionTag} numberOfLines={1}>
          {mentionLabel}
        </Text>
      )}

      {!!item.teaser && <Text style={styles.envTeaser}>{item.teaser}</Text>}

      {/* Bouton « Révéler », réservé à l'auteur d'une carte encore Scellée —
          rend visible qu'un Predict attend sa révélation. */}
      {isAuthor && cardState.kind === 'sealed' && (
        <View style={styles.revealRow}>
          <Pressable
            onPress={handleRevealNow}
            disabled={revealPending}
            style={({ pressed }) => [styles.revealButton, pressed && styles.revealButtonPressed]}
          >
            <Text style={styles.revealButtonText}>{revealPending ? 'Révélation…' : 'Révéler'}</Text>
          </Pressable>
          {revealError && <Text style={styles.revealErrorText}>{revealError}</Text>}
        </View>
      )}

      <View style={styles.envBottomRow}>
        {actionsRow}
        {!revealed && (
          <Text style={styles.envRevealHint} numberOfLines={1}>
            Révélation : {item.open_ended ? 'libre' : formatCountdown(new Date(item.reveal_at), now)}
          </Text>
        )}
      </View>
    </View>
  );

  const showVerdictStamp = cardState.kind === 'realized' || cardState.kind === 'missed';

  return (
    <View
      style={[
        styles.card,
        unseen && styles.cardUnseen,
        cardState.kind === 'realized' && {
          boxShadow: [
            { offsetX: 0, offsetY: 0, color: hexToRgba(colors.accent, glowShadowOpacity), blurRadius: glowShadowRadius },
          ],
        },
      ]}
    >
      {/* L'enveloppe. Deux dessins, repris au pixel près des maquettes :
          Scellée = `predict scellé.png` (rectangle + rabat pointe en bas +
          badge doré) ; tous les autres états, Sondage compris =
          `predict révélée.png` (même enveloppe, rabat retourné pointe en
          haut, lettre par-dessus). Toutes les cotes sont dans
          `components/EnvelopeArt.tsx`. S'assourdit légèrement une fois
          Manquée, jamais l'étiquette d'état. */}
      <View style={cardState.kind === 'missed' && styles.cardBodyMissed}>
        <Pressable
          onPress={() => onPress?.()}
          style={styles.envelope}
          onLayout={(e) => setEnvelopeWidth(e.nativeEvent.layout.width)}
        >
          {cardState.kind === 'sealed' ? (
            /* `predict scellé.png` : le rectangle, le rabat pointe en bas, le
               badge sur sa pointe — puis le bloc commun juste sous le badge.
               `minHeight` plutôt qu'une hauteur fixe : la carte garde le ratio
               exact de la maquette, mais un teaser long l'allonge au lieu
               d'être tronqué. */
            <View style={[styles.envelopeShell, { minHeight: env.envH, backgroundColor: WASH.sealedBody }]}>
              <View style={styles.sealedFlapLayer} pointerEvents="none">
                <FlapDown height={env.flapH} />
              </View>
              <View
                style={[styles.sealedBadge, { top: env.badgeTop, marginLeft: -env.badge / 2 }]}
                pointerEvents="none"
              >
                {envelopeWidth > 0 && <PredictBadge glyph="P" size={env.badge} />}
              </View>

              {/* Cale le bloc commun au bas du badge : tout ce qui suit est
                  dans le flux, donc l'enveloppe s'allonge s'il déborde. */}
              <View style={{ height: env.badgeBottom }} pointerEvents="none" />
              {envelopeFooter}
            </View>
          ) : (
            <View style={[styles.envelopeShell, { paddingTop: env.flapPeek }]}>
              {/* Les deux couches de lavis, derrière la lettre : le rabat
                  ouvert occupe le haut (ses deux bords obliques restent
                  visibles de part et d'autre de la lettre), le corps prend
                  tout le reste jusqu'en bas. */}
              <View style={[styles.openFlapLayer, { height: env.flapH }]} pointerEvents="none">
                <FlapUp height={env.flapH} />
              </View>
              <View style={[styles.openBodyLayer, { top: env.flapH }]} pointerEvents="none" />

              {/* La photo jointe est elle-même la seconde page, glissée
                  derrière la lettre et légèrement de biais, comme une carte
                  qu'on aurait mal remise dans le paquet : ce qui dépasse
                  laisse voir l'image, et un appui dessus l'ouvre en grand.
                  Rendue avant la lettre pour passer dessous. */}
              {item.photo_path && (
                <Pressable
                  onPress={() => setPhotoOpen(true)}
                  style={[
                    styles.secondPage,
                    {
                      // Calée sur la lettre (qui commence sous la pointe du
                      // rabat), puis décalée pour dépasser à droite et en bas.
                      top: env.flapPeek + PAGE_PEEK,
                      marginLeft: PAGE_PEEK,
                      width: env.letterW,
                      height: env.letterH,
                      borderRadius: env.letterRadius,
                      borderWidth: env.letterBorder,
                      borderColor: colors.accent,
                    },
                  ]}
                >
                  <PredictionPhoto bucket="content" path={item.photo_path} fill />
                </Pressable>
              )}

              <View
                style={[
                  styles.letter,
                  {
                    width: env.letterW,
                    minHeight: env.letterH,
                    borderRadius: env.letterRadius,
                    borderWidth: env.letterBorder,
                    borderColor: colors.accent,
                    backgroundColor: letterPaper(colors.surface),
                  },
                  showVerdictStamp && styles.letterWithStamp,
                  // Réserve la bande que la photo laisse dépasser sous la
                  // lettre : sans elle, le bloc auteur/teaser vient par-dessus
                  // et capte l'appui à la place de la photo.
                  item.photo_path ? { marginBottom: PAGE_PEEK } : null,
                ]}
              >
                {showVerdictStamp && <VerdictStamp verdict={cardState.kind as 'realized' | 'missed'} colors={colors} />}

                {/* La maquette montre un Sondage ouvert sans étiquette : on la
                    garde pour les seuls états qu'elle ne couvre pas, où elle
                    porte une information qu'on ne lit nulle part ailleurs
                    (« EN COURS », « xx % ont eu raison »). */}
                {cardState.label && cardState.kind !== 'question_open' && cardState.kind !== 'question_closed' && (
                  <Text style={styles.letterStateLabel} numberOfLines={1}>
                    {cardState.label}
                  </Text>
                )}

              {isQuestion ? (
                /* Pas de Teaser pour une Question : `content` (la question
                   elle-même) est visible dès la création, jamais flouté — ce
                   que la Clôture cache, ce sont les réponses des autres. */
                <>
                  <Text style={styles.letterQuestionText}>{item.content}</Text>
                  {/* Le résultat, une fois le Sondage clos : même police et
                      même couleur que la question, seulement en gras — pas une
                      étiquette à part. */}
                  {cardState.kind === 'question_closed' && correctAnswerPercent !== null && (
                    <Text style={[styles.letterQuestionText, styles.letterQuestionResult]}>
                      {correctAnswerPercent} %
                    </Text>
                  )}
                </>
              ) : (
                /* La RLS ne renvoie `content` que si révélée ou si on en est
                   l'auteur — l'auteur voit donc toujours son propre texte en
                   clair. Sans lui (destinataire), `SEALED_CONTENT_PLACEHOLDER`
                   prend la même place, flouté : jamais du vrai texte, juste sa
                   silhouette. */
                <Text style={[styles.letterContent, !item.content && styles.letterContentBlurred]}>
                  {item.content ?? SEALED_CONTENT_PLACEHOLDER}
                </Text>
              )}

              {/* Répondre sans quitter le Fil — dans la lettre, et réservé à
                  un Sondage encore ouvert : plus rien à répondre une fois clos,
                  l'écran détail prend le relais. Texte libre comme choix
                  multiple, `InlineQuestionAnswer` gère les deux. */}
              {isQuestion && !revealed && <InlineQuestionAnswer prediction={item} />}
                    </View>

              {envelopeFooter}
            </View>
          )}

          {/* Photo-preuve du verdict — sous la lettre, jamais dedans : elle
              documente le dénouement (Réalisé/Manqué), pas le secret
              initial. */}
          {verdictPhotoPath && showVerdictStamp && (
            <View style={styles.verdictPhotoWrap}>
              <PredictionPhoto bucket="verdict" path={verdictPhotoPath} />
            </View>
          )}
        </Pressable>

        {/* Invite l'auteur à trancher dès que sa prédiction est révélée mais
            encore en attente de verdict — Réalisé en accent plein, Manqué en
            contour neutre, même registre que le tampon, jamais de
            vert/rouge. Touché, un bouton ouvre une étape intermédiaire
            (photo-preuve facultative) plutôt que d'envoyer le verdict tout de
            suite : une fois confirmé, revenir dessus n'est plus possible ici,
            seulement depuis l'écran détail. */}
        {!isQuestion && isAuthor && revealed && verdict === null && (
          <View style={styles.verdictPrompt}>
            {pendingVerdictChoice === null ? (
              <View style={styles.verdictPromptButtons}>
                <Pressable
                  onPress={() => setPendingVerdictChoice('realized')}
                  disabled={verdictPending}
                  style={[styles.verdictPromptButton, styles.verdictPromptButtonRealized]}
                >
                  <Text style={styles.verdictPromptButtonTextOnAccent}>Réalisé</Text>
                </Pressable>
                <Pressable
                  onPress={() => setPendingVerdictChoice('missed')}
                  disabled={verdictPending}
                  style={[styles.verdictPromptButton, styles.verdictPromptButtonMissed]}
                >
                  <Text style={styles.verdictPromptButtonText}>Manqué</Text>
                </Pressable>
              </View>
            ) : (
              <View style={styles.verdictPhotoStep}>
                <Text style={styles.verdictPhotoStepLabel}>
                  Une preuve visuelle ? (facultatif)
                </Text>
                <PhotoAttachButton
                  uri={verdictPhotoUri}
                  onChange={setVerdictPhotoUri}
                  disabled={verdictPending}
                  label="Joindre une photo"
                />
                <View style={styles.verdictPromptButtons}>
                  <Pressable
                    onPress={() => {
                      setPendingVerdictChoice(null);
                      setVerdictPhotoUri(null);
                    }}
                    disabled={verdictPending}
                    style={[styles.verdictPromptButton, styles.verdictPromptButtonMissed]}
                  >
                    <Text style={styles.verdictPromptButtonText}>Annuler</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => handleSetVerdict(pendingVerdictChoice)}
                    disabled={verdictPending}
                    style={[
                      styles.verdictPromptButton,
                      pendingVerdictChoice === 'realized'
                        ? styles.verdictPromptButtonRealized
                        : styles.verdictPromptButtonMissed,
                    ]}
                  >
                    <Text
                      style={
                        pendingVerdictChoice === 'realized'
                          ? styles.verdictPromptButtonTextOnAccent
                          : styles.verdictPromptButtonText
                      }
                    >
                      {verdictPending ? 'Confirmation…' : 'Confirmer'}
                    </Text>
                  </Pressable>
                </View>
              </View>
            )}
            {verdictError && <Text style={styles.verdictPromptError}>{verdictError}</Text>}
          </View>
        )}

        {/* Répondre sans quitter le Fil — réservé à une Question encore
            ouverte : plus rien à répondre une fois close, l'écran détail
            prend le relais (liste des réponses, validation). */}

      </View>

      {commentsOpen && (
        <View style={styles.commentsWrap}>
          <InlineComments
            predictionId={item.id}
            userId={userId}
            truncate
            revealed={revealed}
            isPredictionAuthor={isAuthor}
          />
        </View>
      )}

      {/* Menu de gestion (favoris / masquer / supprimer) — ouvert depuis le
          bouton ••• de l'en-tête. */}
      <Modal visible={menuOpen} transparent animationType="fade" onRequestClose={() => setMenuOpen(false)}>
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
                color={isFavorite ? colors.accent : colors.icon}
                fill={isFavorite ? colors.accent : 'none'}
                strokeWidth={1.75}
              />
              <Text style={styles.cardMenuRowText}>{isFavorite ? 'Retirer des favoris' : 'Ajouter aux favoris'}</Text>
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

      {/* La seconde page, ouverte en grand — un appui n'importe où referme. */}
      {item.photo_path && (
        <Modal visible={photoOpen} transparent animationType="fade" onRequestClose={() => setPhotoOpen(false)}>
          <Pressable style={styles.photoOverlay} onPress={() => setPhotoOpen(false)}>
            <View style={styles.photoOverlayInner}>
              <PredictionPhoto bucket="content" path={item.photo_path} />
            </View>
          </Pressable>
        </Modal>
      )}

      <Modal visible={reactorsOpen} transparent animationType="fade" onRequestClose={() => setReactorsOpen(false)}>
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

const stampStyles = StyleSheet.create({
  stamp: {
    position: 'absolute',
    top: -14,
    right: -6,
    borderWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
    transform: [{ rotate: '-14deg' }],
    opacity: 0.92,
    zIndex: 3,
  },
  // Réalisé : rond, comme un vrai cachet de cire. Manqué : rectangulaire —
  // une silhouette différente pour que les deux tampons se distinguent au
  // premier coup d'œil, jamais seulement par la couleur.
  stampRealized: { width: 72, height: 72, borderRadius: 999 },
  stampMissed: { width: 88, height: 48, borderRadius: 4 },
  stampText: {
    fontFamily: fonts.sansBold,
    fontSize: 11,
    letterSpacing: 0.4,
    textAlign: 'center',
    lineHeight: 13,
  },
});

function createStyles(colors: Colors) {
  return StyleSheet.create({
  cardPressed: { opacity: 0.85 },
  // Papier, fine bordure encre à faible opacité — l'enveloppe (rabat + cachet
  // ou lettre) porte tout le langage visuel de statut, plus aucun contour de
  // couleur par état.
  card: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.card,
    marginBottom: 18,
    backgroundColor: colors.surface,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.1,
    shadowRadius: 14,
    elevation: 3,
    // Web uniquement : sans ça, glisser le pouce vers un emoji du panneau
    // sélectionne le texte de la carte au passage, ce qui coupe le geste
    // (`onPanResponderTerminate`) au lieu de faire glisser la sélection
    // d'emoji comme sur Facebook.
    ...(Platform.OS === 'web' ? { userSelect: 'none' } : null),
  },
  // Non lue : liseré d'accent + fond très légèrement teinté, assez discret
  // pour ne pas jurer avec le reste de la charte parchemin/bordeaux.
  cardUnseen: {
    borderColor: colors.accent,
    backgroundColor: colors.accentSoft,
  },
  sealedFlapLayer: { position: 'absolute', left: 0, right: 0, top: 0 },
  // L'enveloppe est la carte : tout tient dedans, plus rien ne vit sous elle.
  envelopeShell: { paddingHorizontal: 16, paddingBottom: 12 },
  // Le bloc commun aux deux enveloppes — même disposition sur l'une et l'autre.
  envFooter: { marginTop: 8 },
  envAuthorRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  envAuthorName: { fontFamily: fonts.sansBold, fontSize: 13, color: colors.text, flexShrink: 1, minWidth: 0 },
  envMentionTag: { fontSize: 11, color: colors.textMuted, marginTop: 2 },
  envTeaser: { fontFamily: fonts.serifItalic, fontSize: 12, lineHeight: 17, color: colors.textMuted, marginTop: 2 },
  // Dernière ligne : boutons d'action à gauche, date de révélation à droite.
  envBottomRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  envRevealHint: { fontFamily: fonts.label, fontSize: 11, color: colors.textMuted, flexShrink: 1 },
  sealedBadge: { position: 'absolute', left: '50%', zIndex: 2 },
  // Corps de carte assourdi une fois Manquée — jamais le badge d'état,
  // rendu séparément avant ce conteneur et donc toujours à `opacity: 1`.
  cardBodyMissed: { opacity: 0.85 },
  // L'enveloppe : `position: relative` pour que le badge et les couches de
  // lavis (absolus) se positionnent par rapport à ce conteneur, pas par
  // rapport à toute la carte.
  envelope: { position: 'relative' },
  // Le rabat ouvert, tout en haut : sa pointe dépasse au-dessus de la lettre,
  // ses deux bords obliques restent visibles de part et d'autre.
  openFlapLayer: { position: 'absolute', left: 0, right: 0, top: 0 },
  // Le corps de l'enveloppe, derrière la lettre — du bas du rabat jusqu'en
  // bas : il s'étire tout seul si le contenu rend la lettre plus haute que sur
  // la maquette.
  openBodyLayer: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: WASH.openBody },
  // La lettre. Largeur, hauteur minimale, rayon et liseré sont posés au rendu
  // à partir de la largeur mesurée (voir `env` plus haut) : ce sont des
  // fractions relevées sur la maquette, pas des pixels fixes.
  letter: {
    alignSelf: 'center',
    padding: 14,
    gap: 6,
    zIndex: 2,
  },
  // Réserve la place du tampon par un padding interne plutôt qu'une marge
  // externe : une marge asymétrique (seulement à droite) décentrait toute la
  // boîte de la lettre par rapport aux autres cartes — ici, la boîte garde
  // exactement la même largeur et le même centrage partout, seul le texte
  // recule pour ne jamais passer sous le tampon.
  letterWithStamp: { paddingRight: 60 },
  letterStateLabel: {
    fontFamily: fonts.label,
    fontSize: 11,
    letterSpacing: 1.1,
    textTransform: 'uppercase',
    color: letterInk(colors.surface).soft,
    marginBottom: 2,
  },
  letterQuestionText: {
    fontFamily: fonts.serifItalic,
    fontSize: 14,
    lineHeight: 20,
    color: letterInk(colors.surface).soft,
    marginTop: 4,
    textAlign: 'center',
  },
  // La vraie prédiction est le cœur de la lettre : Spectral, semi-gras, bien
  // plus grande que le reste de l'interface — nette dès qu'elle est lisible
  // (`letterContentBlurred` la couvre d'un flou tant que ce n'est pas le cas).
  letterContent: {
    fontFamily: fonts.bodyEmphasis,
    fontSize: 16,
    lineHeight: 22,
    color: letterInk(colors.surface).strong,
    marginTop: 4,
    textAlign: 'center',
  },
  letterContentBlurred: Platform.select({
    web: { filter: 'blur(5px)' } as object,
    default: { opacity: 0.15 },
  }),
  // Le résultat d'un Sondage clos : la même ligne que la question, en gras.
  letterQuestionResult: { fontFamily: fonts.sansBold, fontStyle: 'normal', marginTop: 6 },
  // La photo jointe, glissée derrière la lettre comme une seconde page : même
  // papier, même liseré, décalée pour que seuls son bord droit et son bord bas
  // dépassent. Posée avant la lettre dans le rendu, donc dessous.
  // `overflow: 'hidden'` pour que la photo épouse l'arrondi de la feuille, et
  // une légère rotation pour l'effet « carte mal rangée ».
  secondPage: {
    position: 'absolute',
    alignSelf: 'center',
    overflow: 'hidden',
    transform: [{ rotate: `${PAGE_TILT}deg` }],
    // Au-dessus du bloc auteur/teaser (qui vient après elle dans le rendu),
    // mais sous la lettre — voir `letter`, qui monte d'un cran de plus.
    zIndex: 1,
  },
  // Photo ouverte en grand, par-dessus tout l'écran.
  photoOverlay: {
    flex: 1,
    backgroundColor: 'rgba(28, 39, 55, 0.95)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  photoOverlayInner: { width: '100%' },
  // Même padding horizontal que `body` — sans lui, les commentaires
  // s'alignaient pile sur le bord de la carte, trop près de la bordure.
  commentsWrap: { paddingHorizontal: 18 },
  headerSpacer: { flex: 1, minWidth: 8 },
  headerMenuButton: { padding: 2 },
  // `flexShrink` sur le bloc auteur ET sur le pseudo : c'est le pseudo qui se
  // tronque avec ellipse si la place manque.
  authorBlock: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1, minWidth: 0 },
  authorName: { fontFamily: fonts.bodyEmphasis, fontSize: 16, color: colors.text, flexShrink: 1, minWidth: 0 },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  // Bouton « Révéler », sous l'enveloppe Scellée — contour fin, pas un aplat,
  // même registre que le bouton Manqué proposé plus bas.
  revealRow: { alignItems: 'flex-end', marginTop: 8 },
  revealButton: {
    borderWidth: 1,
    borderColor: colors.accent,
    borderRadius: radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: colors.accentSoft,
  },
  revealButtonPressed: { opacity: 0.7 },
  revealButtonText: { fontFamily: fonts.label, fontSize: 12, fontWeight: '700', color: colors.accent },
  revealErrorText: { fontSize: 11, color: colors.danger, marginTop: 6, textAlign: 'right' },
  // Invite l'auteur à trancher — rien que les deux boutons, alignés à droite.
  // Réalisé en accent plein (comme le bouton « Sceller »), Manqué en contour
  // neutre — le choix à trancher doit rester net, sans code couleur vert/rouge.
  verdictPrompt: { paddingHorizontal: 18, marginTop: 10 },
  verdictPromptButtons: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8 },
  verdictPromptButton: {
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  verdictPromptButtonRealized: {
    borderColor: colors.accent,
    backgroundColor: colors.accent,
  },
  verdictPromptButtonMissed: {
    borderColor: colors.border,
    backgroundColor: 'transparent',
  },
  verdictPromptButtonText: { fontFamily: fonts.label, fontSize: 12, fontWeight: '700', color: colors.text },
  verdictPromptButtonTextOnAccent: { fontFamily: fonts.label, fontSize: 12, fontWeight: '700', color: colors.textOnAccent },
  verdictPromptError: { fontSize: 11, color: colors.danger, marginTop: 6, textAlign: 'right' },
  // Étape 2 du verdict : preuve photo facultative, avant confirmation.
  // `alignItems` par défaut (stretch) : `PhotoAttachButton` a besoin de la
  // pleine largeur pour que son aperçu (width: '100%') ait une base non nulle.
  verdictPhotoStep: { gap: 8 },
  verdictPhotoStepLabel: { fontSize: 12, color: colors.textMuted },
  // Photo-preuve du verdict — sous la lettre, même padding horizontal que le corps.
  verdictPhotoWrap: { paddingHorizontal: 18, marginTop: 10 },
  // Fil épuré façon réseau social : les deux blocs restants (commentaire,
  // réaction) packés à gauche avec un espacement modeste.
  // Dans l'enveloppe : c'est elle qui porte les marges, le pied n'ajoute que
  // l'espace vertical qui le sépare du teaser.
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: 18,
    paddingTop: 8,
  },
  // Boîte identique (taille + centrage) pour les icônes du pied de carte.
  iconSlot: { width: 22, height: 22, alignItems: 'center', justifyContent: 'center' },
  commentsToggle: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  // Toujours affiché, y compris à zéro — encre dès qu'il y a au moins une
  // interaction, teinte discrète sinon (voir `footerCountInactive`).
  commentsToggleText: { fontSize: 13, fontWeight: '700', color: colors.text },
  reactionTriggerWrap: { position: 'relative' },
  reactionTriggerRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  reactionTrigger: { flexDirection: 'row', alignItems: 'center' },
  reactionTriggerEmoji: { fontSize: 17 },
  reactionTriggerCount: { fontSize: 13, fontWeight: '700', color: colors.text },
  footerCountInactive: { color: colors.footerIconInactive },
  answersRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  answersCountText: { fontSize: 13, fontWeight: '700', color: colors.text },
  // Une seule « grande bulle », façon Facebook — flottante au-dessus du
  // pouce (pas en dessous) pour ne pas être masquée par le doigt qui la
  // fait glisser, et pas des puces séparées.
  // 12 réactions ne tiennent pas sur une seule rangée : `flexWrap` bascule
  // sur 2 rangées de `EMOJI_COLUMNS`, un rectangle arrondi plutôt qu'une
  // pilule (qui n'a de sens que sur une seule ligne).
  emojiPanel: {
    position: 'absolute',
    bottom: '100%',
    // Ancrage fixe plutôt que centré sur le pouce : le pouce est près du bord
    // gauche de la carte (après l'icône commentaire), donc un centrage exact
    // poussait la bulle hors de l'écran à gauche. Un léger débord vers la
    // gauche seulement (jamais négatif à l'échelle de l'écran, le pouce a
    // toujours cette marge devant lui).
    left: -40,
    marginBottom: 10,
    width: EMOJI_PANEL_WIDTH,
    zIndex: 20,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    rowGap: 6,
    backgroundColor: colors.surfaceRaised,
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
  emojiBubbleItemActive: { backgroundColor: colors.accentSoft },
  emojiButtonText: { fontSize: 20 },
  // Menu ••• de gestion (favoris / masquer / supprimer), ouvert depuis
  // l'en-tête — même registre visuel que `reactorsBox` (boîte centrée sur
  // fond assombri).
  cardMenuBox: {
    width: '100%',
    maxWidth: 260,
    borderRadius: 16,
    backgroundColor: colors.surfaceRaised,
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
    backgroundColor: colors.surfaceRaised,
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
}
