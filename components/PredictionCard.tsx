import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import {
  CheckCircle2,
  Eye,
  EyeOff,
  HelpCircle,
  Lock,
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
import Svg, { Polygon, Polyline, Rect } from 'react-native-svg';
import { Text } from './Text';

import { fetchCommentCount } from '../lib/comments';
import { formatCountdown } from '../lib/datetime';
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
import { fonts, radius, wax, type Colors } from '../lib/theme';
import { useColors } from '../lib/themeMode';
import { Avatar } from './Avatar';
import { InlineComments } from './InlineComments';
import { InlineQuestionAnswer } from './InlineQuestionAnswer';

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

/** Hauteur du bandeau de rabat, en haut de l'enveloppe — fixe plutôt qu'un
 * pourcentage de la hauteur de la carte (qui varie avec le contenu, contrai-
 * rement à la maquette) : assez pour lire un vrai rabat, jamais démesuré sur
 * une carte courte. */
const FLAP_HEIGHT = 52;
/** Décalage (négatif) de la lettre sous le bandeau de rabat — assez pour
 * qu'elle semble sortir de sous la pointe du rabat, jamais flottante. */
const LETTER_OVERLAP = 26;

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

/** Le rabat triangulaire, en haut de l'enveloppe — un polygone SVG plutôt
 * qu'un `clip-path` (non disponible sur natif) : `viewBox` non uniforme
 * (`preserveAspectRatio="none"`) pour rester nette à n'importe quelle largeur
 * de carte, sans mesurer quoi que ce soit. */
function EnvelopeFlap({ colors }: { colors: Colors }) {
  return (
    <Svg width="100%" height={FLAP_HEIGHT} viewBox={`0 0 100 ${FLAP_HEIGHT}`} preserveAspectRatio="none">
      {/* Fond plein et foncé sur tout le bandeau, jusque dans les deux coins
          hors du triangle — sans lui, ces coins laissaient voir le papier
          clair de la carte. Le triangle du rabat se pose dessus dans un ton
          nettement plus clair, un aplat plutôt qu'un dégradé qui finissait
          par se fondre avec le fond et effaçait la pointe. */}
      <Rect x="0" y="0" width="100" height={FLAP_HEIGHT} fill={colors.envelopeBody[1]} />
      <Polygon points={`0,0 100,0 50,${FLAP_HEIGHT}`} fill={colors.envelopeBody[0]} />
      {/* Le pli lui-même, tracé comme un vrai trait — la seule différence de
          teinte entre le fond et le triangle ne suffisait pas à se lire
          comme une enveloppe, il fallait la ligne. `vectorEffect` garde une
          épaisseur de trait constante malgré le `viewBox` étiré (X et Y
          n'ont pas la même échelle), sinon le trait s'épaississait sur les
          portions presque horizontales et s'amincissait sur les presque
          verticales. */}
      <Polyline
        points={`0,0 50,${FLAP_HEIGHT} 100,0`}
        fill="none"
        stroke={colors.accent}
        strokeWidth={1.5}
        vectorEffect="non-scaling-stroke"
      />
    </Svg>
  );
}

/** Le cachet de cire, posé pile sur la pointe du rabat — rond, monogramme
 * « P » en relief (deux `Text` superposés, l'un en ombre). Uniquement pour
 * une enveloppe Scellée : une fois ouverte, c'est la lettre qui occupe ce
 * même point. */
function WaxSeal({ size = 46 }: { size?: number }) {
  return (
    <View
      style={[
        styles_waxSealWrap,
        { width: size, height: size, top: FLAP_HEIGHT, marginLeft: -size / 2, marginTop: -size / 2 },
      ]}
    >
      <LinearGradient
        colors={wax}
        start={{ x: 0.28, y: 0.22 }}
        end={{ x: 0.85, y: 1 }}
        style={styles_waxSealBase}
      >
        <Text style={[styles_waxSealEmblem, styles_waxSealEmblemShadow, { fontSize: size * 0.42 }]}>P</Text>
        <Text style={[styles_waxSealEmblem, { fontSize: size * 0.42 }]}>P</Text>
      </LinearGradient>
    </View>
  );
}

const styles_waxSealWrap: object = { position: 'absolute', left: '50%', alignItems: 'center', justifyContent: 'center' };
const styles_waxSealBase: object = {
  width: '100%',
  height: '100%',
  borderRadius: 999,
  alignItems: 'center',
  justifyContent: 'center',
  shadowColor: '#000',
  shadowOffset: { width: 0, height: 3 },
  shadowOpacity: 0.4,
  shadowRadius: 5,
  elevation: 5,
};
const styles_waxSealEmblem: object = { fontFamily: fonts.display, color: 'rgba(255, 220, 205, 0.75)' };
const styles_waxSealEmblemShadow: object = {
  position: 'absolute',
  top: 1,
  left: 0.5,
  color: 'rgba(0, 0, 0, 0.5)',
};

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
  // Écho optimiste de `setPredictionVerdict` : le statut canonique vient de
  // `item.final_status` (props), mais attendre le prochain chargement du fil
  // pour voir le tampon apparaître, après un tap sur Réalisé/Manqué, serait
  // trop lent. `null` tant que l'auteur n'a rien affirmé pendant cette
  // session — la valeur posée en base fait foi dès le rechargement suivant.
  const [localVerdict, setLocalVerdict] = useState<'realized' | 'missed' | null>(null);
  const [verdictPending, setVerdictPending] = useState(false);
  const [verdictError, setVerdictError] = useState<string | null>(null);
  // Écho optimiste de `revealPredictionNow` : une fois l'appel réussi, la
  // carte doit basculer en « En cours » sans attendre le prochain
  // chargement du fil, où `item.reveal_at` (encore dans le futur côté props)
  // continuerait sinon de la montrer scellée.
  const [localRevealed, setLocalRevealed] = useState(false);
  const [revealPending, setRevealPending] = useState(false);
  const [revealError, setRevealError] = useState<string | null>(null);
  const revealed = localRevealed || isRevealed(item, now);
  const isAuthor = item.author_id === userId;

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
   * question » plutôt que « j'ai affirmé un secret » — sauf une fois sa
   * propre réponse validée correcte, où elle reprend le même accent que
   * Réalisé : le succès se lit pareil pour tout le monde. Ne dépend que du
   * point de vue de l'appelant (`my_answer_is_correct`) : une Question où
   * quelqu'un d'autre a deviné juste ne change pas pour moi. */
  // Une fois Close, remplace le simple repère « QUESTION · CLÔTURÉE » par le
  // pourcentage de bonnes réponses dès qu'il y en a au moins une à compter —
  // `correct_answer_count` ne reflète que celles déjà validées par l'auteur,
  // jamais une estimation sur les réponses encore en attente de verdict.
  const correctAnswerPercent =
    item.answer_count > 0 ? Math.round((item.correct_answer_count / item.answer_count) * 100) : null;

  const cardState: {
    kind: 'sealed' | 'active' | 'realized' | 'missed' | 'question_open' | 'question_closed' | 'question_correct';
    label?: string;
  } = isQuestion
    ? revealed
      ? item.my_answer_is_correct === true
        ? { kind: 'question_correct', label: 'QUESTION · RÉPONSE CORRECTE' }
        : {
            kind: 'question_closed',
            label: correctAnswerPercent !== null ? `${correctAnswerPercent} % ONT EU RAISON` : 'QUESTION · CLÔTURÉE',
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

  /** Geste unique et définitif — la RPC elle-même refuse un second appel une
   * fois le verdict posé (voir `set_prediction_verdict`), donc pas de retour
   * en arrière possible ici non plus si l'appel échoue en cours de route :
   * on efface simplement l'écho optimiste pour retenter. */
  async function handleSetVerdict(next: 'realized' | 'missed') {
    setVerdictPending(true);
    setVerdictError(null);
    setLocalVerdict(next);
    const { error } = await setPredictionVerdict(item.id, next);
    setVerdictPending(false);
    if (error) {
      setLocalVerdict(null);
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
      {/* L'enveloppe : rabat fixe en haut, puis soit le cachet (Scellée),
          soit la lettre qui en sort (tous les autres états) — même
          silhouette partout, voir `EnvelopeFlap`/`WaxSeal` en tête de
          fichier. S'assourdit légèrement une fois Manquée, jamais l'étiquette
          d'état ci-dessous. */}
      <View style={cardState.kind === 'missed' && styles.cardBodyMissed}>
        <View style={styles.envelope}>
          <EnvelopeFlap colors={colors} />

          {/* Posée en surimpression du rabat plutôt qu'au-dessus, dans une
              bande à part sur le papier clair de la carte — sans ça, un
              espace clair restait visible entre le haut de la carte et
              l'étiquette. Toujours dans la partie foncée, jamais au-dessus. */}
          {cardState.label && (
            <View style={styles.envelopeLabelOverlay}>
              <View style={styles.stateRow}>
                {cardState.kind === 'sealed' && <Lock size={12} color={colors.textOnAccent} strokeWidth={2} />}
                {(cardState.kind === 'question_open' || cardState.kind === 'question_closed') && (
                  <HelpCircle size={12} color={colors.textOnAccent} strokeWidth={2} />
                )}
                {cardState.kind === 'question_correct' && (
                  <CheckCircle2 size={12} color={colors.textOnAccent} strokeWidth={2} />
                )}
                <Text style={styles.stateLabel} numberOfLines={1}>
                  {cardState.label}
                </Text>
              </View>
            </View>
          )}

          {cardState.kind === 'sealed' && <WaxSeal />}

          {cardState.kind !== 'sealed' && (
            <View style={[styles.letter, showVerdictStamp && styles.letterWithStamp]}>
              {showVerdictStamp && <VerdictStamp verdict={cardState.kind as 'realized' | 'missed'} colors={colors} />}

              {isQuestion ? (
                <>
                  <View style={styles.letterHeaderRow}>
                    <Text style={styles.letterAuthor} numberOfLines={1}>
                      {(authorLabel ?? '').toUpperCase()} · À TOUS
                    </Text>
                    <View style={styles.letterCounter}>
                      <Text style={styles.letterCounterText}>{item.answer_count}</Text>
                    </View>
                  </View>
                  {/* Pas de Teaser pour une Question : `content` (la question
                      elle-même) est visible dès la création, jamais flouté —
                      ce que la Clôture cache, ce sont les réponses des
                      autres, pas la question. */}
                  <Text style={styles.letterQuestionText}>{item.content}</Text>
                </>
              ) : (
                <>
                  <Text style={styles.letterAuthor} numberOfLines={1}>
                    {(authorLabel ?? '').toUpperCase()}
                  </Text>
                  {/* La RLS ne renvoie `content` que si révélée ou si on en
                      est l'auteur — l'auteur voit donc toujours son propre
                      texte en clair, jamais flouté. Sans lui (destinataire),
                      `SEALED_CONTENT_PLACEHOLDER` prend la même place,
                      floutée : jamais du vrai texte, juste sa silhouette. */}
                  <Text style={[styles.letterContent, !item.content && styles.letterContentBlurred]}>
                    {item.content ?? SEALED_CONTENT_PLACEHOLDER}
                  </Text>
                </>
              )}
            </View>
          )}
        </View>

        {/* Sous l'enveloppe : bloc auteur, pseudos cités, teaser (Scellée
            uniquement — la vraie prédiction vit dans la lettre une fois
            ouverte), boutons d'action. */}
        <Pressable onPress={() => onPress?.()} style={({ pressed }) => [styles.body, pressed && styles.cardPressed]}>
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

          {/* Sur sa propre ligne, jamais accolée au pseudo — la liste
              complète des personnes citées y empiétait dès qu'il y en avait
              plusieurs. */}
          {mentionLabel && (
            <Text style={styles.mentionTag} numberOfLines={1}>
              {mentionLabel}
            </Text>
          )}

          {!isQuestion && cardState.kind === 'sealed' && <Text style={styles.cardTeaser}>{item.teaser}</Text>}

          {/* Réservé à une carte Scellée : le seul état où la date de
              révélation n'est pas encore connue de tous — en bas à droite de
              la carte, pas accolée à l'étiquette « SCELLÉ » tout en haut. */}
          {cardState.kind === 'sealed' && (
            <Text style={styles.revealHint} numberOfLines={1}>
              Révélation : {item.open_ended ? 'libre' : formatCountdown(new Date(item.reveal_at), now)}
            </Text>
          )}
        </Pressable>

        {/* Bouton « Révéler », réservé à l'auteur d'une carte encore Scellée
            — rend visible qu'un Predict attend sa révélation. */}
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

        {/* Invite l'auteur à trancher dès que sa prédiction est révélée mais
            encore en attente de verdict — rien que les deux boutons, aucun
            texte d'accompagnement : une fois posé, revenir dessus n'est plus
            possible ici, seulement depuis l'écran détail. Réalisé en accent
            plein, Manqué en contour neutre — même registre que le tampon,
            jamais de vert/rouge. */}
        {!isQuestion && isAuthor && revealed && verdict === null && (
          <View style={styles.verdictPrompt}>
            <View style={styles.verdictPromptButtons}>
              <Pressable
                onPress={() => handleSetVerdict('realized')}
                disabled={verdictPending}
                style={[styles.verdictPromptButton, styles.verdictPromptButtonRealized]}
              >
                <Text style={styles.verdictPromptButtonTextOnAccent}>Réalisé</Text>
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

        {/* Répondre sans quitter le Fil — réservé à une Question encore
            ouverte : plus rien à répondre une fois close, l'écran détail
            prend le relais (liste des réponses, validation). */}
        {isQuestion && !revealed && <InlineQuestionAnswer prediction={item} />}

        {/* Fil épuré façon réseau social : les deux interactions sociales,
            alignées à gauche. Le chiffre s'affiche toujours (y compris à
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
    marginBottom: 12,
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
  // Posé en surimpression du rabat (voir plus haut) — toujours dans sa
  // partie foncée, jamais dans une bande à part sur le papier clair.
  envelopeLabelOverlay: {
    position: 'absolute',
    top: 10,
    right: 14,
    alignItems: 'flex-end',
    gap: 2,
    zIndex: 2,
  },
  stateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  // Crème plutôt que l'encre habituelle : ce libellé se lit désormais sur le
  // rabat foncé, pas sur le papier clair — un seul ton suffit, il n'y a plus
  // besoin de distinguer un accent bordeaux dessus.
  stateLabel: {
    fontFamily: fonts.label,
    fontSize: 11,
    letterSpacing: 1.1,
    textTransform: 'uppercase',
    color: colors.textOnAccent,
  },
  // En bas à droite de la carte (dans le padding du corps, sur le papier
  // clair) — jamais accolée à l'étiquette « SCELLÉ » tout en haut du rabat.
  revealHint: {
    fontFamily: fonts.label,
    fontSize: 11,
    color: colors.textFaint,
    textAlign: 'right',
    marginTop: 8,
  },
  // Corps de carte assourdi une fois Manquée — jamais le badge d'état,
  // rendu séparément avant ce conteneur et donc toujours à `opacity: 1`.
  cardBodyMissed: { opacity: 0.85 },
  // L'enveloppe : rabat (SVG) + soit le cachet, soit la lettre qui en sort.
  // `position: relative` pour que le cachet (absolu) se positionne par
  // rapport à ce conteneur, pas par rapport à toute la carte.
  envelope: { position: 'relative' },
  letter: {
    alignSelf: 'center',
    width: '84%',
    marginTop: -LETTER_OVERLAP,
    marginBottom: 4,
    backgroundColor: colors.surfaceRaised,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    gap: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.16,
    shadowRadius: 12,
    elevation: 6,
  },
  // Réserve la place du tampon par un padding interne plutôt qu'une marge
  // externe : une marge asymétrique (seulement à droite) décentrait toute la
  // boîte de la lettre par rapport aux autres cartes — ici, la boîte garde
  // exactement la même largeur et le même centrage partout, seul le texte
  // recule pour ne jamais passer sous le tampon.
  letterWithStamp: { paddingRight: 60 },
  letterHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  letterAuthor: { fontFamily: fonts.label, fontSize: 11, letterSpacing: 0.6, color: colors.textFaint, flexShrink: 1 },
  letterCounter: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: radius.pill,
    backgroundColor: colors.border,
  },
  letterCounterText: { fontFamily: fonts.sansBold, fontSize: 10, color: colors.textMuted },
  letterQuestionText: {
    fontFamily: fonts.serifItalic,
    fontSize: 14,
    lineHeight: 20,
    color: colors.textFaint,
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
    color: colors.text,
    marginTop: 4,
    textAlign: 'center',
  },
  letterContentBlurred: Platform.select({
    web: { filter: 'blur(5px)' } as object,
    default: { opacity: 0.15 },
  }),
  // Zone sous l'enveloppe : auteur, mentions, teaser (Scellée uniquement).
  body: { paddingHorizontal: 18, paddingTop: 12 },
  // Même padding horizontal que `body` — sans lui, les commentaires
  // s'alignaient pile sur le bord de la carte, trop près de la bordure.
  commentsWrap: { paddingHorizontal: 18 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerSpacer: { flex: 1, minWidth: 8 },
  headerMenuButton: { padding: 2 },
  // `flexShrink` sur le bloc auteur ET sur le pseudo : c'est le pseudo qui se
  // tronque avec ellipse si la place manque.
  authorBlock: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1, minWidth: 0 },
  authorName: { fontFamily: fonts.bodyEmphasis, fontSize: 16, color: colors.text, flexShrink: 1, minWidth: 0 },
  // Sur sa propre ligne, sous l'en-tête — jamais accolée au pseudo.
  mentionTag: { fontSize: 12, fontWeight: '500', color: colors.textMuted, marginTop: 6 },
  // Secondaire, à l'italique — c'est tout ce qu'affiche l'enveloppe scellée
  // dans le fil, avant révélation (la vraie prédiction n'apparaît que dans
  // la lettre, une fois ouverte).
  cardTeaser: {
    fontFamily: fonts.serifItalic,
    fontSize: 14,
    lineHeight: 20,
    color: colors.textFaint,
    marginTop: 6,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  // Bouton « Révéler », sous l'enveloppe Scellée — contour fin, pas un aplat,
  // même registre que le bouton Manqué proposé plus bas.
  revealRow: { alignItems: 'flex-end', paddingHorizontal: 18, marginTop: 10 },
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
  // Fil épuré façon réseau social : les deux blocs restants (commentaire,
  // réaction) packés à gauche avec un espacement modeste.
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: 20,
    paddingHorizontal: 18,
    paddingTop: 12,
    paddingBottom: 16,
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
