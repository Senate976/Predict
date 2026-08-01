import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PredictionRecorder } from '../../components/PredictionRecorder';
import { PredictionSeal } from '../../components/PredictionSeal';
import { SelectField, type SelectOption } from '../../components/SelectField';
import { setPredictionAudioPath, uploadPredictionAudio } from '../../lib/audio';
import { useAuth } from '../../lib/auth';
import { MONTHS, formatCountdown, formatRevealAt } from '../../lib/datetime';
import { fetchFriendships, otherProfile, type FriendProfile } from '../../lib/friends';
import {
  MAX_CONTENT_LENGTH,
  MAX_TEASER_LENGTH,
  MIN_REVEAL_DELAY_MS,
  createPrediction,
  predictionErrorMessage,
  type PredictionScope,
} from '../../lib/predictions';
import { colors, fonts, radius, spacing } from '../../lib/theme';

type ContentMode = 'text' | 'audio';

/** Contenu écrit à la place du texte quand la prédiction est uniquement vocale. */
const AUDIO_PLACEHOLDER = '🎙️ Message vocal';

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

/** Nombre de jours du mois `month` (1-12) de l'année `year`. */
function daysInMonth(month: number, year: number): number {
  return new Date(year, month, 0).getDate();
}

const HOUR_OPTIONS: SelectOption<number>[] = Array.from({ length: 24 }, (_, i) => ({
  value: i,
  label: pad2(i),
}));

const MINUTE_OPTIONS: SelectOption<number>[] = Array.from({ length: 60 }, (_, i) => ({
  value: i,
  label: pad2(i),
}));

const MONTH_OPTIONS: SelectOption<number>[] = MONTHS.map((label, i) => ({
  value: i + 1,
  label: label.charAt(0).toUpperCase() + label.slice(1),
}));

function yearOptions(): SelectOption<number>[] {
  const current = new Date().getFullYear();
  return Array.from({ length: 5 }, (_, i) => ({ value: current + i, label: String(current + i) }));
}

function dayOptions(month: number | null, year: number | null): SelectOption<number>[] {
  const max = month !== null && year !== null ? daysInMonth(month, year) : 31;
  return Array.from({ length: max }, (_, i) => ({ value: i + 1, label: String(i + 1) }));
}

export default function NewPredictionScreen() {
  const { session } = useAuth();
  const router = useRouter();
  const userId = session?.user.id;

  const [teaser, setTeaser] = useState('');
  const [contentMode, setContentMode] = useState<ContentMode>('text');
  const [content, setContent] = useState('');
  const [audioUri, setAudioUri] = useState<string | null>(null);
  // Champs vides au départ, et aucun raccourci de délai : le moment de la
  // révélation est un choix libre de l'auteur, pas quelque chose que l'écran
  // oriente. Une valeur pré-remplie suggérerait un horizon par défaut.
  const [day, setDay] = useState<number | null>(null);
  const [month, setMonth] = useState<number | null>(null);
  const [year, setYear] = useState<number | null>(null);
  const [hour, setHour] = useState<number | null>(null);
  const [minute, setMinute] = useState<number | null>(null);

  const [scope, setScope] = useState<PredictionScope>('circle');
  const [friends, setFriends] = useState<FriendProfile[] | null>(null);
  const [selectedFriendIds, setSelectedFriendIds] = useState<Set<string>>(new Set());

  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [showSeal, setShowSeal] = useState(false);

  useEffect(() => {
    if (!userId) return;
    fetchFriendships(userId).then(({ data }) => {
      const accepted = (data ?? []).filter((f) => f.status === 'accepted');
      setFriends(accepted.map((f) => otherProfile(f, userId)));
    });
  }, [userId]);

  // Recale le jour si le mois/année choisi en compte moins (ex. 31 puis
  // bascule sur février) : un menu déroulant ne doit jamais pouvoir aboutir à
  // une date qui n'existe pas.
  useEffect(() => {
    if (day === null || month === null || year === null) return;
    const max = daysInMonth(month, year);
    if (day > max) setDay(max);
  }, [month, year, day]);

  const trimmedTeaser = teaser.trim();
  const trimmedContent = content.trim();
  const remaining = MAX_CONTENT_LENGTH - trimmedContent.length;
  const revealAt =
    day !== null && month !== null && year !== null && hour !== null && minute !== null
      ? new Date(year, month - 1, day, hour, minute, 0, 0)
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
      if (!trimmedContent) return 'Écris le contenu secret de ta prédiction.';
      if (trimmedContent.length > MAX_CONTENT_LENGTH) {
        return `Le contenu secret ne peut pas dépasser ${MAX_CONTENT_LENGTH} caractères.`;
      }
    } else if (!audioUri) {
      return 'Enregistre ta prédiction avant de la sceller.';
    }
    if (!revealAt) {
      return 'Choisis la date et l’heure de la révélation.';
    }
    if (revealAt.getTime() - Date.now() < MIN_REVEAL_DELAY_MS) {
      return 'La révélation doit être au moins une minute après maintenant.';
    }
    if (scope === 'selected' && selectedFriendIds.size === 0) {
      return 'Choisis au moins un ami, ou passe sur « Tout mon Cercle ».';
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
      const { data: predictionId, error: insertError } = await createPrediction({
        teaser: trimmedTeaser,
        content: contentMode === 'text' ? trimmedContent : AUDIO_PLACEHOLDER,
        revealAt,
        scope,
        friendIds: Array.from(selectedFriendIds),
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
          setError(`Prédiction créée, mais l’envoi de l’audio a échoué : ${uploadError?.message ?? 'erreur inconnue'}`);
          return;
        }
        const { error: pathError } = await setPredictionAudioPath(predictionId, path);
        if (pathError) {
          setError(`Prédiction créée, mais l’association de l’audio a échoué : ${pathError.message}`);
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
          <Text style={styles.headerTitle}>Nouvelle prédiction</Text>
          {/* Espaceur de même largeur que « Annuler », pour centrer le titre. */}
          <View style={styles.headerSpacer} />
        </View>

        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.label}>Teaser</Text>
          <Text style={styles.sectionHint}>
            Visible tout de suite par tes destinataires — le contenu secret, lui,
            reste scellé.
          </Text>
          <TextInput
            value={teaser}
            onChangeText={setTeaser}
            placeholder="Léa va me surprendre avant la fin de l’année…"
            multiline
            editable={!submitting}
            maxLength={MAX_TEASER_LENGTH}
            style={[styles.input, styles.teaserInput]}
          />

          <Text style={[styles.label, styles.sectionLabel]}>Ma prédiction</Text>
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
                placeholder="Dans un mois, Léa aura adopté un chat."
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

          <Text style={styles.hint}>
            Personne ne le verra (ni ne l’écoutera) avant l’heure de révélation, pas
            même la personne concernée.
          </Text>

          <Text style={[styles.label, styles.sectionLabel]}>Révélation</Text>
          <Text style={styles.sectionHint}>
            Le moment que tu veux, à la minute près.
          </Text>

          <View style={styles.row}>
            <View style={styles.dayField}>
              <SelectField
                label="Jour"
                value={day}
                options={dayOptions(month, year)}
                placeholder="JJ"
                onChange={setDay}
                disabled={submitting}
              />
            </View>
            <View style={styles.monthField}>
              <SelectField
                label="Mois"
                value={month}
                options={MONTH_OPTIONS}
                placeholder="Mois"
                onChange={setMonth}
                disabled={submitting}
              />
            </View>
            <View style={styles.yearField}>
              <SelectField
                label="Année"
                value={year}
                options={yearOptions()}
                placeholder="Année"
                onChange={setYear}
                disabled={submitting}
              />
            </View>
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
                Tout mon Cercle
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
                Amis spécifiques
              </Text>
            </Pressable>
          </View>

          {scope === 'selected' && (
            <View style={styles.friendsBox}>
              {friends === null ? (
                <ActivityIndicator color={colors.gold} style={styles.searchLoader} />
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
              <Text style={styles.submitText}>Sceller la prédiction</Text>
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
  headerTitle: { fontFamily: fonts.serifItalic, fontSize: 18, color: colors.text },
  headerSpacer: { width: 56 },
  cancel: { fontSize: 15, color: colors.gold, width: 56 },
  scroll: { padding: spacing.lg, paddingBottom: 40 },
  label: {
    fontFamily: fonts.serifItalic,
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
  counterLow: { color: colors.gold },
  hint: { fontSize: 13, color: colors.textMuted, marginTop: 10, lineHeight: 18 },
  sectionHint: { fontSize: 13, color: colors.textMuted, marginBottom: 10, lineHeight: 18 },
  row: { flexDirection: 'row', gap: 12 },
  dayField: { flex: 0.8 },
  monthField: { flex: 1.4 },
  yearField: { flex: 1 },
  timeField: { flex: 1 },
  preview: { fontSize: 14, color: colors.success, marginTop: 14 },
  scopeRow: { flexDirection: 'row', gap: 10 },
  scopeOption: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    paddingVertical: 12,
    alignItems: 'center',
    backgroundColor: colors.surface,
  },
  scopeOptionActive: { borderColor: colors.gold, backgroundColor: colors.goldSoft },
  scopeText: { fontSize: 13, fontWeight: '600', color: colors.textMuted },
  scopeTextActive: { color: colors.gold },
  friendsBox: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: spacing.md },
  searchLoader: { marginTop: spacing.sm },
  friendChip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: colors.surface,
  },
  friendChipActive: { borderColor: colors.gold, backgroundColor: colors.goldSoft },
  friendChipText: { fontSize: 13, color: colors.textMuted, fontWeight: '600' },
  friendChipTextActive: { color: colors.gold },
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
