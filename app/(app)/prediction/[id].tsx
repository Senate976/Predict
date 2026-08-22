import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Flag, MessageCircle, MoreHorizontal, Trash2 } from 'lucide-react-native';
import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { Text } from '../../../components/Text';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AudioPlayerButton } from '../../../components/AudioPlayerButton';
import { Avatar } from '../../../components/Avatar';
import { BottomNavBar } from '../../../components/BottomNavBar';
import { InlineComments } from '../../../components/InlineComments';
import { ReactionPicker } from '../../../components/ReactionPicker';
import { ReportDialog } from '../../../components/ReportDialog';
import { BookSpread } from '../../../components/BookSpread';
import { PhotoAttachButton } from '../../../components/PhotoAttachButton';
import { PredictionPhoto } from '../../../components/PredictionPhoto';
import { PredictWord } from '../../../components/PredictWord';
import { QuestionAnswerPanel } from '../../../components/QuestionAnswerPanel';
import { useAuth } from '../../../lib/auth';
import { formatAdvance, formatShortDateTime } from '../../../lib/datetime';
import { fetchFriendships, otherProfile, type FriendProfile } from '../../../lib/friends';
import { uploadVerdictPhoto } from '../../../lib/photos';
import {
  addRecipient,
  deletePrediction,
  fetchPrediction,
  fetchPredictionRecipients,
  isRevealed,
  removeRecipient,
  revealPredictionNow,
  setPredictionResultPhoto,
  setPredictionVerdict,
  type PredictionFeedItem,
  type PredictionRecipient,
} from '../../../lib/predictions';
import { supabase } from '../../../lib/supabase';
import { eyebrow, fonts, radius, spacing, type Colors } from '../../../lib/theme';
import { useColors } from '../../../lib/themeMode';

export default function PredictionDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useAuth();
  const router = useRouter();
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const userId = session?.user.id;

  const [prediction, setPrediction] = useState<PredictionFeedItem | null>(null);
  /* Fermée par défaut, comme sur la carte : on vient lire une prédiction, pas
     une conversation. La bulle l'ouvre quand on la veut. */
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);

  /** Définitive, et confirmée : c'est le seul recours de l'auteur sur un
   *  contenu qui parle de quelqu'un d'autre. */
  async function handleDelete() {
    const message =
      'Cette action est définitive : le contenu, les réactions et les commentaires seront perdus pour tout le Cercle.';
    const go = async () => {
      const { error: deleteError } = await deletePrediction(id);
      if (deleteError) {
        setError(`Suppression impossible : ${deleteError.message}`);
        return;
      }
      router.back();
    };
    // `Alert.alert` de React Native Web ne fait rien : sans ce repli, le
    // bouton semblerait ne pas répondre du tout sur le web.
    if (Platform.OS === 'web') {
      if (window.confirm(`Supprimer ce Predict ?\n\n${message}`)) await go();
      return;
    }
    Alert.alert('Supprimer ce Predict ?', message, [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Supprimer', style: 'destructive', onPress: go },
    ]);
  }
  const [author, setAuthor] = useState<{ username: string; avatar_url: string | null } | null>(null);
  const [recipients, setRecipients] = useState<PredictionRecipient[] | null>(null);
  const [friends, setFriends] = useState<FriendProfile[] | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [recipientsError, setRecipientsError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [recipientsOpen, setRecipientsOpen] = useState(false);
  const [revealing, setRevealing] = useState(false);
  const [revealError, setRevealError] = useState<string | null>(null);
  const [verdictPending, setVerdictPending] = useState(false);
  const [verdictError, setVerdictError] = useState<string | null>(null);
  // Photo choisie localement, en attente d'envoi — remplace la preuve déjà
  // posée seulement au prochain geste Réalisé/Manqué (contrairement au Fil,
  // cet écran permet de revenir sur le verdict à tout moment, donc pas
  // d'étape de confirmation séparée : la photo suit simplement le prochain
  // clic).
  const [verdictPhotoUri, setVerdictPhotoUri] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id || !userId) return;

    const { data: item, error: fetchError } = await fetchPrediction(id);
    if (fetchError) {
      setError(`Chargement impossible : ${fetchError.message}`);
      return;
    }
    if (!item) {
      setError('Predict introuvable.');
      return;
    }
    setError(null);
    setPrediction(item);

    const isAuthorNow = item.author_id === userId;

    // Les destinataires se chargent pour tout le monde — ouvrir un Predict
    // doit montrer toute l'audience, pas seulement à l'auteur. Seuls l'ajout
    // et le retrait restent réservés à l'auteur (chargement des amis inclus).
    // L'auteur (avatar + pseudo) se charge aussi pour tout le monde — sans
    // ça, impossible de savoir qui a écrit ce qu'on est en train de lire.
    const [{ data: recipientsData, error: recipientsFetchError }, friendshipsResult, { data: authorProfile }] =
      await Promise.all([
        fetchPredictionRecipients(id),
        isAuthorNow ? fetchFriendships(userId) : Promise.resolve({ data: null }),
        supabase.from('profiles').select('username, avatar_url').eq('id', item.author_id).maybeSingle(),
      ]);
    setAuthor(authorProfile ?? null);
    if (recipientsFetchError) {
      // Ne jamais confondre une vraie erreur avec « personne pour l'instant » :
      // sans ça, un souci de chargement se lisait comme une prédiction sans
      // aucun destinataire, ce qui n'est jamais vrai (l'auteur a toujours au
      // moins lui-même, et le scope choisi à la création peuple toujours
      // `prediction_access`).
      setRecipientsError(`Chargement des destinataires impossible : ${recipientsFetchError.message}`);
      setRecipients([]);
    } else {
      setRecipientsError(null);
      setRecipients(recipientsData ?? []);
    }
    if (isAuthorNow) {
      const accepted = (friendshipsResult.data ?? []).filter((f) => f.status === 'accepted');
      setFriends(accepted.map((f) => otherProfile(f, userId)));
    }
  }, [id, userId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const recipientIds = new Set((recipients ?? []).map((r) => r.user_id));
  const addableFriends = (friends ?? []).filter((f) => !recipientIds.has(f.id));

  async function handleAdd(friendId: string) {
    if (!id) return;
    setActionError(null);
    setPendingId(friendId);
    try {
      const { error: addError } = await addRecipient(id, friendId);
      if (addError) {
        setActionError(`Ajout impossible : ${addError.message}`);
        return;
      }
      await load();
    } finally {
      setPendingId(null);
    }
  }

  async function handleRemove(friendId: string) {
    if (!id) return;
    setActionError(null);
    setPendingId(friendId);
    try {
      const { error: removeError } = await removeRecipient(id, friendId);
      if (removeError) {
        setActionError(`Retrait impossible : ${removeError.message}`);
        return;
      }
      await load();
    } finally {
      setPendingId(null);
    }
  }

  function handleRevealNow() {
    if (!id) return;
    const title = isQuestion ? 'Clôturer ce Sondage maintenant ?' : 'Révéler ce Predict maintenant ?';
    const message = isQuestion
      ? 'Les réponses deviendront visibles pour tout le monde et tu pourras valider qui a deviné juste. Cette action est irréversible.'
      : 'Le contenu deviendra visible pour tes destinataires et le verdict pourra être donné. Cette action est irréversible.';

    const run = async () => {
      setRevealError(null);
      setRevealing(true);
      try {
        const { error: revealErr } = await revealPredictionNow(id);
        if (revealErr) {
          setRevealError(`${isQuestion ? 'Clôture' : 'Révélation'} impossible : ${revealErr.message}`);
          return;
        }
        await load();
      } finally {
        setRevealing(false);
      }
    };

    if (Platform.OS === 'web') {
      if (window.confirm(`${title}\n\n${message}`)) run();
      return;
    }
    Alert.alert(title, message, [
      { text: 'Annuler', style: 'cancel' },
      { text: isQuestion ? 'Clôturer' : 'Révéler', style: 'destructive', onPress: run },
    ]);
  }

  /** Contrairement au Fil (une seule affirmation possible), l'écran détail
   * permet de revenir sur le verdict à tout moment — la RPC elle-même ne
   * l'interdit pas (voir `set_prediction_verdict`, section 35), seule
   * `components/PredictionCard.tsx` s'auto-restreint à un geste unique. */
  async function handleSetVerdict(next: 'realized' | 'missed') {
    if (!id) return;
    setVerdictPending(true);
    setVerdictError(null);

    let photoPath: string | null = null;
    if (verdictPhotoUri) {
      const { path, error: uploadError } = await uploadVerdictPhoto(id, verdictPhotoUri);
      if (uploadError || !path) {
        setVerdictPending(false);
        setVerdictError('Envoi de la photo impossible.');
        return;
      }
      photoPath = path;
    }

    const { error: verdictErr } = await setPredictionVerdict(id, next, photoPath);
    setVerdictPending(false);
    if (verdictErr) {
      setVerdictError(`Action impossible : ${verdictErr.message}`);
      return;
    }
    setVerdictPhotoUri(null);
    setPrediction((prev) =>
      prev ? { ...prev, final_status: next, verdict_photo_path: photoPath ?? prev.verdict_photo_path } : prev
    );
  }

  /** Équivalent de `handleSetVerdict` pour un Sondage : pas de Réalisé/Manqué
   * à poser (voir `set_prediction_result_photo`, schema.sql section 52),
   * seulement la photo elle-même. */
  async function handleSaveResultPhoto() {
    if (!id || !verdictPhotoUri) return;
    setVerdictPending(true);
    setVerdictError(null);
    const { path, error: uploadError } = await uploadVerdictPhoto(id, verdictPhotoUri);
    if (uploadError || !path) {
      setVerdictPending(false);
      setVerdictError('Envoi de la photo impossible.');
      return;
    }
    const { error: photoErr } = await setPredictionResultPhoto(id, path);
    setVerdictPending(false);
    if (photoErr) {
      setVerdictError(`Action impossible : ${photoErr.message}`);
      return;
    }
    setVerdictPhotoUri(null);
    setPrediction((prev) => (prev ? { ...prev, verdict_photo_path: path } : prev));
  }

  const isAuthor = prediction && userId && prediction.author_id === userId;
  const revealed = prediction ? isRevealed(prediction, new Date()) : false;
  const isQuestion = prediction?.type === 'question';
  // Écart entre le scellé et la révélation — juste informatif, pour souligner
  // à quel point la prédiction a été anticipée. Sans objet pour un Sondage
  // (l'écart importe peu pour une question) ni pour une prédiction « ouverte » :
  // `reveal_at` n'y porte qu'un repère technique lointain tant qu'elle n'est
  // pas révélée. Une révélation immédiate n'affiche l'écart qu'une fois
  // effectivement révélée (quasi instantané), jamais avant.
  const advanceLabel =
    prediction && !isQuestion
      ? prediction.is_immediate
        ? revealed
          ? formatAdvance(new Date(prediction.created_at), new Date(prediction.reveal_at))
          : ''
        : prediction.open_ended && !revealed
          ? 'Révélation laissée à la discrétion de l’auteur'
          : formatAdvance(new Date(prediction.created_at), new Date(prediction.reveal_at))
      : '';

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <Text style={styles.back}>Retour</Text>
        </Pressable>
        <Text style={styles.headerTitle}>
          <PredictWord />
        </Text>
        {/* Le menu de gestion vit ICI depuis que l'accueil est une
            bibliothèque : la carte du Fil, qui le portait, n'existe plus. Sans
            ce déplacement, supprimer une prédiction serait devenu impossible —
            et l'auteur doit toujours pouvoir revenir en arrière. */}
        <Pressable onPress={() => setMenuOpen(true)} hitSlop={8} style={styles.headerMenu}>
          <MoreHorizontal size={22} color={colors.icon} strokeWidth={1.75} />
        </Pressable>
      </View>

      <Modal visible={menuOpen} transparent animationType="fade" onRequestClose={() => setMenuOpen(false)}>
        <Pressable style={styles.menuOverlay} onPress={() => setMenuOpen(false)}>
          <Pressable style={styles.menuBox} onPress={() => {}}>
            {isAuthor ? (
              <Pressable
                onPress={() => {
                  setMenuOpen(false);
                  handleDelete();
                }}
                style={styles.menuRow}
              >
                <Trash2 size={20} color={colors.danger} strokeWidth={1.75} />
                <Text style={[styles.menuRowText, styles.menuRowDanger]}>Supprimer</Text>
              </Pressable>
            ) : (
              <Pressable
                onPress={() => {
                  setMenuOpen(false);
                  setReportOpen(true);
                }}
                style={styles.menuRow}
              >
                <Flag size={20} color={colors.icon} strokeWidth={1.75} />
                <Text style={styles.menuRowText}>Signaler</Text>
              </Pressable>
            )}
          </Pressable>
        </Pressable>
      </Modal>

      <ReportDialog
        visible={reportOpen}
        target={{ kind: 'prediction', id }}
        reporterId={userId ?? ''}
        onClose={() => setReportOpen(false)}
      />

      <ScrollView contentContainerStyle={styles.scroll}>
        {error && <Text style={styles.error}>{error}</Text>}

        {!prediction && !error ? (
          <ActivityIndicator color={colors.text} style={styles.loader} />
        ) : prediction ? (
          <>
            {/* LE LIVRE OUVERT. À gauche qui parle, à droite ce qui est
                dit — la double page remplace l'empilement vertical d'avant
                (auteur, puis teaser, puis contenu), qui ne racontait rien.

                La page de droite reste blanche tant que la prédiction n'est
                pas révélée, et c'est tout le propos : un livre dont la
                seconde page est vide se lit d'un coup d'œil, là où un texte
                expliquant qu'il faut attendre demandait à être lu. */}
            <BookSpread
              underPages={(prediction.photo_path ? 1 : 0) + (prediction.verdict_photo_path ? 1 : 0)}
              left={
                <>
                  <Pressable
                    onPress={() => router.push(`/profile/${prediction.author_id}`)}
                    style={styles.pageAuteur}
                    hitSlop={4}
                  >
                    <Avatar
                      url={author?.avatar_url ?? null}
                      username={author?.username ?? ''}
                      size={52}
                    />
                    <Text style={styles.pageAuteurNom}>{author?.username ?? '…'}</Text>
                  </Pressable>
                  <View style={styles.pageFilet} />

                  {!isQuestion && !!prediction.teaser && (
                    <>
                      <Text style={styles.pageEyebrow}>Aperçu</Text>
                      <Text style={styles.pageTeaser}>{prediction.teaser}</Text>
                    </>
                  )}

                  <View style={styles.pageEspace} />

                  {revealed && (
                    <Text style={styles.pageDate}>
                      Scellé le {formatShortDateTime(new Date(prediction.created_at))}
                    </Text>
                  )}
                  {!!advanceLabel && <Text style={styles.pageDate}>{advanceLabel}</Text>}
                </>
              }
              right={
                (isQuestion || revealed || isAuthor) && prediction.content ? (
                  <>
                    <Text style={styles.pageEyebrow}>
                      {isQuestion ? 'La question' : 'Le Predict'}
                    </Text>
                    <View style={styles.pageFilet} />
                    <Text style={styles.pageContenu}>{prediction.content}</Text>
                    {prediction.audio_path && (
                      <View style={styles.audioRow}>
                        <AudioPlayerButton path={prediction.audio_path} />
                      </View>
                    )}
                    {prediction.photo_path && (
                      <View style={styles.photoRow}>
                        <PredictionPhoto bucket="content" path={prediction.photo_path} />
                      </View>
                    )}
                  </>
                ) : (
                  /* Rien. Une page blanche se comprend sans qu'on l'explique —
                     et un texte disant « cette page est vide » est la seule
                     façon de la rendre bavarde. Le sceau doré suffit à dire
                     que quelque chose y est retenu. */
                  <View style={styles.pageVierge}>
                    <View style={styles.pageSceau}>
                      <Text style={styles.pageSceauLettre}>P</Text>
                    </View>
                  </View>
                )
              }
            />

            {/* Réservé aux prédictions à révélation libre : une Programmée
                tient sa date (voir `reveal_prediction_now` dans schema.sql,
                qui refuse le cas de toute façon). */}
            {isAuthor && !revealed && prediction.open_ended && (
              <View style={styles.revealNowBox}>
                {revealError && <Text style={styles.error}>{revealError}</Text>}
                <Pressable
                  onPress={handleRevealNow}
                  disabled={revealing}
                  style={styles.revealNowButton}
                >
                  <Text style={styles.revealNowButtonText}>
                    {revealing
                      ? (isQuestion ? 'Clôture…' : 'Révélation…')
                      : (isQuestion ? 'Clôturer maintenant' : 'Révéler maintenant')}
                  </Text>
                </Pressable>
              </View>
            )}

            {/* Pour une Question, remplace entièrement le bloc Verdict :
                formulaire de réponse (définitive, un seul envoi) avant
                Clôture, liste des réponses + validation « Bien vu » / « Manqué »
                après — voir `QuestionAnswerPanel`. Visible à tout le monde,
                pas seulement à l'auteur (contrairement au Verdict d'une
                Déclaration). */}
            {isQuestion ? (
              <>
                <QuestionAnswerPanel
                  prediction={prediction}
                  isAuthor={!!isAuthor}
                  closed={revealed}
                  onAnswered={load}
                />
                {/* Un Sondage n'a pas de verdict Réalisé/Manqué, mais peut
                    tout de même recevoir une photo une fois clos — même
                    principe que la preuve visuelle d'une Déclaration, sans
                    le choix qui n'a pas de sens ici. */}
                {isAuthor && revealed && (
                  <View style={styles.sectionSpacing}>
                    <Text style={styles.eyebrow}>Photo</Text>
                    {prediction.verdict_photo_path && (
                      <View style={styles.photoRow}>
                        <PredictionPhoto bucket="verdict" path={prediction.verdict_photo_path} />
                      </View>
                    )}
                    <View style={styles.verdictPhotoAttach}>
                      <PhotoAttachButton
                        uri={verdictPhotoUri}
                        onChange={setVerdictPhotoUri}
                        disabled={verdictPending}
                        label={prediction.verdict_photo_path ? 'Remplacer la photo' : 'Joindre une photo'}
                      />
                      {verdictPhotoUri && (
                        <Pressable
                          onPress={handleSaveResultPhoto}
                          disabled={verdictPending}
                          style={styles.revealNowButton}
                        >
                          <Text style={styles.revealNowButtonText}>
                            {verdictPending ? 'Envoi…' : 'Enregistrer la photo'}
                          </Text>
                        </Pressable>
                      )}
                    </View>
                    {verdictError && <Text style={styles.error}>{verdictError}</Text>}
                  </View>
                )}
              </>
            ) : (
              /* Seul endroit où revenir sur un verdict déjà posé est possible
                 (le Fil, lui, ne propose Réalisé/Manqué qu'une fois, tant que
                 rien n'est encore affirmé) — réservé à l'auteur, une fois la
                 prédiction révélée. */
              isAuthor && revealed && (
                <View style={styles.sectionSpacing}>
                  <Text style={styles.eyebrow}>Verdict</Text>
                  {/* Tant que rien n'est affirmé, les deux boutons : c'est
                      ici qu'on peut trancher sans repasser par le Fil. Une
                      fois le verdict posé, seul celui qu'on a choisi reste —
                      les deux côte à côte, l'un allumé et l'autre éteint,
                      laissaient croire qu'il restait un choix à faire alors
                      que la décision était prise. Le verdict devient donc
                      définitif : c'est ce qui donne son poids au tampon
                      « ENCORE RAISON », qui ne vaudrait rien s'il suffisait
                      de le retourner. */}
                  {prediction.final_status === 'pending' ? (
                    <View style={styles.verdictChoiceRow}>
                      <Pressable
                        onPress={() => handleSetVerdict('realized')}
                        disabled={verdictPending}
                        style={styles.verdictChoice}
                      >
                        <Text style={styles.verdictChoiceText}>Réalisé</Text>
                      </Pressable>
                      <Pressable
                        onPress={() => handleSetVerdict('missed')}
                        disabled={verdictPending}
                        style={styles.verdictChoice}
                      >
                        <Text style={styles.verdictChoiceText}>Manqué</Text>
                      </Pressable>
                    </View>
                  ) : (
                    <View style={styles.verdictChoiceRow}>
                      <View style={[styles.verdictChoice, styles.verdictChoiceActive]}>
                        <Text style={[styles.verdictChoiceText, styles.verdictChoiceTextActive]}>
                          {prediction.final_status === 'realized' ? 'Réalisé' : 'Manqué'}
                        </Text>
                      </View>
                    </View>
                  )}
                  {prediction.verdict_photo_path && (
                    <View style={styles.photoRow}>
                      <PredictionPhoto bucket="verdict" path={prediction.verdict_photo_path} />
                    </View>
                  )}
                  <View style={styles.verdictPhotoAttach}>
                    <PhotoAttachButton
                      uri={verdictPhotoUri}
                      onChange={setVerdictPhotoUri}
                      disabled={verdictPending}
                      label={prediction.verdict_photo_path ? 'Remplacer la photo' : 'Joindre une photo'}
                    />
                  </View>
                  {verdictError && <Text style={styles.error}>{verdictError}</Text>}
                </View>
              )
            )}

            {/* Prédiction adressée à un groupe : c'est LE GROUPE le
                destinataire. Énumérer ses membres n'apprend rien et noie
                l'information sous une liste de pseudos — d'autant que le
                groupe peut changer de composition. Le repli sur la liste
                détaillée reste possible si le nom manque (groupe supprimé). */}
            {prediction.scope === 'group' && prediction.group_name ? (
              <View style={styles.sectionSpacing}>
                <Text style={styles.eyebrow}>Destinataire</Text>
                <Text style={styles.groupTarget}>{prediction.group_name}</Text>
              </View>
            ) : (
            <Pressable
              onPress={() => setRecipientsOpen((o) => !o)}
              style={[styles.sectionToggle, styles.sectionSpacing]}
              hitSlop={4}
            >
              <Text style={styles.eyebrow}>Destinataires</Text>
              <Text style={styles.chevron}>{recipientsOpen ? ' ▲' : ' ▼'}</Text>
            </Pressable>
            )}

            {recipientsOpen && (
              <>
                {recipientsError && <Text style={styles.error}>{recipientsError}</Text>}
                {actionError && <Text style={styles.error}>{actionError}</Text>}
                {recipients === null ? (
                  <ActivityIndicator color={colors.text} style={styles.loader} />
                ) : recipients.length === 0 ? (
                  <Text style={styles.hint}>Personne pour l’instant.</Text>
                ) : (
                  recipients.map((r) => (
                    <View key={r.user_id} style={styles.row}>
                      <Text style={styles.username}>{r.profile.username}</Text>
                      {isAuthor && (
                        <Pressable
                          onPress={() => handleRemove(r.user_id)}
                          disabled={pendingId === r.user_id}
                          style={styles.pillOutline}
                        >
                          <Text style={styles.pillOutlineText}>Retirer</Text>
                        </Pressable>
                      )}
                    </View>
                  ))
                )}

                {/* Ajouter un destinataire n'a plus de sens une fois la
                    prédiction révélée — réservé à l'auteur, avant révélation. */}
                {isAuthor && !revealed && (
                  <>
                    <Text style={[styles.eyebrow, styles.sectionSpacing]}>Ajouter depuis le Cercle</Text>
                    {friends === null ? (
                      <ActivityIndicator color={colors.text} style={styles.loader} />
                    ) : addableFriends.length === 0 ? (
                      <Text style={styles.hint}>
                        Tout ton Cercle a déjà accès, ou tu n’as pas encore d’ami.
                      </Text>
                    ) : (
                      addableFriends.map((friend) => (
                        <View key={friend.id} style={styles.row}>
                          <View style={styles.usernameRow}>
                            <Avatar url={friend.avatar_url} username={friend.username} size={24} />
                            <Text style={styles.username}>{friend.username}</Text>
                          </View>
                          <Pressable
                            onPress={() => handleAdd(friend.id)}
                            disabled={pendingId === friend.id}
                            style={styles.pillGold}
                          >
                            <Text style={styles.pillGoldText}>Ajouter</Text>
                          </Pressable>
                        </View>
                      ))
                    )}
                  </>
                )}
              </>
            )}

            {/* Deux pictos, aucun intitulé — exactement la rangée du bas des
                cartes du Fil. « Réactions » et « Discussion » annonçaient en
                gros titre deux choses qu'un pouce et une bulle disent déjà,
                et la discussion s'étalait sous la prédiction qu'on venait
                lire, qu'on ait ou non l'intention de la lire. La bulle
                l'ouvre maintenant, comme sur la carte. */}
            <View style={[styles.reactionRow, styles.sectionSpacing]}>
              <ReactionPicker
                predictionId={id}
                userId={userId!}
                initialCounts={prediction.emoji_counts ?? {}}
                initialMine={prediction.my_emoji_reaction ?? null}
              />
              <Pressable
                onPress={() => setCommentsOpen((o) => !o)}
                style={styles.commentsToggle}
                hitSlop={6}
                accessibilityRole="button"
                accessibilityLabel={
                  commentsOpen ? 'Fermer les commentaires' : 'Ouvrir les commentaires'
                }
              >
                <MessageCircle
                  size={21}
                  color={commentsOpen ? colors.text : colors.textFaint}
                  strokeWidth={1.75}
                  fill={commentsOpen ? colors.text : 'none'}
                />
              </Pressable>
            </View>

            {commentsOpen && (
              <InlineComments
                predictionId={id}
                userId={userId!}
                revealed={revealed}
                isPredictionAuthor={!!isAuthor}
              />
            )}
          </>
        ) : null}
      </ScrollView>

      <BottomNavBar />
    </SafeAreaView>
  );
}

function createStyles(colors: Colors) {
  return StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerTitle: {
    fontFamily: fonts.display,
    fontSize: 17,
    color: colors.text,
  },
  back: { fontSize: 15, color: colors.text, width: 56 },
  headerSpacer: { width: 56 },
  headerMenu: { width: 56, alignItems: 'flex-end' },
  menuOverlay: {
    flex: 1,
    backgroundColor: 'rgba(28, 39, 55, 0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  menuBox: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: colors.surfaceRaised,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  menuRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16 },
  menuRowText: { fontSize: 16, color: colors.text },
  menuRowDanger: { color: colors.danger },
  scroll: { padding: spacing.lg, paddingBottom: 48 },
  loader: { marginTop: 24 },
  eyebrow: { ...eyebrow(colors) },
  // --- les deux pages du livre ---------------------------------------
  pageAuteur: { alignItems: 'center', gap: 8 },
  pageAuteurNom: { fontFamily: fonts.display, fontSize: 17, color: colors.text, textAlign: 'center' },
  pageFilet: { height: 1, backgroundColor: colors.accent, opacity: 0.5, marginVertical: 8 },
  pageEyebrow: {
    fontFamily: fonts.label,
    fontSize: 10,
    letterSpacing: 1.4,
    color: colors.textFaint,
    textTransform: 'uppercase',
  },
  pageTeaser: { fontSize: 14, color: colors.textMuted, fontStyle: 'italic', lineHeight: 20 },
  pageContenu: { fontSize: 15, color: colors.text, lineHeight: 22 },
  pageEspace: { flex: 1, minHeight: 8 },
  pageDate: { fontFamily: fonts.label, fontSize: 11, color: colors.textFaint },
  pageVierge: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 24 },
  // Un cachet de cire pâli, imprimé dans le papier plutôt que posé dessus :
  // discret, mais il dit que la page attend.
  pageSceau: {
    width: 54,
    height: 54,
    borderRadius: 27,
    borderWidth: 2,
    borderColor: colors.accent,
    opacity: 0.35,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pageSceauLettre: { fontFamily: fonts.display, fontSize: 24, color: colors.accent },
  // Un peu plus marqué que les autres repères secondaires de cet écran :
  // savoir quand le Predict a été scellé reste une information importante,
  // pas un simple détail à estomper.
  audioRow: { marginTop: 16 },
  photoRow: { marginTop: 16, width: '100%' },
  revealNowBox: { alignItems: 'center', marginTop: spacing.md },
  // Même contour noir sur fond blanc que les autres actions de cet écran
  // (« Ajouter », « Retirer ») — pas un remplissage jaune, réservé au FAB.
  revealNowButton: {
    borderWidth: 1,
    borderColor: colors.text,
    borderRadius: radius.pill,
    paddingHorizontal: 20,
    paddingVertical: 11,
    backgroundColor: colors.surface,
  },
  revealNowButtonText: { fontSize: 15, fontWeight: '700', color: colors.text },
  sectionSpacing: { marginTop: spacing.lg, marginBottom: 8 },
  sectionToggle: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start' },
  verdictChoiceRow: { flexDirection: 'row', gap: 10, marginTop: 10 },
  // Contour noir sur blanc par défaut (même registre que « Révéler
  // maintenant », « Ajouter » plus bas) ; le choix retenu bascule en plein
  // noir — jamais de rouge/vert, un verdict tranché « s'impose » par le
  // contraste plutôt que par une couleur de statut.
  verdictChoice: {
    flex: 1,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.text,
    borderRadius: radius.pill,
    paddingVertical: 11,
    backgroundColor: colors.surface,
  },
  verdictChoiceActive: { backgroundColor: colors.text },
  verdictPhotoAttach: { marginTop: 12, gap: 6 },
  verdictChoiceText: { fontSize: 14, fontWeight: '700', color: colors.text },
  verdictChoiceTextActive: { color: colors.surface },
  chevron: { fontSize: 13, color: colors.textFaint },
  groupTarget: { fontFamily: fonts.bodyEmphasis, fontSize: 17, color: colors.text, marginTop: 4 },
  // Le pouce et la bulle sur une seule ligne, écartés comme au bas d'une
  // carte du Fil.
  reactionRow: { flexDirection: 'row', alignItems: 'center', gap: 18, marginTop: 6 },
  commentsToggle: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  hint: { fontSize: 14, color: colors.textFaint, lineHeight: 20 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
  },
  username: { fontSize: 15, color: colors.text, fontWeight: '600' },
  usernameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  // Actions en ligne, allégées comme dans le Cercle : contour plutôt que
  // jaune plein.
  pillGold: {
    borderWidth: 1,
    borderColor: colors.text,
    borderRadius: radius.pill,
    paddingHorizontal: 14,
    paddingVertical: 7,
    backgroundColor: colors.surface,
  },
  pillGoldText: { color: colors.text, fontSize: 15, fontWeight: '700' },
  pillOutline: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  pillOutlineText: { color: colors.textMuted, fontSize: 15, fontWeight: '600' },
  error: {
    color: colors.danger,
    backgroundColor: colors.dangerSoft,
    borderRadius: radius.sm,
    padding: 12,
    fontSize: 14,
    marginBottom: spacing.md,
  },
  });
}
