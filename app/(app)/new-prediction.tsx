import { useNavigation, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
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
  CATEGORIES,
  CATEGORY_LABEL,
  MAX_CONTENT_LENGTH,
  MAX_TEASER_LENGTH,
  MIN_REVEAL_DELAY_MS,
  computeOpenEndedRevealAt,
  createPrediction,
  extractMentionedUsernames,
  predictionErrorMessage,
  type PredictionCategory,
  type PredictionScope,
} from '../../lib/predictions';
import { colors, fonts, radius, spacing } from '../../lib/theme';

type ContentMode = 'text' | 'audio';
/** `scheduled` : date fixée par l'auteur. `open_ended` : révélée quand
 * l'auteur le déclenche depuis son écran. `immediate` : révélée dès la
 * validation — le Cercle vote alors « j'y crois / j'y crois pas » plutôt que
 * « réalisée / manquée », faute de rien à constater encore. */
type RevealTiming = 'scheduled' | 'open_ended' | 'immediate';

/** Contenu écrit à la place du texte quand la prédiction est uniquement vocale. */
const AUDIO_PLACEHOLDER = '🎙️ Message vocal';

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
  const { session } = useAuth();
  const router = useRouter();
  const navigation = useNavigation();
  const userId = session?.user.id;

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

  const [category, setCategory] = useState<PredictionCategory>('autre');
  const [scope, setScope] = useState<PredictionScope>('circle');
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
  // compte pour une prédiction « ouverte ». Pour « immédiatement », la valeur
  // exacte n'a pas d'importance : la base pose son propre `now()` de toute
  // façon (voir `create_prediction`) — celle-ci ne sert qu'à satisfaire la
  // validation locale.
  const revealAt =
    revealTiming === 'immediate'
      ? new Date()
      : revealTiming === 'open_ended'
        ? computeOpenEndedRevealAt()
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

  /** Vérifications locales, pour éviter un aller-retour réseau inutile. */
  function validate(): string | null {
    if (!trimmedTeaser) return 'Écris un teaser : l’accroche que verront tes destinataires.';
    if (trimmedTeaser.length > MAX_TEASER_LENGTH) {
      return `Le teaser ne peut pas dépasser ${MAX_TEASER_LENGTH} caractères.`;
    }
    if (contentMode === 'text') {
      if (!trimmedContent) return 'Écris le contenu secret de ton Predict.';
      if (trimmedContent.length > MAX_CONTENT_LENGTH) {
        return `Le contenu secret ne peut pas dépasser ${MAX_CONTENT_LENGTH} caractères.`;
      }
    } else if (!audioUri) {
      return 'Enregistre ton Predict avant de le sceller.';
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
      return 'Choisis au moins un ami, ou passe sur « Mon Cercle ».';
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

      const { data: predictionId, error: insertError } = await createPrediction({
        teaser: trimmedTeaser,
        content: contentMode === 'text' ? trimmedContent : AUDIO_PLACEHOLDER,
        revealAt,
        scope,
        friendIds: Array.from(selectedFriendIds),
        groupId: selectedGroupId,
        mentionedFriendIds,
        openEnded: revealTiming === 'open_ended',
        isImmediate: revealTiming === 'immediate',
        category,
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

        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.label}>Teaser</Text>
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

          <Text style={[styles.label, styles.sectionLabel]}>Mon Predict</Text>
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
                placeholder="Écrivez votre Predict ici et prouvez à votre cercle, qu’une fois encore, vous aviez raison"
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

          <Text style={[styles.label, styles.sectionLabel]}>Catégorie</Text>
          <View style={styles.friendsBox}>
            {CATEGORIES.map((cat) => {
              const selected = category === cat;
              return (
                <Pressable
                  key={cat}
                  onPress={() => setCategory(cat)}
                  disabled={submitting}
                  style={[styles.friendChip, selected && styles.friendChipActive]}
                >
                  <Text style={[styles.friendChipText, selected && styles.friendChipTextActive]}>
                    {CATEGORY_LABEL[cat]}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <Text style={[styles.label, styles.sectionLabel]}>Révélation</Text>

          <View style={styles.scopeRow}>
            <Pressable
              onPress={() => setRevealTiming('scheduled')}
              disabled={submitting}
              style={[styles.scopeOption, revealTiming === 'scheduled' && styles.scopeOptionActive]}
            >
              <Text style={[styles.scopeText, revealTiming === 'scheduled' && styles.scopeTextActive]}>
                Date fixe
              </Text>
            </Pressable>
            <Pressable
              onPress={() => setRevealTiming('immediate')}
              disabled={submitting}
              style={[styles.scopeOption, revealTiming === 'immediate' && styles.scopeOptionActive]}
            >
              <Text style={[styles.scopeText, revealTiming === 'immediate' && styles.scopeTextActive]}>
                Immédiate
              </Text>
            </Pressable>
            <Pressable
              onPress={() => setRevealTiming('open_ended')}
              disabled={submitting}
              style={[styles.scopeOption, revealTiming === 'open_ended' && styles.scopeOptionActive]}
            >
              <Text style={[styles.scopeText, revealTiming === 'open_ended' && styles.scopeTextActive]}>
                En temps voulu
              </Text>
            </Pressable>
          </View>

          {revealTiming === 'open_ended' ? (
            <Text style={[styles.sectionHint, styles.fieldSpacing]}>
              Tu pourras révéler ce <PredictWord /> quand tu veux, depuis son écran.
            </Text>
          ) : revealTiming === 'immediate' ? (
            <Text style={[styles.sectionHint, styles.fieldSpacing]}>
              Ce <PredictWord /> sera révélé dès la validation : ton Cercle pourra tout de suite dire
              s’il y croit ou pas.
            </Text>
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
                Mon Cercle
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
              <ActivityIndicator color={colors.text} />
            ) : (
              <Text style={styles.submitText}>
                Sceller le <PredictWord />
              </Text>
            )}
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
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
  counter: { fontSize: 12, color: colors.textFaint, marginTop: 6, textAlign: 'right' },
  counterLow: { color: colors.danger },
  hint: { fontSize: 13, color: colors.textMuted, marginTop: 10, lineHeight: 18 },
  sectionHint: { fontSize: 13, color: colors.textMuted, marginBottom: 10, lineHeight: 18 },
  row: { flexDirection: 'row', gap: 12 },
  timeField: { flex: 1 },
  preview: { fontSize: 14, color: colors.textMuted, marginTop: 14 },
  // Plus de pilule : un choix parmi plusieurs se marque comme les onglets
  // À venir/Révélées — un trait noir sous l'option choisie, rien de coloré.
  scopeRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: colors.border },
  scopeOption: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
    marginBottom: -1,
  },
  scopeOptionActive: { borderBottomColor: colors.text },
  scopeText: { fontSize: 13, fontWeight: '600', color: colors.textMuted, textAlign: 'center' },
  scopeTextActive: { color: colors.text, fontWeight: '700' },
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
    backgroundColor: colors.gold,
    borderRadius: radius.sm,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 24,
    minHeight: 52,
    justifyContent: 'center',
  },
  submitPressed: { backgroundColor: colors.goldBright },
  submitDisabled: { opacity: 0.6 },
  submitText: { color: colors.text, fontSize: 16, fontWeight: '700' },
});
