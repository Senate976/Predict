import { useRouter } from 'expo-router';
import { useState } from 'react';
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

import { useAuth } from '../../lib/auth';
import { formatCountdown, formatRevealAt, parseRevealAt } from '../../lib/datetime';
import {
  MAX_CONTENT_LENGTH,
  MIN_REVEAL_DELAY_MS,
  createPrediction,
  predictionErrorMessage,
} from '../../lib/predictions';

export default function NewPredictionScreen() {
  const { session } = useAuth();
  const router = useRouter();

  const [content, setContent] = useState('');
  // Champs vides au départ, et aucun raccourci de délai : le moment de la
  // révélation est un choix libre de l'auteur, pas quelque chose que l'écran
  // oriente. Une valeur pré-remplie suggérerait un horizon par défaut.
  const [dateInput, setDateInput] = useState('');
  const [timeInput, setTimeInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const trimmedContent = content.trim();
  const revealAt = parseRevealAt(dateInput, timeInput);
  const remaining = MAX_CONTENT_LENGTH - trimmedContent.length;
  const revealTouched = dateInput.trim() !== '' || timeInput.trim() !== '';

  /** Vérifications locales, pour éviter un aller-retour réseau inutile. */
  function validate(): string | null {
    if (!trimmedContent) return 'Écris ta prédiction.';
    if (trimmedContent.length > MAX_CONTENT_LENGTH) {
      return `La prédiction ne peut pas dépasser ${MAX_CONTENT_LENGTH} caractères.`;
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
        authorId: session.user.id,
        content: trimmedContent,
        revealAt,
      });

      if (insertError) {
        setError(predictionErrorMessage(insertError));
        return;
      }

      // L'accueil recharge la liste à chaque fois qu'il reprend le focus.
      router.back();
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
          <Text style={styles.label}>Ta prédiction</Text>
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
            Personne ne la verra avant l’heure de révélation, pas même la personne
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
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.submitText}>Programmer la prédiction</Text>
            )}
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#fff' },
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  headerTitle: { fontSize: 16, fontWeight: '700', color: '#111' },
  headerSpacer: { width: 56 },
  cancel: { fontSize: 15, color: '#6b7280', width: 56 },
  scroll: { padding: 20, paddingBottom: 40 },
  label: { fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 6 },
  sectionLabel: { marginTop: 24 },
  subLabel: { fontSize: 12, color: '#6b7280', marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: '#111',
    backgroundColor: '#fff',
  },
  contentInput: { minHeight: 110, textAlignVertical: 'top' },
  counter: { fontSize: 12, color: '#9ca3af', marginTop: 6, textAlign: 'right' },
  counterLow: { color: '#b45309' },
  hint: { fontSize: 13, color: '#6b7280', marginTop: 10, lineHeight: 18 },
  sectionHint: { fontSize: 13, color: '#6b7280', marginBottom: 14, lineHeight: 18 },
  row: { flexDirection: 'row', gap: 12 },
  timeField: { width: 110 },
  preview: { fontSize: 14, color: '#166534', marginTop: 14 },
  previewInvalid: { fontSize: 14, color: '#b45309', marginTop: 14 },
  error: {
    color: '#b91c1c',
    backgroundColor: '#fef2f2',
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    marginTop: 14,
  },
  submit: {
    backgroundColor: '#2563eb',
    borderRadius: 10,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 24,
    minHeight: 52,
    justifyContent: 'center',
  },
  submitPressed: { backgroundColor: '#1d4ed8' },
  submitDisabled: { opacity: 0.7 },
  submitText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
