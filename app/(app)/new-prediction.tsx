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

import { PredictionSeal } from '../../components/PredictionSeal';
import { useAuth } from '../../lib/auth';
import { formatCountdown, formatRevealAt, parseRevealAt } from '../../lib/datetime';
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

export default function NewPredictionScreen() {
  const { session } = useAuth();
  const router = useRouter();
  const userId = session?.user.id;

  const [teaser, setTeaser] = useState('');
  const [content, setContent] = useState('');
  // Champs vides au départ, et aucun raccourci de délai : le moment de la
  // révélation est un choix libre de l'auteur, pas quelque chose que l'écran
  // oriente. Une valeur pré-remplie suggérerait un horizon par défaut.
  const [dateInput, setDateInput] = useState('');
  const [timeInput, setTimeInput] = useState('');

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

  const trimmedTeaser = teaser.trim();
  const trimmedContent = content.trim();
  const revealAt = parseRevealAt(dateInput, timeInput);
  const remaining = MAX_CONTENT_LENGTH - trimmedContent.length;
  const revealTouched = dateInput.trim() !== '' || timeInput.trim() !== '';

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
    if (!trimmedContent) return 'Écris le contenu secret de ta prédiction.';
    if (trimmedContent.length > MAX_CONTENT_LENGTH) {
      return `Le contenu secret ne peut pas dépasser ${MAX_CONTENT_LENGTH} caractères.`;
    }
    if (!revealTouched) {
      return 'Choisis la date et l’heure de la révélation.';
    }
    if (!revealAt) {
      return 'Date ou heure invalide. Format attendu : JJ/MM/AAAA et HH:MM.';
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
      const { error: insertError } = await createPrediction({
        teaser: trimmedTeaser,
        content: trimmedContent,
        revealAt,
        scope,
        friendIds: Array.from(selectedFriendIds),
      });

      if (insertError) {
        setError(predictionErrorMessage(insertError));
        return;
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

          <Text style={[styles.label, styles.sectionLabel]}>Contenu secret</Text>
          <TextInput
            value={content}
            onChangeText={setContent}
            placeholder="Dans un mois, Léa aura adopté un chat."
            multiline
            editable={!submitting}
            maxLength={MAX_CONTENT_LENGTH}
            style={[styles.input, styles.contentInput]}
          />
          <Text style={[styles.counter, remaining < 20 && styles.counterLow]}>
            {remaining} caractères restants
          </Text>
          <Text style={styles.hint}>
            Personne ne le verra avant l’heure de révélation, pas même la personne
            concernée.
          </Text>

          <Text style={[styles.label, styles.sectionLabel]}>Révélation</Text>
          <Text style={styles.sectionHint}>
            Le moment que tu veux, à la minute près.
          </Text>

          <View style={styles.row}>
            <View style={styles.flex}>
              <Text style={styles.subLabel}>Date</Text>
              <TextInput
                value={dateInput}
                onChangeText={setDateInput}
                placeholder="JJ/MM/AAAA"
                keyboardType="numbers-and-punctuation"
                autoCorrect={false}
                editable={!submitting}
                style={styles.input}
              />
            </View>
            <View style={styles.timeField}>
              <Text style={styles.subLabel}>Heure</Text>
              <TextInput
                value={timeInput}
                onChangeText={setTimeInput}
                placeholder="HH:MM"
                keyboardType="numbers-and-punctuation"
                autoCorrect={false}
                editable={!submitting}
                style={styles.input}
              />
            </View>
          </View>

          {/* Rien tant que les deux champs sont vides : à l'ouverture, un
              « date incomplète » se lirait comme une erreur alors que
              l'utilisateur n'a encore rien saisi. */}
          {revealAt ? (
            <Text style={styles.preview}>
              Se révélera {formatRevealAt(revealAt)} —{' '}
              {formatCountdown(revealAt, new Date())}.
            </Text>
          ) : revealTouched ? (
            <Text style={styles.previewInvalid}>
              Date incomplète — format attendu : JJ/MM/AAAA et HH:MM.
            </Text>
          ) : null}

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
  headerTitle: { fontFamily: fonts.serif, fontSize: 18, color: colors.text },
  headerSpacer: { width: 56 },
  cancel: { fontSize: 15, color: colors.gold, width: 56 },
  scroll: { padding: spacing.lg, paddingBottom: 40 },
  label: {
    fontFamily: fonts.serif,
    fontSize: 19,
    color: colors.text,
    marginBottom: 6,
  },
  sectionLabel: { marginTop: spacing.lg },
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
  timeField: { width: 110 },
  preview: { fontSize: 14, color: colors.success, marginTop: 14 },
  previewInvalid: { fontSize: 14, color: colors.gold, marginTop: 14 },
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
