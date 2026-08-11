import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation, useRouter } from 'expo-router';
import { Check } from 'lucide-react-native';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { Text } from '../../components/Text';
import { TextInput } from '../../components/TextInput';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Avatar } from '../../components/Avatar';
import { CalendarPicker } from '../../components/CalendarPicker';
import { PredictionRecorder } from '../../components/PredictionRecorder';
import { PredictionSeal } from '../../components/PredictionSeal';
import { PredictWord } from '../../components/PredictWord';
import { SelectField, type SelectOption } from '../../components/SelectField';
import { setPredictionAudioPath, uploadPredictionAudio } from '../../lib/audio';
import { useAuth } from '../../lib/auth';
import { formatCountdown, formatRevealAt } from '../../lib/datetime';
import { fetchFriendships, otherProfile, type FriendProfile } from '../../lib/friends';
import { fetchGroups, type FriendGroup } from '../../lib/groups';
import {
  MAX_CONTENT_LENGTH,
  MAX_TEASER_LENGTH,
  MIN_REVEAL_DELAY_MS,
  computeOpenEndedRevealAt,
  createPrediction,
  extractMentionedUsernames,
  predictionErrorMessage,
  type PredictionScope,
} from '../../lib/predictions';
import { type AnswerFormat, type PredictionType } from '../../lib/questions';
import { fonts, radius, spacing, wax, type Colors } from '../../lib/theme';
import { useColors } from '../../lib/themeMode';

type ContentMode = 'text' | 'audio';
/** `scheduled` (« Programmée ») : date fixée par l'auteur. `open_ended`
 * (« Libre ») : révélée quand l'auteur le déclenche depuis son écran — ou
 * tout de suite si `revealNow` est cochée à la création (voir plus bas), au
 * lieu d'attendre ce déclenchement manuel. */
type RevealTiming = 'scheduled' | 'open_ended';

/** Contenu écrit à la place du texte quand la prédiction est uniquement vocale. */
const AUDIO_PLACEHOLDER = '🎙️ Message vocal';

/** Teaser de repli pour une Question en message vocal : le champ Teaser est
 * masqué en mode Question (rien à teaser, la question est visible dès la
 * création — voir schema.sql section 42), mais `create_prediction` l'exige
 * toujours (`predictions_teaser_length`) — rien à en tirer sans texte à
 * résumer. */
const AUDIO_QUESTION_TEASER = 'Nouvelle question';

/** Deux options minimum pour qu'un choix multiple ait un sens. */
const MIN_ANSWER_OPTIONS = 2;
/** Court, façon sondage — distinct de `MAX_ANSWER_LENGTH` (lib/questions.ts),
 * qui borne la réponse d'un répondant, pas le libellé d'une option posée par
 * l'auteur à la création. */
const MAX_OPTION_LENGTH = 60;

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

const HOUR_OPTIONS: SelectOption<number>[] = Array.from({ length: 24 }, (_, i) => ({
  value: i,
  label: pad2(i),
}));

/** Quarts d'heure uniquement (:00/:15/:30/:45) — un choix plus rapide qu'une minute exacte. */
const MINUTE_OPTIONS: SelectOption<number>[] = [0, 15, 30, 45].map((m) => ({
  value: m,
  label: pad2(m),
}));

export default function NewPredictionScreen() {
  const { session, defaultScope } = useAuth();
  const router = useRouter();
  const navigation = useNavigation();
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const userId = session?.user.id;

  const [predictType, setPredictType] = useState<PredictionType>('declaration');
  const isQuestion = predictType === 'question';
  const [answerFormat, setAnswerFormat] = useState<AnswerFormat>('text');
  const [answerOptions, setAnswerOptions] = useState<string[]>(['', '']);
  const isChoiceFormat = isQuestion && answerFormat === 'choice';

  const [teaser, setTeaser] = useState('');
  const [contentMode, setContentMode] = useState<ContentMode>('text');
  const [content, setContent] = useState('');
  const [audioUri, setAudioUri] = useState<string | null>(null);
  // La date reste un choix explicite, mais l'heure est facultative : pré-remplie
  // à midi, l'auteur n'a besoin de la toucher que s'il veut une autre heure.
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [hour, setHour] = useState<number | null>(12);
  const [minute, setMinute] = useState<number | null>(0);
  const [revealTiming, setRevealTiming] = useState<RevealTiming>('scheduled');
  // Uniquement pertinent en mode « Libre » : coché, la prédiction est révélée
  // dès sa création plutôt que d'attendre un déclenchement manuel ultérieur.
  const [revealNow, setRevealNow] = useState(false);

  const [scope, setScope] = useState<PredictionScope>('circle');
  // Réglage Confidentialité : pré-sélectionne la portée par défaut de
  // l'auteur, une fois son profil chargé — un seul alignement, pas un
  // verrou : l'auteur reste libre de choisir une autre portée ensuite.
  useEffect(() => {
    if (defaultScope) setScope(defaultScope);
  }, [defaultScope]);
  const [friends, setFriends] = useState<FriendProfile[] | null>(null);
  const [selectedFriendIds, setSelectedFriendIds] = useState<Set<string>>(new Set());
  const [groups, setGroups] = useState<FriendGroup[] | null>(null);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [showSeal, setShowSeal] = useState(false);

  useEffect(() => {
    if (!userId) return;
    fetchFriendships(userId).then(({ data }) => {
      const accepted = (data ?? []).filter((f) => f.status === 'accepted');
      setFriends(accepted.map((f) => otherProfile(f, userId)));
    });
    fetchGroups(userId).then(({ data }) => setGroups(data ?? []));
  }, [userId]);

  const trimmedTeaser = teaser.trim();
  const trimmedContent = content.trim();
  const remaining = MAX_CONTENT_LENGTH - trimmedContent.length;
  const hasUnsavedContent =
    trimmedTeaser.length > 0 || trimmedContent.length > 0 || !!audioUri || !!selectedDate;

  // Avertit avant d'abandonner une prédiction en cours de rédaction — sans ça,
  // un retour accidentel (bouton « Annuler », geste retour) perdait tout sans
  // prévenir. Ignoré une fois scellée (`showSeal`) : `router.back()` déclenché
  // par le sceau ne doit pas redéclencher cette même confirmation.
  useEffect(() => {
    const unsubscribe = navigation.addListener('beforeRemove', (e) => {
      if (showSeal || !hasUnsavedContent) return;
      e.preventDefault();

      const message = 'Ce Predict n’est pas scellé : il sera perdu si tu quittes maintenant.';
      const discard = () => navigation.dispatch(e.data.action);

      if (Platform.OS === 'web') {
        if (window.confirm(`Abandonner ce Predict ?\n\n${message}`)) discard();
        return;
      }
      Alert.alert('Abandonner ce Predict ?', message, [
        { text: 'Continuer la rédaction', style: 'cancel' },
        { text: 'Abandonner', style: 'destructive', onPress: discard },
      ]);
    });
    return unsubscribe;
  }, [navigation, hasUnsavedContent, showSeal]);

  // Repère technique lointain quand aucune date n'est fixée — jamais affiché
  // tel quel (cf. `computeOpenEndedRevealAt`) : seule la révélation manuelle
  // (ou `revealNow` ci-dessous) compte pour une prédiction « Libre ». Avec
  // `revealNow`, la valeur exacte n'a pas d'importance : la base pose son
  // propre `now()` de toute façon (voir `create_prediction`, `isImmediate`) —
  // celle-ci ne sert qu'à satisfaire la validation locale.
  const revealAt =
    revealTiming === 'open_ended'
      ? revealNow
        ? new Date()
        : computeOpenEndedRevealAt()
      : selectedDate && hour !== null && minute !== null
        ? new Date(
            selectedDate.getFullYear(),
            selectedDate.getMonth(),
            selectedDate.getDate(),
            hour,
            minute,
            0,
            0
          )
        : null;

  function toggleFriend(id: string) {
    setSelectedFriendIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function updateOption(index: number, value: string) {
    setAnswerOptions((prev) => prev.map((o, i) => (i === index ? value : o)));
  }

  function addOption() {
    setAnswerOptions((prev) => [...prev, '']);
  }

  /** Toujours au moins `MIN_ANSWER_OPTIONS` champs à l'écran — en dessous, un
   * choix multiple n'a plus de sens. */
  function removeOption(index: number) {
    setAnswerOptions((prev) => (prev.length > MIN_ANSWER_OPTIONS ? prev.filter((_, i) => i !== index) : prev));
  }

  /** Vérifications locales, pour éviter un aller-retour réseau inutile. */
  function validate(): string | null {
    // Pas de Teaser en mode Question : le champ est masqué (voir le JSX),
    // rien à valider ici pour ce mode.
    if (!isQuestion) {
      if (!trimmedTeaser) return 'Écris un teaser : l’accroche que verront tes destinataires.';
      if (trimmedTeaser.length > MAX_TEASER_LENGTH) {
        return `Le teaser ne peut pas dépasser ${MAX_TEASER_LENGTH} caractères.`;
      }
    }
    if (contentMode === 'text') {
      if (!trimmedContent) {
        return isQuestion ? 'Écris ta question.' : 'Écris le contenu secret de ton Predict.';
      }
      if (trimmedContent.length > MAX_CONTENT_LENGTH) {
        return isQuestion
          ? `La question ne peut pas dépasser ${MAX_CONTENT_LENGTH} caractères.`
          : `Le contenu secret ne peut pas dépasser ${MAX_CONTENT_LENGTH} caractères.`;
      }
    } else if (!audioUri) {
      return isQuestion ? 'Enregistre ta question avant de la publier.' : 'Enregistre ton Predict avant de le sceller.';
    }
    if (isChoiceFormat) {
      const trimmedOptions = answerOptions.map((o) => o.trim()).filter(Boolean);
      if (trimmedOptions.length < MIN_ANSWER_OPTIONS) {
        return `Ajoute au moins ${MIN_ANSWER_OPTIONS} options.`;
      }
      if (answerOptions.some((o) => o.trim().length > MAX_OPTION_LENGTH)) {
        return `Une option ne peut pas dépasser ${MAX_OPTION_LENGTH} caractères.`;
      }
    }
    if (revealTiming === 'scheduled') {
      if (!revealAt) {
        return 'Choisis la date de la révélation.';
      }
      if (revealAt.getTime() - Date.now() < MIN_REVEAL_DELAY_MS) {
        return 'La révélation doit être au moins une minute après maintenant.';
      }
    }
    if (scope === 'selected' && selectedFriendIds.size === 0) {
      return 'Choisis au moins un ami, ou passe sur « Tous ».';
    }
    if (scope === 'group' && !selectedGroupId) {
      return 'Choisis un groupe.';
    }
    return null;
  }

  async function handleSubmit() {
    setError(null);

    const validationError = validate();
    if (validationError || !revealAt) {
      setError(validationError);
      return;
    }

    if (!session) {
      setError('Session expirée. Reconnecte-toi.');
      return;
    }

    setSubmitting(true);
    try {
      // « @pseudo » dans la prédiction (le contenu secret, pas le teaser
      // public) : n'accorde un accès que pour un pseudo qui correspond
      // vraiment à un ami accepté — revérifié côté base de toute façon
      // (create_prediction), ce filtre évite juste un appel inutile pour un
      // « @ » qui ne désigne personne. Sans objet en message vocal : rien à
      // repérer dans un placeholder.
      const mentionedUsernames =
        contentMode === 'text' ? extractMentionedUsernames(trimmedContent) : [];
      const mentionedFriendIds = (friends ?? [])
        .filter((f) => mentionedUsernames.includes(f.username.toLowerCase()))
        .map((f) => f.id);

      // Le Teaser reste requis côté base même en mode Question (où le champ
      // est masqué) : on en dérive un du texte de la question, faute de mieux
      // en message vocal.
      const effectiveTeaser = isQuestion
        ? contentMode === 'text'
          ? trimmedContent.slice(0, MAX_TEASER_LENGTH)
          : AUDIO_QUESTION_TEASER
        : trimmedTeaser;

      const { data: predictionId, error: insertError } = await createPrediction({
        type: predictType,
        teaser: effectiveTeaser,
        content: contentMode === 'text' ? trimmedContent : AUDIO_PLACEHOLDER,
        revealAt,
        scope,
        friendIds: Array.from(selectedFriendIds),
        groupId: selectedGroupId,
        mentionedFriendIds,
        openEnded: revealTiming === 'open_ended',
        isImmediate: revealTiming === 'open_ended' && revealNow,
        answerFormat: isQuestion ? answerFormat : undefined,
        answerOptions: isChoiceFormat ? answerOptions.map((o) => o.trim()).filter(Boolean) : undefined,
      });

      if (insertError) {
        setError(predictionErrorMessage(insertError));
        return;
      }

      // La prédiction existe déjà à ce stade (le texte ou son placeholder est
      // scellé) ; le message vocal s'y ajoute en deux étapes séparées, faute
      // de pouvoir connaître son identifiant avant sa création.
      if (contentMode === 'audio' && audioUri && predictionId) {
        const { path, error: uploadError } = await uploadPredictionAudio(predictionId, audioUri);
        if (uploadError || !path) {
          setError(`Predict créé, mais l’envoi de l’audio a échoué : ${uploadError?.message ?? 'erreur inconnue'}`);
          return;
        }
        const { error: pathError } = await setPredictionAudioPath(predictionId, path);
        if (pathError) {
          setError(`Predict créé, mais l’association de l’audio a échoué : ${pathError.message}`);
          return;
        }
      }

      setShowSeal(true);
    } catch (unexpected) {
      const message =
        unexpected instanceof Error ? unexpected.message : String(unexpected);
      setError(
        /failed to fetch|network request failed/i.test(message)
          ? 'Connexion au serveur impossible. Vérifie ta connexion internet.'
          : message || 'Une erreur inattendue est survenue.'
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <PredictionSeal visible={showSeal} onFinish={() => router.back()} />

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} disabled={submitting} hitSlop={8}>
            <Text style={styles.cancel}>Annuler</Text>
          </Pressable>
          {/* Titres de section : « Predict » s'écrit en clair plutôt qu'avec
              `PredictWord`. Le titre est déjà entièrement en gras, donc le P
              renforcé du composant n'ajoutait rien — il créait juste une
              rupture de graisse au milieu du mot. */}
          <Text style={styles.headerTitle}>Nouveau Predict</Text>
          {/* Espaceur de même largeur que « Annuler », pour centrer le titre. */}
          <View style={styles.headerSpacer} />
        </View>

        <View style={styles.predictTypeWrap}>
          <View style={styles.scopeRow}>
            <Pressable
              onPress={() => setPredictType('declaration')}
              disabled={submitting}
              style={[styles.scopeOption, predictType === 'declaration' && styles.scopeOptionActive]}
            >
              <Text style={[styles.scopeText, predictType === 'declaration' && styles.scopeTextActive]}>
                Predict
              </Text>
            </Pressable>
            <Pressable
              onPress={() => setPredictType('question')}
              disabled={submitting}
              style={[styles.scopeOption, predictType === 'question' && styles.scopeOptionActive]}
            >
              <Text style={[styles.scopeText, predictType === 'question' && styles.scopeTextActive]}>
                Question
              </Text>
            </Pressable>
          </View>
          {/* Rappelle la règle du type choisi, pour rester intuitif sans
              notice — même sous beaucoup de types de contenu différents. */}
          <Text style={styles.predictTypeHint}>
            {isQuestion
              ? 'Tout le monde peut répondre ; les réponses restent masquées jusqu’à la clôture.'
              : 'Un secret que tu écris et scelles : tes destinataires ne le liront qu’à la révélation.'}
          </Text>
        </View>

        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
        >
          {!isQuestion && (
            <>
              <Text style={styles.label}>Teaser</Text>
              <Text style={styles.sectionHint}>
                Une phrase courte, volontairement tronquée — c’est tout ce qu’affiche l’enveloppe scellée dans le
                fil, avant révélation.
              </Text>
              <TextInput
                value={teaser}
                onChangeText={setTeaser}
                placeholder="Donnez un indice sur votre Predict"
                placeholderTextColor={colors.textFaint}
                multiline
                editable={!submitting}
                maxLength={MAX_TEASER_LENGTH}
                style={[styles.input, styles.teaserInput]}
              />
            </>
          )}

          <Text style={[styles.label, styles.sectionLabel]}>
            {isQuestion ? 'Open Predict' : 'Mon Predict'}
          </Text>
          <View style={styles.scopeRow}>
            <Pressable
              onPress={() => setContentMode('text')}
              disabled={submitting}
              style={[styles.scopeOption, contentMode === 'text' && styles.scopeOptionActive]}
            >
              <Text style={[styles.scopeText, contentMode === 'text' && styles.scopeTextActive]}>
                Texte
              </Text>
            </Pressable>
            <Pressable
              onPress={() => setContentMode('audio')}
              disabled={submitting}
              style={[styles.scopeOption, contentMode === 'audio' && styles.scopeOptionActive]}
            >
              <Text style={[styles.scopeText, contentMode === 'audio' && styles.scopeTextActive]}>
                Message vocal
              </Text>
            </Pressable>
          </View>

          {contentMode === 'text' ? (
            <>
              <TextInput
                value={content}
                onChangeText={setContent}
                placeholder={
                  isQuestion
                    ? 'Posez votre question à votre cercle...'
                    : 'Écrivez votre Predict ici et prouvez à votre cercle, qu’une fois encore, vous aviez raison'
                }
                placeholderTextColor={colors.textFaint}
                multiline
                editable={!submitting}
                maxLength={MAX_CONTENT_LENGTH}
                style={[styles.input, styles.contentInput, styles.fieldSpacing]}
              />
              <Text style={[styles.counter, remaining < 20 && styles.counterLow]}>
                {remaining} caractères restants
              </Text>
            </>
          ) : (
            <View style={styles.fieldSpacing}>
              <PredictionRecorder uri={audioUri} onChange={setAudioUri} disabled={submitting} />
            </View>
          )}

          {isQuestion && (
            <>
              <Text style={[styles.label, styles.sectionLabel]}>Format de réponse</Text>
              <View style={styles.scopeRow}>
                <Pressable
                  onPress={() => setAnswerFormat('text')}
                  disabled={submitting}
                  style={[styles.scopeOption, answerFormat === 'text' && styles.scopeOptionActive]}
                >
                  <Text style={[styles.scopeText, answerFormat === 'text' && styles.scopeTextActive]}>
                    Réponse libre
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => setAnswerFormat('choice')}
                  disabled={submitting}
                  style={[styles.scopeOption, answerFormat === 'choice' && styles.scopeOptionActive]}
                >
                  <Text style={[styles.scopeText, answerFormat === 'choice' && styles.scopeTextActive]}>
                    Choix multiples
                  </Text>
                </Pressable>
              </View>

              {isChoiceFormat && (
                <View style={styles.fieldSpacing}>
                  {answerOptions.map((option, index) => (
                    <View key={index} style={styles.optionRow}>
                      <TextInput
                        value={option}
                        onChangeText={(value) => updateOption(index, value)}
                        placeholder={`Option ${index + 1}`}
                        placeholderTextColor={colors.textFaint}
                        editable={!submitting}
                        maxLength={MAX_OPTION_LENGTH}
                        style={[styles.input, styles.optionInput]}
                      />
                      {answerOptions.length > MIN_ANSWER_OPTIONS && (
                        <Pressable
                          onPress={() => removeOption(index)}
                          disabled={submitting}
                          hitSlop={8}
                          style={styles.removeOptionButton}
                        >
                          <Text style={styles.removeOptionButtonText}>✕</Text>
                        </Pressable>
                      )}
                    </View>
                  ))}
                  <Pressable onPress={addOption} disabled={submitting} style={styles.addOptionButton}>
                    <Text style={styles.addOptionButtonText}>+ Ajouter une option</Text>
                  </Pressable>
                </View>
              )}
            </>
          )}

          <Text style={[styles.label, styles.sectionLabel]}>{isQuestion ? 'Clôture' : 'Révélation'}</Text>

          <View style={styles.scopeRow}>
            <Pressable
              onPress={() => setRevealTiming('scheduled')}
              disabled={submitting}
              style={[styles.scopeOption, revealTiming === 'scheduled' && styles.scopeOptionActive]}
            >
              <Text style={[styles.scopeText, revealTiming === 'scheduled' && styles.scopeTextActive]}>
                Programmée
              </Text>
            </Pressable>
            <Pressable
              onPress={() => setRevealTiming('open_ended')}
              disabled={submitting}
              style={[styles.scopeOption, revealTiming === 'open_ended' && styles.scopeOptionActive]}
            >
              <Text style={[styles.scopeText, revealTiming === 'open_ended' && styles.scopeTextActive]}>
                Libre
              </Text>
            </Pressable>
          </View>

          {revealTiming === 'open_ended' ? (
            <>
              <Text style={[styles.sectionHint, styles.fieldSpacing]}>
                {revealNow
                  ? <>Ce <PredictWord /> sera révélé dès la validation : ton Cercle pourra tout de suite donner son avis.</>
                  : <>Tu pourras révéler ce <PredictWord /> quand tu veux.</>}
              </Text>
              <Pressable
                onPress={() => setRevealNow((prev) => !prev)}
                disabled={submitting}
                style={[styles.revealNowRow, styles.fieldSpacing]}
              >
                <View style={[styles.checkbox, revealNow && styles.checkboxChecked]}>
                  {revealNow && <Check size={12} color={colors.background} strokeWidth={2.5} />}
                </View>
                <Text style={styles.revealNowText}>Révéler immédiatement</Text>
              </Pressable>
            </>
          ) : (
            <>
              <View style={styles.fieldSpacing}>
                <CalendarPicker value={selectedDate} onChange={setSelectedDate} disabled={submitting} />
              </View>

              <View style={[styles.row, styles.fieldSpacing]}>
                <View style={styles.timeField}>
                  <SelectField
                    label="Heure"
                    value={hour}
                    options={HOUR_OPTIONS}
                    placeholder="HH"
                    onChange={setHour}
                    disabled={submitting}
                  />
                </View>
                <View style={styles.timeField}>
                  <SelectField
                    label="Minute"
                    value={minute}
                    options={MINUTE_OPTIONS}
                    placeholder="MM"
                    onChange={setMinute}
                    disabled={submitting}
                  />
                </View>
              </View>

              {/* Rien tant qu'aucun des champs n'est renseigné : à l'ouverture,
                  un rappel se lirait comme une erreur alors que l'utilisateur
                  n'a encore rien choisi. */}
              {revealAt && (
                <Text style={styles.preview}>
                  Se révélera {formatRevealAt(revealAt)} —{' '}
                  {formatCountdown(revealAt, new Date())}.
                </Text>
              )}
            </>
          )}

          <Text style={[styles.label, styles.sectionLabel]}>Visible par</Text>
          <View style={styles.scopeRow}>
            <Pressable
              onPress={() => setScope('circle')}
              disabled={submitting}
              style={[styles.scopeOption, scope === 'circle' && styles.scopeOptionActive]}
            >
              <Text
                style={[styles.scopeText, scope === 'circle' && styles.scopeTextActive]}
              >
                Tous
              </Text>
            </Pressable>
            <Pressable
              onPress={() => setScope('selected')}
              disabled={submitting}
              style={[styles.scopeOption, scope === 'selected' && styles.scopeOptionActive]}
            >
              <Text
                style={[styles.scopeText, scope === 'selected' && styles.scopeTextActive]}
              >
                Amis
              </Text>
            </Pressable>
            <Pressable
              onPress={() => setScope('group')}
              disabled={submitting}
              style={[styles.scopeOption, scope === 'group' && styles.scopeOptionActive]}
            >
              <Text style={[styles.scopeText, scope === 'group' && styles.scopeTextActive]}>
                Groupe
              </Text>
            </Pressable>
          </View>

          {scope === 'group' && (
            <View style={styles.friendsBox}>
              {groups === null ? (
                <ActivityIndicator color={colors.text} style={styles.searchLoader} />
              ) : groups.length === 0 ? (
                <Text style={styles.hint}>
                  Tu n’as pas encore de groupe. Crée-en un depuis l’onglet Cercle.
                </Text>
              ) : (
                groups.map((group) => {
                  const selected = selectedGroupId === group.id;
                  return (
                    <Pressable
                      key={group.id}
                      onPress={() => setSelectedGroupId(group.id)}
                      disabled={submitting}
                      style={[styles.friendChip, selected && styles.friendChipActive]}
                    >
                      <Text
                        style={[styles.friendChipText, selected && styles.friendChipTextActive]}
                      >
                        {group.name}
                      </Text>
                    </Pressable>
                  );
                })
              )}
            </View>
          )}

          {scope === 'selected' && (
            <View style={styles.friendsBox}>
              {friends === null ? (
                <ActivityIndicator color={colors.text} style={styles.searchLoader} />
              ) : friends.length === 0 ? (
                <Text style={styles.hint}>
                  Tu n’as pas encore d’ami accepté dans ton Cercle.
                </Text>
              ) : (
                friends.map((friend) => {
                  const selected = selectedFriendIds.has(friend.id);
                  return (
                    <Pressable
                      key={friend.id}
                      onPress={() => toggleFriend(friend.id)}
                      disabled={submitting}
                      style={[styles.friendChip, selected && styles.friendChipActive]}
                    >
                      <Avatar url={friend.avatar_url} username={friend.username} size={20} />
                      <Text
                        style={[
                          styles.friendChipText,
                          selected && styles.friendChipTextActive,
                        ]}
                      >
                        {friend.username}
                      </Text>
                    </Pressable>
                  );
                })
              )}
            </View>
          )}

          {error && <Text style={styles.error}>{error}</Text>}

          <Pressable
            onPress={handleSubmit}
            disabled={submitting}
            style={({ pressed }) => [
              styles.submit,
              pressed && styles.submitPressed,
              submitting && styles.submitDisabled,
            ]}
          >
            {submitting ? (
              <ActivityIndicator color={colors.textOnAccent} />
            ) : (
              <View style={styles.submitContent}>
                <LinearGradient colors={wax} start={{ x: 0.25, y: 0.15 }} end={{ x: 0.85, y: 1 }} style={styles.submitSeal} />
                <Text style={styles.submitText}>
                  Sceller le <PredictWord />
                </Text>
              </View>
            )}
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function createStyles(colors: Colors) {
  return StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
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
  headerSpacer: { width: 56 },
  cancel: { fontSize: 15, color: colors.text, width: 56 },
  predictTypeWrap: { paddingHorizontal: spacing.lg, paddingTop: spacing.md },
  scroll: { padding: spacing.lg, paddingBottom: 40 },
  label: {
    fontFamily: fonts.sansBold,
    fontSize: 19,
    color: colors.text,
    marginBottom: 6,
  },
  sectionLabel: { marginTop: spacing.lg },
  fieldSpacing: { marginTop: spacing.md },
  subLabel: { fontSize: 12, color: colors.textFaint, marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: colors.text,
    backgroundColor: colors.surface,
  },
  teaserInput: { minHeight: 60, textAlignVertical: 'top' },
  contentInput: { minHeight: 110, textAlignVertical: 'top' },
  optionRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  optionInput: { flex: 1 },
  removeOptionButton: { padding: 8 },
  removeOptionButtonText: { fontSize: 15, color: colors.textFaint, fontWeight: '700' },
  addOptionButton: { paddingVertical: 8, alignSelf: 'flex-start' },
  addOptionButtonText: { fontSize: 14, fontWeight: '700', color: colors.accent },
  counter: { fontSize: 12, color: colors.textFaint, marginTop: 6, textAlign: 'right' },
  counterLow: { color: colors.danger },
  hint: { fontSize: 13, color: colors.textMuted, marginTop: 10, lineHeight: 18 },
  sectionHint: { fontSize: 13, color: colors.textMuted, marginBottom: 10, lineHeight: 18 },
  row: { flexDirection: 'row', gap: 12 },
  timeField: { flex: 1 },
  preview: { fontSize: 14, color: colors.textMuted, marginTop: 14 },
  // Trait sous le choix plutôt qu'un bouton de couleur — même registre sobre
  // que les onglets Mon Fil / Mes Predicts du Fil, jamais un aplat plein pour
  // un simple choix parmi d'autres (réservé au CTA principal).
  scopeRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  scopeOption: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
    marginBottom: -1,
  },
  scopeOptionActive: { borderBottomColor: colors.accent },
  scopeText: { fontFamily: fonts.sansBold, fontSize: 13, color: colors.textFaint, textAlign: 'center' },
  scopeTextActive: { color: colors.text },
  predictTypeHint: { fontSize: 12, lineHeight: 17, color: colors.textFaint, marginTop: 10 },
  revealNowRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: radius.pill,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: { backgroundColor: colors.accent, borderColor: colors.accent },
  revealNowText: { fontSize: 14, fontWeight: '600', color: colors.text },
  friendsBox: { flexDirection: 'row', flexWrap: 'wrap', gap: 16, marginTop: spacing.md },
  searchLoader: { marginTop: spacing.sm },
  // Étiquettes façon tags de presse : texte simple, trait noir sous le choix
  // sélectionné — assez d'espace autour pour rester facile à toucher malgré
  // l'absence de contour.
  friendChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  friendChipActive: { borderBottomColor: colors.text },
  friendChipText: { fontSize: 14, color: colors.textMuted, fontWeight: '600' },
  friendChipTextActive: { color: colors.text, fontWeight: '700' },
  error: {
    color: colors.danger,
    backgroundColor: colors.dangerSoft,
    borderRadius: radius.sm,
    padding: 12,
    fontSize: 14,
    marginTop: 14,
  },
  submit: {
    backgroundColor: colors.accent,
    borderRadius: radius.sm,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 24,
    minHeight: 52,
    justifyContent: 'center',
  },
  submitPressed: { backgroundColor: colors.accentBright },
  submitDisabled: { opacity: 0.6 },
  submitContent: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  submitSeal: { width: 18, height: 18, borderRadius: 9 },
  submitText: { color: colors.textOnAccent, fontSize: 16, fontWeight: '700' },
  });
}
