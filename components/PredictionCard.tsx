import { useRouter } from 'expo-router';
import {
  BellRing,
  Eye,
  EyeOff,
  Flag,
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
  Easing,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import { Text } from './Text';

import { fetchCommentCount } from '../lib/comments';
import { formatSealedFor } from '../lib/datetime';
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
import { useAuth } from '../lib/auth';
import { betOutcomeLabel } from '../lib/bets';
import { nudgeCountLabel, nudgePrediction } from '../lib/nudges';
import { InlineComments } from './InlineComments';
import { InlineQuestionAnswer } from './InlineQuestionAnswer';
import { PhotoAttachButton } from './PhotoAttachButton';
import { PredictionPhoto } from './PredictionPhoto';
import { ReportDialog } from './ReportDialog';

/** Géométrie de la bulle de réactions : 12 emojis sur 2 rangées de 6 plutôt
 * qu'une seule rangée trop dense. La largeur est DÉDUITE du reste plutôt que
 * choisie à l'œil — c'est ce qui garantit six colonnes exactement régulières,
 * sans espace résiduel qui décale la dernière. */
const EMOJI_COLUMNS = 6;
const EMOJI_ITEM = 34;
const EMOJI_GAP = 6;
const EMOJI_PANEL_PADDING = 10;
const EMOJI_PANEL_WIDTH =
  EMOJI_COLUMNS * EMOJI_ITEM + (EMOJI_COLUMNS - 1) * EMOJI_GAP + 2 * EMOJI_PANEL_PADDING;
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
  const { reduceMotion } = useAuth();
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
  // Quelle photo est ouverte en grand, ou `null` — voir les « pages »
  // glissées derrière la lettre.
  const [openPhoto, setOpenPhoto] = useState<{ bucket: 'content' | 'verdict'; path: string } | null>(null);
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
  /* Vrai juste après avoir tranché, le temps de proposer une preuve. Ce n'est
     pas un « verdict en attente » : le verdict est déjà enregistré. */
  const [justSetVerdict, setJustSetVerdict] = useState(false);
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
  // Hauteur réelle de la lettre, mesurée au rendu : elle grandit avec son
  // contenu (les options d'un Sondage, par exemple), et les photos glissées
  // derrière doivent la suivre — à hauteur figée, elles s'arrêtaient en plein
  // milieu.
  const [letterHeight, setLetterHeight] = useState(0);
  const [reportOpen, setReportOpen] = useState(false);
  /**
   * Horodatage du dernier geste de réaction. L'enveloppe s'ouvre au toucher, et
   * un geste sur le pouce se termine par un relâchement que la `Pressable` de
   * l'enveloppe interprétait comme un appui — d'où une carte qui s'ouvrait au
   * lieu de poser une réaction. Neutraliser ce toucher en enveloppant le pouce
   * d'une `Pressable` marchait, mais tuait le glissé : une `Pressable` réclame
   * le toucher dès l'appui, et le `PanResponder` ne voyait plus rien bouger.
   * On laisse donc le geste intact et c'est l'OUVERTURE qui s'abstient, le
   * temps qu'il se termine.
   */
  const reactionGestureRef = useRef(0);
  // Le pari se pose d'un tap : l'affichage bascule immédiatement, sans attendre
  // la base. C'est un geste léger et réversible — faire patienter un curseur
  // pour ça casserait la fluidité recherchée.
  const [nudgeCount, setNudgeCount] = useState(item.nudge_count ?? 0);
  const [iNudged, setINudged] = useState(!!item.i_nudged);
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

  /**
   * Décachetage.
   *
   * Le contenu est disponible, mais cette personne ne l'a pas encore ouvert de
   * sa main : la carte reste fermée et attend son geste. C'est le moment fort
   * du produit, qui n'existait pas — la prédiction basculait en « révélée »
   * toute seule, en silence.
   *
   * L'auteur en est dispensé : il connaît son propre texte, et pour lui
   * l'ouverture est l'acte de révéler aux autres, pas de découvrir.
   */
  const [openedLocally, setOpenedLocally] = useState(item.is_opened);
  /* Le surlignage « non lue » vient d'une prop (`unseen`) calculée par le Fil.
     Il ne retomberait donc qu'au prochain chargement — d'où cet écho local,
     posé au moment du geste. */
  const [seenLocally, setSeenLocally] = useState(false);
  const [opening, setOpening] = useState(false);
  const openAnim = useRef(new Animated.Value(0)).current;
  /**
   * Entrée de la lettre, juste après le décachetage.
   *
   * Sans elle, l'enveloppe s'efface puis la lettre surgit d'un coup — et comme
   * la lettre est bien plus haute que l'enveloppe fermée, le saut de hauteur
   * se voit. Un fondu à l'entrée transforme la coupure en enchaînement.
   * Reste à 1 pour toutes les cartes déjà ouvertes : elles ne doivent pas
   * réapparaître en fondu à chaque rendu du Fil.
   */
  const enterAnim = useRef(new Animated.Value(1)).current;
  const needsOpening = revealed && !isAuthor && !openedLocally;

  /**
   * Le décachetage, en trois temps.
   *
   * Un simple fondu ne donnait aucun poids : rien ne s'ouvrait, l'image
   * changeait. Ici il se passe quelque chose de physique — le sceau cède, le
   * rabat se lève, la lettre sort. `openAnim` va de 0 à 1 et chaque élément
   * n'occupe qu'une tranche de cet intervalle, ce qui produit un enchaînement
   * plutôt que trois mouvements simultanés.
   *
   *   0 ──── 0,30 ──────── 0,75 ──── 1
   *   │ sceau │ rabat       │ corps
   *   │ qui   │ qui se lève │ qui
   *   │ cède  │             │ s'efface
   *
   * La courbe, elle, a été refaite. `bezier(0.32, 0, 0.24, 1)` démarrait très
   * lentement puis partait d'un coup : on ne lisait pas « le sceau résiste
   * puis lâche », on lisait un à-coup. `Easing.out(Easing.quad)` engage
   * franchement dès le premier instant puis ralentit — le geste part vite et
   * se pose, comme un objet qu'on soulève.
   *
   * Et surtout : la lettre ne se contente plus d'apparaître UNE FOIS
   * l'enveloppe ouverte. Elle monte de l'intérieur (voir `enterAnim` plus
   * bas), de bien plus bas qu'avant et en finissant par un léger dépassement,
   * comme une feuille qu'on tire d'un coup sec et qui se remet à plat.
   */
  function handleOpenEnvelope() {
    if (opening) return;
    setOpening(true);
    Animated.timing(openAnim, {
      toValue: 1,
      // `reduce_motion` est un réglage d'accessibilité de l'app : à zéro, le
      // décachetage reste un geste, il n'est simplement pas animé.
      // Court : mesuré, ce premier temps ne montrait presque rien pendant
      // 620 ms — d'où l'impression que « ça démarre doucement puis ça part
      // d'un coup ». Il fait céder le sceau et lever le rabat, et rend la
      // main à la lettre, qui est le vrai spectacle.
      duration: reduceMotion ? 0 : 420,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start(() => {
      setOpenedLocally(true);
      setOpening(false);
      openAnim.setValue(0);
      enterAnim.setValue(0);
      Animated.timing(enterAnim, {
        toValue: 1,
        duration: reduceMotion ? 0 : 700,
        // Décélération franche mais LISIBLE. La courbe précédente
        // (0.16, 1.02, 0.3, 1) était si chargée au départ que la moitié de la
        // course était finie avant la première image affichée : on ne voyait
        // que la fin. Celle-ci laisse voir la montée.
        easing: Easing.bezier(0.22, 0.61, 0.36, 1),
        useNativeDriver: false,
      }).start();
    });
    // Écrit sans attendre la fin de l'animation : si l'app se ferme entre les
    // deux, la prédiction reste ouverte plutôt que de se refermer.
    //
    // `seen` en même temps qu'`opened` : décacheter une enveloppe, c'est
    // l'avoir vue. Sans lui, la carte restait surlignée « non lue » après son
    // ouverture — le surlignage ne retombait qu'en ouvrant l'écran de détail,
    // ce que plus personne n'a besoin de faire depuis que la lettre se lit
    // sur la carte.
    setSeenLocally(true);
    setPredictionUserState(item.id, userId, { opened: true, seen: true });
  }

  const cardState: {
    kind: 'sealed' | 'to_open' | 'active' | 'realized' | 'missed' | 'question_open' | 'question_closed';
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
      : needsOpening
        ? { kind: 'to_open', label: 'À OUVRIR' }
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
    setVerdictPhotoUri(null);
    // Le verdict est posé : on peut maintenant proposer une preuve, sans que
    // rien de ce qui vient d'être décidé ne dépende de la réponse.
    setJustSetVerdict(true);
    onVerdictChange?.(next);
  }

  /**
   * Joint une preuve à un verdict DÉJÀ enregistré. On repasse le même verdict
   * à `setPredictionVerdict` : c'est lui qui porte la colonne photo, et le
   * rejouer à l'identique ne change rien d'autre.
   */
  async function handleAttachVerdictPhoto() {
    const current = verdict;
    if (!verdictPhotoUri || !current) return;
    setVerdictPending(true);
    setVerdictError(null);

    const { path, error: uploadError } = await uploadVerdictPhoto(item.id, verdictPhotoUri);
    if (uploadError || !path) {
      setVerdictPending(false);
      setVerdictError('Envoi de la photo impossible.');
      return;
    }

    const { error } = await setPredictionVerdict(item.id, current, path);
    setVerdictPending(false);
    if (error) {
      setVerdictError('Impossible de joindre la preuve.');
      return;
    }
    setLocalVerdictPhotoPath(path);
    setVerdictPhotoUri(null);
    setJustSetVerdict(false);
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

  /* L'action unique d'une carte « à ouvrir » : elle remplace tout le reste sur
     la ligne du bas, parce qu'il n'y a plus qu'une chose à faire. */
  const canOpen = cardState.kind === 'to_open';

  /* La relance « Impatient » — désormais la SEULE chose à faire sur
     l'enveloppe scellée de quelqu'un d'autre.

     Elle N'OUVRE RIEN, et c'est tout son intérêt : une prédiction sur
     l'élection de 2027 qui s'ouvrirait parce que six amis ont appuyé perdrait
     ce qui en fait l'intérêt. Elle prévient l'auteur, un point c'est tout.

     Elle ne dépend plus d'avoir pris position : le pari a quitté la carte, et
     la conditionner à une réponse de Sondage n'aurait plus de symétrie.

     `!iNudged` : une fois envoyée, le bouton QUITTE la carte. La base fait
     revenir `i_nudged` à faux au bout de sept jours (schema.sql section 65) :
     il réapparaît alors de lui-même, et une nouvelle relance rallume la
     notification de l'auteur. */
  const canNudge =
    !isAuthor &&
    (cardState.kind === 'sealed' || cardState.kind === 'question_open') &&
    !iNudged;

  async function handleNudge() {
    // Mise à jour optimiste : le bouton disparaît tout de suite. En cas
    // d'échec il revient, sans message — il n'a rien à expliquer, notamment
    // pas qu'on a été bloqué.
    setINudged(true);
    setNudgeCount((n) => n + 1);
    const { error } = await nudgePrediction(item.id);
    if (error) {
      setINudged(false);
      setNudgeCount((n) => Math.max(0, n - 1));
    }
  }

  /* Ce que l'auteur lit sur sa propre enveloppe : une attente, jamais une
     liste de noms — « Untel et Unetelle t'attendent » ferait d'un signal
     collectif une pression nominative, ce qui n'est pas le même geste. */
  const nudgeLabel =
    cardState.kind === 'sealed' || cardState.kind === 'question_open'
      ? nudgeCountLabel(nudgeCount)
      : null;
  /* `!needsOpening` : « 3 amis n'y croyaient pas. Raison quand même. » donne le
     verdict. L'afficher sur une enveloppe encore fermée éventerait la
     révélation avant qu'on l'ait ouverte. */
  const betOutcome =
    revealed && !needsOpening
      ? betOutcomeLabel(item.believer_count ?? 0, item.doubter_count ?? 0, item.final_status)
      : null;

  // Panneau de réactions façon Facebook : maintenir le doigt sur le pouce
  // fait apparaître la bulle, la faire glisser dessus grossit l'emoji
  // survolé, et relâcher le doigt sur l'un d'eux le valide. Un tap simple
  // (sans glissement) garde l'ancien comportement : ouvrir/fermer la bulle.
  const panelRef = useRef<View>(null);
  const panelLayoutRef = useRef<{ x: number; y: number; width: number; height: number } | null>(null);
  // Position et taille de CHAQUE emoji dans la bulle, relevées au rendu
  // (`onLayout` donne des coordonnées relatives à la bulle, donc fiables).
  // C'est ce qui remplace l'ancien calcul de grille : celui-ci supposait des
  // colonnes régulières, ce que `space-between` et un retour à la ligne ne
  // garantissent pas — d'où un emoji grossi qui ne correspondait pas à celui
  // sous le doigt. Ici on teste la vraie boîte de chacun, il n'y a plus rien
  // à supposer.
  const itemLayoutsRef = useRef<({ x: number; y: number; width: number; height: number } | null)[]>(
    EMOJI_REACTIONS.map(() => null)
  );
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

  /** Grossit l'emoji survolé et rend sa taille normale au précédent. */
  function setHovered(index: number | null) {
    if (hoveredIndexRef.current === index) return;
    const previous = hoveredIndexRef.current;
    hoveredIndexRef.current = index;
    if (previous !== null) {
      Animated.spring(scaleAnims[previous], { toValue: 1, useNativeDriver: false, speed: 20, bounciness: 8 }).start();
    }
    if (index !== null) {
      Animated.spring(scaleAnims[index], { toValue: 1.85, useNativeDriver: false, speed: 20, bounciness: 8 }).start();
    }
  }

  /** Quel emoji se trouve sous le doigt, aux coordonnées écran données —
   * `null` si le doigt est hors de la bulle. Compare aux boîtes réellement
   * mesurées, sans supposer de grille. La tolérance verticale laisse le doigt
   * déborder un peu au-dessus/en dessous sans perdre la sélection : on vise
   * avec un doigt, pas avec un curseur. */
  function emojiAt(pageX: number, pageY: number): number | null {
    const panel = panelLayoutRef.current;
    if (!panel) return null;
    const x = pageX - panel.x;
    const y = pageY - panel.y;
    const TOLERANCE = 14;
    for (let i = 0; i < itemLayoutsRef.current.length; i++) {
      const box = itemLayoutsRef.current[i];
      if (!box) continue;
      if (
        x >= box.x - TOLERANCE / 2 &&
        x <= box.x + box.width + TOLERANCE / 2 &&
        y >= box.y - TOLERANCE &&
        y <= box.y + box.height + TOLERANCE
      ) {
        return i;
      }
    }
    return null;
  }

  /** Relève la position de la bulle à l'écran. Rappelée à chaque appui (pas
   * seulement au montage) : le Fil défile, donc une mesure prise à
   * l'ouverture n'est plus valable au geste suivant. */
  function measurePanel() {
    panelRef.current?.measureInWindow((x, y, width, height) => {
      panelLayoutRef.current = { x, y, width, height };
    });
  }

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        reactionGestureRef.current = Date.now();
        panelOpenAtGrantRef.current = emojiPanelOpenRef.current;
        setEmojiPanelOpen(true);
        // Si la bulle est déjà ouverte, sa position est mesurable tout de
        // suite ; sinon `onLayout` s'en chargera au montage.
        measurePanel();
      },
      onPanResponderMove: (_evt, gesture) => {
        setHovered(emojiAt(gesture.moveX, gesture.moveY));
      },
      onPanResponderRelease: (_evt, gesture) => {
        reactionGestureRef.current = Date.now();
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
                  size={21}
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
                {/* Aucune `Pressable` ici, volontairement. Une `Pressable`
                    réclame le toucher dès l'appui : posée autour du pouce, elle
                    empêchait le `PanResponder` de recevoir le moindre
                    déplacement — donc plus aucun grossissement au glissé. C'est
                    `reactionGestureRef` (voir plus haut) qui empêche désormais
                    l'enveloppe de s'ouvrir, sans toucher au geste. */}
                <View style={[styles.reactionTrigger, styles.iconSlot]} {...panResponder.panHandlers}>
                  {myEmoji ? (
                    <Text style={styles.reactionTriggerEmoji}>{myEmoji}</Text>
                  ) : (
                    <ThumbsUp
                      size={21}
                      color={totalReactions > 0 ? colors.text : colors.footerIconInactive}
                      strokeWidth={1.75}
                    />
                  )}
                </View>

                {emojiPanelOpen && (
                  <View ref={panelRef} style={styles.emojiPanel} onLayout={measurePanel}>
                    {EMOJI_REACTIONS.map((emoji, i) => (
                      <Animated.View
                        key={emoji}
                        // Relève la boîte de cet emoji dans la bulle — c'est
                        // ce que `emojiAt` interroge pour savoir lequel est
                        // sous le doigt.
                        onLayout={(e) => {
                          itemLayoutsRef.current[i] = e.nativeEvent.layout;
                        }}
                        style={styles.emojiBubbleSlot}
                      >
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
                          {/* Le grossissement porte sur l'emoji seul, pas sur
                              sa boîte : la boîte garde sa place dans la rangée,
                              donc les voisins ne se décalent pas quand le doigt
                              passe — et la mesure ci-dessus reste juste. */}
                          <Animated.Text
                            style={[styles.emojiButtonText, { transform: [{ scale: scaleAnims[i] }] }]}
                          >
                            {emoji}
                          </Animated.Text>
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
                    size={21}
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
  /**
   * L'âge du scellé, à la place du compte à rebours.
   *
   * Il n'y a plus de date à décompter : une prédiction reste scellée jusqu'à
   * ce que son auteur l'ouvre. L'âge, lui, dit quelque chose de vrai et de
   * vérifiable — et c'est ce qui rend visible, sans accuser personne, une
   * prédiction qu'on laisse dormir parce qu'on l'a perdue.
   */
  const revealHintText = revealed
    ? null
    : // Un Sondage n'est pas scellé : sa question se lit dès la première
      // seconde, c'est la CLÔTURE qu'on attend. Écrire « Scellé » dessus
      // contredisait ce que la carte montrait juste au-dessus.
      `${isQuestion ? 'Ouvert' : 'Scellé'} depuis ${formatSealedFor(item.created_at, now)}`;

  const envelopeFooter = (
    <View style={[styles.envFooter, emojiPanelOpen && styles.envFooterRaised]}>
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
          <MoreHorizontal size={21} color={colors.icon} strokeWidth={1.75} />
        </Pressable>
      </View>

      {mentionLabel && (
        <Text style={styles.envMentionTag} numberOfLines={1}>
          {mentionLabel}
        </Text>
      )}

      {/* Un Sondage n'a pas de teaser propre : celui enregistré est un extrait
          de la question, déjà écrite en entier dans la lettre. L'enveloppe ne
          porte donc que le teaser d'une Déclaration, quand il y en a un. */}
      {!isQuestion && !!item.teaser && <Text style={styles.envTeaser}>{item.teaser}</Text>}

      {/* Le dénouement — c'est ici que le mécanisme paie. */}
      {betOutcome && <Text style={styles.betOutcome}>{betOutcome}</Text>}

      {/* Le bouton « Révéler », réservé à l'auteur d'une carte encore Scellée,
          tient sur la ligne du bas plutôt que sur une ligne à lui : sur sa
          propre ligne il allongeait l'enveloppe, et les cartes de l'auteur ne
          faisaient plus la même hauteur que les autres. */}
      <View style={styles.envBottomRow}>
        {/* Une lettre qu'on n'a pas encore décachetée ne propose RIEN d'autre
            que de l'ouvrir : ni commentaire, ni réaction, ni compteur. On ne
            commente pas ce qu'on n'a pas lu, et laisser ces icônes à côté du
            bouton « Ouvrir » revenait à poser trois questions là où il n'y en
            a qu'une. Elles reviennent toutes seules une fois l'enveloppe
            ouverte. */}
        {cardState.kind !== 'to_open' && actionsRow}
        {/* Seul sur sa ligne, « Ouvrir » se centre et prend toute la largeur :
            il n'y a plus rien à sa gauche dont il faudrait le distinguer, et
            un bouton unique collé au bord se lit comme un reste de rangée. */}
        <View style={[styles.envBottomRight, cardState.kind === 'to_open' && styles.envBottomOnly]}>
          {/* Sur une enveloppe scellée la date est écrite en haut, sur le
              rabat : le bas y était trop chargé. Les autres états n'ont pas de
              rabat à leur disposition, elle reste donc ici. */}
          {cardState.kind !== 'sealed' && revealHintText && (
            <Text style={styles.envRevealHint} numberOfLines={1}>
              {revealHintText}
            </Text>
          )}
          {/* `open_ended` seulement : une Programmée s'ouvre à sa date, pas
              quand son auteur le décide — sinon la date ne veut plus rien
              dire. La fonction SQL `reveal_prediction_now` pose la même
              condition, ce bouton ne fait que ne pas la proposer. */}
          {/* Les deux paris prennent la place laissée libre à droite sur une
              enveloppe scellée (la date y est écrite en haut, sur le rabat).
              Aucune hauteur ajoutée, donc les proportions de l'enveloppe et la
              position du sceau ne bougent pas d'un pixel. */}
          {canOpen && (
            <Pressable
              onPress={handleOpenEnvelope}
              disabled={opening}
              style={({ pressed }) => [styles.openButton, pressed && styles.openButtonPressed]}
              accessibilityRole="button"
              accessibilityLabel="Ouvrir cette prédiction"
            >
              <Text style={styles.openButtonText}>{opening ? 'Ouverture…' : 'Ouvrir'}</Text>
            </Pressable>
          )}

          {/* Ce que l'auteur lit : combien de personnes attendent. Aucun bouton
              en face — la relance n'est pas une demande à laquelle il faudrait
              répondre, et il n'existe volontairement aucun raccourci « ouvrir
              maintenant » branché dessus. Il ouvre quand il veut, avec le même
              bouton « Révéler » qu'avant. */}
          {isAuthor && nudgeLabel && (
            <View style={styles.nudgeCountRow} accessibilityLabel={nudgeLabel}>
              <BellRing size={18} color={colors.footerIconInactive} strokeWidth={1.75} />
              <Text style={styles.betCountText}>{nudgeCount}</Text>
            </View>
          )}

          {/* Le geste, côté Cercle — et il ne s'affiche que tant qu'on ne
              l'a pas fait. Plus d'état « déjà relancé » à représenter : dans
              ce cas le bouton n'est simplement pas là. */}
          {canNudge && (
            <Pressable
              onPress={handleNudge}
              hitSlop={8}
              style={({ pressed }) => [styles.nudgeButton, pressed && styles.nudgeButtonPressed]}
              accessibilityRole="button"
              accessibilityLabel="Dire que je suis impatient"
            >
              <Text style={styles.nudgeButtonText}>
                Impatient{nudgeCount > 0 ? ` ${nudgeCount}` : ''}
              </Text>
            </Pressable>
          )}

          {isAuthor && cardState.kind === 'sealed' && item.open_ended && (
            <Pressable
              onPress={handleRevealNow}
              disabled={revealPending}
              style={({ pressed }) => [styles.revealButton, pressed && styles.revealButtonPressed]}
            >
              <Text style={styles.revealButtonText}>{revealPending ? 'Révélation…' : 'Révéler'}</Text>
            </Pressable>
          )}
        </View>
      </View>

      {revealError && <Text style={styles.revealErrorText}>{revealError}</Text>}
    </View>
  );

  const showVerdictStamp = cardState.kind === 'realized' || cardState.kind === 'missed';

  /* Les photos glissées derrière la lettre, dans l'ordre où elles se sont
     ajoutées à l'histoire : celle de la création d'abord, la preuve du verdict
     ensuite. Chacune décale et s'incline un peu plus que la précédente, d'où
     l'éventail — et chacune reste visible par le bord qu'elle laisse dépasser. */
  const pages: { bucket: 'content' | 'verdict'; path: string }[] = [];
  if (item.photo_path) pages.push({ bucket: 'content', path: item.photo_path });
  if (verdictPhotoPath) pages.push({ bucket: 'verdict', path: verdictPhotoPath });

  return (
    <View
      style={[
        styles.card,
        unseen && !seenLocally && styles.cardUnseen,
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
          onPress={() => {
            // Un relâchement de geste de réaction n'est pas un appui sur la
            // carte. 400 ms : plus long que le délai entre le relâchement et
            // l'appui synthétique qui le suit, plus court que le temps qu'il
            // faut pour viser volontairement l'enveloppe ensuite.
            if (Date.now() - reactionGestureRef.current < 400) return;
            // Sur une enveloppe à décacheter, toute la carte est le bouton :
            // aller à l'écran de détail contournerait le geste et livrerait le
            // contenu sans l'avoir ouvert.
            if (canOpen) {
              handleOpenEnvelope();
              return;
            }
            onPress?.();
          }}
          style={styles.envelope}
          onLayout={(e) => setEnvelopeWidth(e.nativeEvent.layout.width)}
        >
          {cardState.kind === 'sealed' || cardState.kind === 'to_open' ? (
            /* `predict scellé.png` : le rectangle, le rabat pointe en bas, le
               badge sur sa pointe — puis le bloc commun juste sous le badge.
               `minHeight` plutôt qu'une hauteur fixe : la carte garde le ratio
               exact de la maquette, mais un teaser long l'allonge au lieu
               d'être tronqué.

               `to_open` emprunte exactement la même enveloppe : le contenu est
               disponible, mais tant que la personne ne l'a pas décacheté elle
               doit voir une enveloppe FERMÉE — sinon il n'y a plus rien à
               ouvrir. Seule l'animation de sortie les distingue. */
            <Animated.View
              style={[
                styles.envelopeShell,
                { minHeight: env.envH, backgroundColor: WASH.sealedBody },
                // Le corps NE s'efface PAS. Le faire disparaître laissait, au
                // milieu du geste, une carte blanche pendant près d'une demi-
                // seconde — un trou, exactement le contraire du poids
                // recherché. L'enveloppe reste donc entière et visible jusqu'au
                // bout ; c'est la lettre qui, en montant par-dessus, prend le
                // relais.
              ]}
            >
              {/* Le rabat pivote autour de son bord SUPÉRIEUR, exactement comme
                  un vrai rabat d'enveloppe : `transformOrigin: 'top'`. Sans
                  lui, la rotation se ferait autour du centre et le rabat
                  traverserait l'enveloppe au lieu de s'en détacher.
                  `perspective` donne la profondeur — sans elle, `rotateX`
                  écrase simplement la forme au lieu de la faire basculer. */}
              <Animated.View
                style={[
                  styles.sealedFlapLayer,
                  cardState.kind === 'to_open' && {
                    transformOrigin: 'top',
                    transform: [
                      { perspective: 600 },
                      {
                        // S'arrête à -72°, jamais au-delà : passé 90° le rabat
                        // se présente sur la tranche puis montre son dos, donc
                        // il s'évanouit au lieu de s'ouvrir. À -72° il est
                        // franchement relevé et reste lisible.
                        rotateX: openAnim.interpolate({
                          inputRange: [0, 0.28, 1],
                          outputRange: ['0deg', '0deg', '-72deg'],
                        }),
                      },
                    ],
                  },
                ]}
                pointerEvents="none"
              >
                <FlapDown height={env.flapH} />
              </Animated.View>
              {/* Le sceau grossit et s'efface au décachetage : c'est lui qui
                  cède, comme un cachet de cire qu'on brise. */}
              <Animated.View
                style={[
                  styles.sealedBadge,
                  { top: env.badgeTop, marginLeft: -env.badge / 2 },
                  cardState.kind === 'to_open' && {
                    // Il gonfle sous la contrainte, puis lâche : il bascule et
                    // tombe hors de l'enveloppe. C'est le premier mouvement, et
                    // c'est lui qui déclenche visuellement tout le reste.
                    opacity: openAnim.interpolate({
                      inputRange: [0, 0.3, 0.55],
                      outputRange: [1, 1, 0],
                    }),
                    transform: [
                      {
                        scale: openAnim.interpolate({
                          inputRange: [0, 0.3, 0.6],
                          outputRange: [1, 1.18, 0.9],
                        }),
                      },
                      {
                        translateY: openAnim.interpolate({
                          inputRange: [0, 0.3, 0.6],
                          outputRange: [0, 0, 34],
                        }),
                      },
                      {
                        rotate: openAnim.interpolate({
                          inputRange: [0, 0.3, 0.6],
                          outputRange: ['0deg', '-6deg', '22deg'],
                        }),
                      },
                    ],
                  },
                ]}
                pointerEvents="none"
              >
                {envelopeWidth > 0 && <PredictBadge glyph="P" size={env.badge} />}
              </Animated.View>

              {/* Centrée en haut, sur le rabat : c'est le seul endroit de
                  l'enveloppe scellée qui reste libre, et le regard y tombe
                  avant le reste. */}
              {revealHintText && (
                <View style={styles.sealedRevealHint} pointerEvents="none">
                  <Text style={styles.envRevealHint} numberOfLines={1}>
                    {revealHintText}
                  </Text>
                </View>
              )}

              {/* Cale le bloc commun au bas du badge : tout ce qui suit est
                  dans le flux, donc l'enveloppe s'allonge s'il déborde. */}
              <View style={{ height: env.badgeBottom }} pointerEvents="none" />
              {envelopeFooter}
            </Animated.View>
          ) : (
            <Animated.View
              style={[
                styles.envelopeShell,
                {
                  paddingTop: env.flapPeek,
                  // Opaque très vite (à 25 % de la course) : au-delà, c'est le
                  // DÉPLACEMENT qui raconte la sortie. Un fondu qui dure toute
                  // l'animation donne « l'image apparaît », pas « la feuille
                  // sort » — c'est ce qu'on avait.
                  opacity: enterAnim.interpolate({
                    inputRange: [0, 0.2, 1],
                    outputRange: [0, 1, 1],
                  }),
                  // Elle part de bien plus bas qu'avant (110 px au lieu de 40)
                  // et se rétrécit légèrement au départ : de loin, on lit une
                  // feuille encore engagée dans l'enveloppe, qu'on tire.
                  transform: [
                    {
                      translateY: enterAnim.interpolate({
                        inputRange: [0, 1],
                        outputRange: [140, 0],
                      }),
                    },
                    {
                      scale: enterAnim.interpolate({
                        inputRange: [0, 0.6, 1],
                        outputRange: [0.94, 1.01, 1],
                      }),
                    },
                  ],
                },
              ]}
            >
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
              {/* La dernière ajoutée est rendue en premier, donc tout au fond :
                  l'éventail s'ouvre alors dans l'ordre de l'histoire, la photo
                  de création juste derrière la lettre. */}
              {pages
                .map((page, index) => ({ page, rank: index + 1 }))
                .reverse()
                .map(({ page, rank }) => (
                  <Pressable
                    key={page.bucket}
                    onPress={() => setOpenPhoto(page)}
                    style={[
                      styles.secondPage,
                      {
                        // Calée sur la lettre (qui commence sous la pointe du
                        // rabat), puis décalée pour dépasser à droite et en bas.
                        top: env.flapPeek + PAGE_PEEK * rank,
                        marginLeft: PAGE_PEEK * rank,
                        width: env.letterW,
                        height: Math.max(letterHeight, env.letterH),
                        borderRadius: env.letterRadius,
                        borderWidth: env.letterBorder,
                        borderColor: colors.accent,
                        transform: [{ rotate: `${PAGE_TILT * rank}deg` }],
                      },
                    ]}
                  >
                    <PredictionPhoto bucket={page.bucket} path={page.path} fill />
                  </Pressable>
                ))}

              <View
                onLayout={(e) => setLetterHeight(e.nativeEvent.layout.height)}
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
                  // Réserve la bande que les photos laissent dépasser sous la
                  // lettre : sans elle, le bloc auteur/teaser vient par-dessus
                  // et capte l'appui à leur place.
                  pages.length > 0 ? { marginBottom: PAGE_PEEK * pages.length } : null,
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
              {isQuestion && !revealed && (
                /* Une `Pressable` sans effet, posée autour du formulaire :
                   c'est le seul moyen fiable — sur mobile comme sur navigateur —
                   d'empêcher celle de l'enveloppe de happer le toucher et
                   d'ouvrir la carte au lieu de laisser écrire. */
                <Pressable onPress={() => {}}>
                  <InlineQuestionAnswer prediction={item} />
                </Pressable>
              )}
                    </View>

              {envelopeFooter}
            </Animated.View>
          )}

          {/* Photo-preuve du verdict — sous la lettre, jamais dedans : elle
              documente le dénouement (Réalisé/Manqué), pas le secret
              initial. */}

        </Pressable>

        {/* Le verdict est posé DU PREMIER COUP. Auparavant, toucher
            « Réalisé » ouvrait une étape intermédiaire proposant une photo,
            dont le bouton de sortie s'appelait « Annuler » : qui n'avait pas
            de photo à joindre appuyait dessus, et perdait son verdict sans
            comprendre pourquoi. Le piège n'est pas rattrapable par un
            meilleur libellé — c'est l'étape elle-même qui n'a pas lieu
            d'être. Trancher est la décision ; la preuve vient après, si on
            en a une. Le verdict reste modifiable depuis l'écran détail. */}
        {!isQuestion && isAuthor && revealed && verdict === null && (
          <View style={styles.verdictPrompt}>
            <View style={styles.verdictPromptButtons}>
              <Pressable
                onPress={() => handleSetVerdict('realized')}
                disabled={verdictPending}
                style={[styles.verdictPromptButton, styles.verdictPromptButtonRealized]}
              >
                <Text style={styles.verdictPromptButtonTextOnAccent}>
                  {verdictPending ? '…' : 'Réalisé'}
                </Text>
              </Pressable>
              <Pressable
                onPress={() => handleSetVerdict('missed')}
                disabled={verdictPending}
                style={[styles.verdictPromptButton, styles.verdictPromptButtonMissed]}
              >
                <Text style={styles.verdictPromptButtonText}>
                  {verdictPending ? '…' : 'Manqué'}
                </Text>
              </Pressable>
            </View>
            {verdictError && <Text style={styles.verdictPromptError}>{verdictError}</Text>}
          </View>
        )}

        {/* La preuve, proposée juste après avoir tranché — et seulement là :
            laisser ce bloc sur tous les verdicts passés encombrerait chaque
            carte de l'auteur indéfiniment. */}
        {!isQuestion && isAuthor && justSetVerdict && !verdictPhotoPath && (
          <View style={styles.verdictPhotoStep}>
            <Text style={styles.verdictPhotoStepLabel}>Une preuve ? (facultatif)</Text>
            <PhotoAttachButton
              uri={verdictPhotoUri}
              onChange={setVerdictPhotoUri}
              disabled={verdictPending}
              label="Joindre une photo"
            />
            <View style={styles.verdictPromptButtons}>
              <Pressable
                onPress={() => {
                  setJustSetVerdict(false);
                  setVerdictPhotoUri(null);
                }}
                disabled={verdictPending}
                style={[styles.verdictPromptButton, styles.verdictPromptButtonMissed]}
              >
                <Text style={styles.verdictPromptButtonText}>Sans preuve</Text>
              </Pressable>
              <Pressable
                onPress={handleAttachVerdictPhoto}
                disabled={verdictPending || !verdictPhotoUri}
                style={[
                  styles.verdictPromptButton,
                  styles.verdictPromptButtonRealized,
                  !verdictPhotoUri && styles.verdictPromptButtonDisabled,
                ]}
              >
                <Text style={styles.verdictPromptButtonTextOnAccent}>
                  {verdictPending ? 'Envoi…' : 'Joindre'}
                </Text>
              </Pressable>
            </View>
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
                size={21}
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
                <Eye size={21} color={colors.icon} strokeWidth={1.75} />
              ) : (
                <EyeOff size={21} color={colors.icon} strokeWidth={1.75} />
              )}
              <Text style={styles.cardMenuRowText}>{isHidden ? 'Afficher à nouveau' : 'Masquer'}</Text>
            </Pressable>

            {!isAuthor && (
              <Pressable
                onPress={() => {
                  setMenuOpen(false);
                  setReportOpen(true);
                }}
                style={styles.cardMenuRow}
              >
                <Flag size={21} color={colors.icon} strokeWidth={1.75} />
                <Text style={styles.cardMenuRowText}>Signaler</Text>
              </Pressable>
            )}

            {isAuthor && onDelete && (
              <Pressable
                onPress={() => {
                  setMenuOpen(false);
                  handleDeletePress();
                }}
                style={[styles.cardMenuRow, styles.cardMenuRowLast]}
              >
                <Trash2 size={21} color={colors.danger} strokeWidth={1.75} />
                <Text style={[styles.cardMenuRowText, styles.cardMenuRowTextDanger]}>Supprimer</Text>
              </Pressable>
            )}
          </Pressable>
        </Pressable>
      </Modal>

      {/* La page choisie, ouverte en grand — un appui n'importe où referme. */}
      {openPhoto && (
        <Modal visible transparent animationType="fade" onRequestClose={() => setOpenPhoto(null)}>
          <Pressable style={styles.photoOverlay} onPress={() => setOpenPhoto(null)}>
            <View style={styles.photoOverlayInner}>
              <PredictionPhoto bucket={openPhoto.bucket} path={openPhoto.path} />
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

      {userId && (
        <ReportDialog
          visible={reportOpen}
          target={{ kind: 'prediction', id: item.id }}
          reporterId={userId}
          onClose={() => setReportOpen(false)}
        />
      )}
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

/** Les trois compteurs du pied de carte (commentaires, réactions, réponses).
 * `minWidth` fixe et texte cadré à gauche : sans lui, passer de « 9 » à « 10 »
 * élargissait le groupe et décalait tous les suivants sur la rangée. Les
 * chiffres ne bougent donc plus d'une carte à l'autre. */
function footerCount(colors: Colors) {
  return {
    fontSize: 15,
    fontWeight: '700' as const,
    color: colors.text,
    minWidth: 16,
    textAlign: 'left' as const,
  };
}

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
  sealedRevealHint: { position: 'absolute', left: 0, right: 0, top: 12, alignItems: 'center', zIndex: 2 },
  // L'enveloppe est la carte : tout tient dedans, plus rien ne vit sous elle.
  envelopeShell: { paddingHorizontal: 16, paddingBottom: 12 },
  // Le bloc commun aux deux enveloppes — même disposition sur l'une et l'autre.
  envFooter: { marginTop: 8 },
  /**
   * La bulle de réactions est posée dans ce bloc, en `position: absolute`
   * au-dessus du pouce. Son `zIndex: 20` ne vaut QUE dans le contexte
   * d'empilement de son parent : sans ce relèvement, elle passait derrière la
   * lettre (zIndex 2), le cachet (2) et le tampon Réalisé/Manqué (3) — le P du
   * cachet se retrouvant par-dessus certains emojis, qu'on ne pouvait donc plus
   * choisir. On lève tout le bloc le temps que la bulle soit ouverte.
   */
  envFooterRaised: { zIndex: 40 },
  envAuthorRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  envAuthorName: { fontFamily: fonts.sansBold, fontSize: 16, color: colors.text, flexShrink: 1, minWidth: 0 },
  envMentionTag: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
  envTeaser: { fontFamily: fonts.serifItalic, fontSize: 15, lineHeight: 21, color: colors.textMuted, marginTop: 3 },
  // Dernière ligne : boutons d'action à gauche, date de révélation à droite.
  // `flexWrap` : sur un Sondage, la rangée porte TROIS icônes avec leurs
  // compteurs. Dès qu'un vote arrivait, elle devenait assez large pour écraser
  // la date de révélation à sa droite, qui disparaissait purement et simplement
  // (`flexShrink` la réduisait à zéro). Elle passe désormais à la ligne quand
  // la place manque, au lieu de s'effacer.
  envBottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    rowGap: 6,
    gap: 10,
  },
  // Date de révélation et bouton « Révéler » côte à côte, à droite de la ligne
  // du bas : c'est ce qui garde toutes les enveloppes à la même hauteur.
  // `minHeight` calé sur la hauteur du bouton « Révéler » : la ligne du bas
  // fait alors la même hauteur qu'il soit présent ou non, et toutes les
  // enveloppes scellées se retrouvent au même gabarit.
  envBottomRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flexShrink: 1,
    minWidth: 0,
    minHeight: 30,
  },
  envBottomOnly: { flexGrow: 1, justifyContent: 'center' },
  // Plus de `flexShrink` : c'est lui qui la laissait se réduire à néant. Elle
  // garde sa largeur, et c'est la rangée qui passe à la ligne si besoin.
  envRevealHint: { fontFamily: fonts.label, fontSize: 13, color: colors.textMuted },
  // L'unique action d'une carte à ouvrir : pleine, dorée, impossible à
  // confondre avec les icônes discrètes qui l'entourent.
  openButton: {
    backgroundColor: colors.accent,
    borderRadius: radius.pill,
    paddingHorizontal: 18,
    paddingVertical: 7,
  },
  openButtonPressed: { backgroundColor: colors.accentBright },
  openButtonText: {
    fontFamily: fonts.sansBold,
    fontSize: 13,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    color: colors.textOnAccent,
  },
  nudgeCountRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  // Contour plutôt que bouton plein : « Révéler », qui est la vraie décision,
  // reste la seule chose dorée de la rangée. Une relance ne doit pas peser
  // plus lourd à l'œil que l'ouverture elle-même.
  nudgeButton: {
    flexShrink: 0,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  nudgeButtonPressed: { opacity: 0.7 },
  nudgeButtonText: { fontFamily: fonts.label, fontSize: 13, color: colors.textMuted },
  betCountText: { fontFamily: fonts.label, fontSize: 13, color: colors.textMuted },
  betOutcome: { fontFamily: fonts.bodyEmphasis, fontSize: 14, color: colors.text, marginTop: 4 },
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
    fontSize: 12,
    letterSpacing: 1.1,
    textTransform: 'uppercase',
    color: letterInk(colors.surface).soft,
    marginBottom: 2,
  },
  letterQuestionText: {
    fontFamily: fonts.serifItalic,
    fontSize: 16,
    lineHeight: 23,
    color: letterInk(colors.surface).soft,
    marginTop: 4,
    textAlign: 'center',
  },
  // La vraie prédiction est le cœur de la lettre : Spectral, semi-gras, bien
  // plus grande que le reste de l'interface — nette dès qu'elle est lisible
  // (`letterContentBlurred` la couvre d'un flou tant que ce n'est pas le cas).
  letterContent: {
    fontFamily: fonts.bodyEmphasis,
    fontSize: 18,
    lineHeight: 25,
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
  // Les commentaires s'ouvrent sous l'enveloppe, dans un panneau à fond
  // distinct : sans lui ils se confondaient avec le bas de la carte, et la
  // zone de saisie passait inaperçue. Le fond, plus clair que l'enveloppe,
  // suffit à les détacher — pas besoin d'un trait de séparation.
  commentsWrap: {
    paddingHorizontal: 18,
    paddingTop: 14,
    paddingBottom: 16,
    backgroundColor: colors.surface,
  },
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
  revealButton: {
    flexShrink: 0,
    borderWidth: 1,
    borderColor: colors.accent,
    borderRadius: radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: colors.accentSoft,
  },
  revealButtonPressed: { opacity: 0.7 },
  revealButtonText: { fontFamily: fonts.label, fontSize: 14, fontWeight: '700', color: colors.accent },
  revealErrorText: { fontSize: 11, color: colors.danger, marginTop: 6, textAlign: 'right' },
  // Invite l'auteur à trancher — rien que les deux boutons, alignés à droite.
  // Réalisé en accent plein (comme le bouton « Sceller »), Manqué en contour
  // neutre — le choix à trancher doit rester net, sans code couleur vert/rouge.
  // `paddingBottom` : sans lui, les boutons Réalisé/Manqué touchaient le bord
  // inférieur de la carte, que `overflow: 'hidden'` rognait alors.
  verdictPrompt: { paddingHorizontal: 18, marginTop: 10, paddingBottom: 14 },
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
  // Rien à envoyer tant qu'aucune photo n'est choisie : le bouton s'efface
  // plutôt que de promettre une action qui ne ferait rien.
  verdictPromptButtonDisabled: { opacity: 0.45 },
  verdictPhotoStepLabel: { fontSize: 12, color: colors.textMuted },
  // Photo-preuve du verdict — sous la lettre, même padding horizontal que le corps.
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
  // Gabarit fixe : les trois icônes du pied de carte gardent le même
  // encombrement, donc le même alignement, quelle que soit leur forme.
  // Un peu plus large que l'icône (21) pour lui laisser de l'air.
  iconSlot: { width: 26, height: 26, alignItems: 'center', justifyContent: 'center' },
  commentsToggle: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  // Toujours affiché, y compris à zéro — encre dès qu'il y a au moins une
  // interaction, teinte discrète sinon (voir `footerCountInactive`).
  commentsToggleText: footerCount(colors),
  reactionTriggerWrap: { position: 'relative' },
  reactionTriggerRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  reactionTrigger: { flexDirection: 'row', alignItems: 'center' },
  // Calé sur la taille des icônes voisines (21) : un emoji plus petit qu'un
  // pouce faisait sauter la rangée dès qu'on réagissait.
  reactionTriggerEmoji: { fontSize: 21, lineHeight: 26, textAlign: 'center' },
  reactionTriggerCount: footerCount(colors),
  footerCountInactive: { color: colors.footerIconInactive },
  answersRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  answersCountText: footerCount(colors),
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
    // `gap` fixe plutôt que `space-between` : l'écart entre deux emojis est
    // alors le même partout, y compris si une rangée n'est pas pleine — la
    // largeur de la bulle est calculée pour que six tiennent pile.
    columnGap: EMOJI_GAP,
    rowGap: EMOJI_GAP,
    backgroundColor: colors.surfaceRaised,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: EMOJI_PANEL_PADDING,
    paddingVertical: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 8,
  },
  // Emplacement de taille fixe : c'est lui qui tient la grille. L'emoji
  // grossit à l'intérieur (voir `scaleAnims`) sans jamais bouger ses voisins.
  emojiBubbleSlot: { width: EMOJI_ITEM, height: EMOJI_ITEM },
  emojiBubbleItem: {
    width: EMOJI_ITEM,
    height: EMOJI_ITEM,
    borderRadius: EMOJI_ITEM / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emojiBubbleItemActive: { backgroundColor: colors.accentSoft },
  emojiButtonText: { fontSize: 20, lineHeight: 26, textAlign: 'center' },
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
