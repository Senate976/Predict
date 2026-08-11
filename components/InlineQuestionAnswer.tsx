import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { Text } from './Text';
import { TextInput } from './TextInput';

import type { PredictionFeedItem } from '../lib/predictions';
import {
  fetchAnswerOptions,
  MAX_ANSWER_LENGTH,
  questionAnswerErrorMessage,
  submitPredictionAnswer,
  type PredictionAnswerOption,
} from '../lib/questions';
import { radius, spacing, type Colors } from '../lib/theme';
import { useColors } from '../lib/themeMode';

/**
 * Le formulaire de réponse à une Question ouverte — texte ou options selon
 * `answer_format` —, ou la réponse déjà posée, en lecture seule : une
 * réponse est définitive, ni modifiable ni supprimable une fois envoyée
 * (`submit_prediction_answer` refuse tout second appel, schema.sql section
 * 44). Réutilisé tel quel sur la carte du Fil (répondre sans quitter le
 * Fil) et sur l'écran détail (`QuestionAnswerPanel`, avant Clôture) : même
 * composant, mêmes règles, un seul endroit à faire évoluer.
 *
 * L'auteur peut répondre à sa propre Question comme n'importe quel
 * destinataire (schema.sql section 43) : ce composant ne fait aucune
 * distinction, `isAuthor` n'a jamais à lui être passé.
 */
export function InlineQuestionAnswer({
  prediction,
  onAnswered,
}: {
  prediction: PredictionFeedItem;
  /** Prévient l'appelant qu'une réponse vient d'être postée, pour qu'il
   * recharge `prediction` (`my_answer_*`/`answer_count` à jour). */
  onAnswered?: () => void;
}) {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [options, setOptions] = useState<PredictionAnswerOption[] | null>(null);
  const [draftText, setDraftText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Écho optimiste, pour une réponse qui se reflète immédiatement même là où
  // rien ne recharge `prediction` derrière (carte du Fil — contrairement à
  // l'écran détail, qui a son propre `load()` via `onAnswered`). `null` tant
  // qu'on n'a encore rien envoyé pendant cette session : la valeur posée par
  // les props (donc en base) fait foi.
  const [localAnswer, setLocalAnswer] = useState<{ text: string | null; optionId: string | null } | null>(null);

  useEffect(() => {
    if (prediction.answer_format !== 'choice') return;
    let cancelled = false;
    fetchAnswerOptions(prediction.id).then(({ data }) => {
      if (!cancelled) setOptions(data ?? []);
    });
    return () => {
      cancelled = true;
    };
  }, [prediction.id, prediction.answer_format]);

  const myAnswerText = localAnswer ? localAnswer.text : prediction.my_answer_text;
  const myAnswerOptionId = localAnswer ? localAnswer.optionId : prediction.my_answer_option_id;
  const hasAnswered = myAnswerText !== null || myAnswerOptionId !== null;
  const optionLabelById = new Map((options ?? []).map((o) => [o.id, o.label]));

  async function handleSubmitText() {
    const trimmed = draftText.trim();
    if (!trimmed) return;
    setSubmitting(true);
    setError(null);
    const { error: submitError } = await submitPredictionAnswer(prediction.id, { text: trimmed });
    setSubmitting(false);
    if (submitError) {
      setError(questionAnswerErrorMessage(submitError));
      return;
    }
    setLocalAnswer({ text: trimmed, optionId: null });
    onAnswered?.();
  }

  async function handleSubmitOption(optionId: string) {
    setSubmitting(true);
    setError(null);
    const { error: submitError } = await submitPredictionAnswer(prediction.id, { optionId });
    setSubmitting(false);
    if (submitError) {
      setError(questionAnswerErrorMessage(submitError));
      return;
    }
    setLocalAnswer({ text: null, optionId });
    onAnswered?.();
  }

  // Définitif : une fois répondu, plus aucun moyen de revenir dessus depuis
  // ce composant — ni lien Modifier, ni bouton Supprimer.
  if (hasAnswered) {
    const label = myAnswerOptionId !== null ? optionLabelById.get(myAnswerOptionId) ?? '…' : myAnswerText;
    return (
      <View style={styles.wrap}>
        <Text style={styles.answeredLabel}>
          Ta réponse : <Text style={styles.answeredValue}>{label}</Text>
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      {error && <Text style={styles.error}>{error}</Text>}
      {prediction.answer_format === 'choice' ? (
        options === null ? (
          <ActivityIndicator color={colors.text} style={styles.loader} />
        ) : (
          <View style={styles.optionsRow}>
            {options.map((option) => (
              <Pressable
                key={option.id}
                onPress={() => handleSubmitOption(option.id)}
                disabled={submitting}
                style={styles.optionChoice}
              >
                <Text style={styles.optionChoiceText}>{option.label}</Text>
              </Pressable>
            ))}
          </View>
        )
      ) : (
        <View style={styles.textRow}>
          <TextInput
            value={draftText}
            onChangeText={setDraftText}
            placeholder="Ta réponse…"
            placeholderTextColor={colors.textFaint}
            editable={!submitting}
            maxLength={MAX_ANSWER_LENGTH}
            style={styles.input}
          />
          <Pressable
            onPress={handleSubmitText}
            disabled={submitting || !draftText.trim()}
            style={[styles.sendButton, (submitting || !draftText.trim()) && styles.sendButtonDisabled]}
          >
            <Text style={styles.sendButtonText}>{submitting ? '…' : 'Envoyer'}</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

function createStyles(colors: Colors) {
  return StyleSheet.create({
    wrap: { marginTop: spacing.sm },
    error: {
      color: colors.danger,
      backgroundColor: colors.dangerSoft,
      borderRadius: radius.sm,
      padding: 8,
      fontSize: 12,
      marginBottom: 6,
    },
    loader: { marginTop: 4 },
    textRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    // `minWidth: 0` : sans lui, un `<input>` web garde sa largeur de
    // contenu par défaut (`min-width: auto`) et refuse de rétrécir sous
    // `flex: 1`, poussant `sendButton` hors du cadre de la carte sur un
    // écran étroit — le bug classique du flexbox web avec un input.
    input: {
      flex: 1,
      minWidth: 0,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.pill,
      paddingHorizontal: 14,
      paddingVertical: 9,
      fontSize: 14,
      color: colors.text,
      backgroundColor: colors.surfaceRaised,
    },
    // Contour plutôt qu'aplat, même registre que le reste des actions liées
    // aux Questions : pas de fond plein hors de l'accent bordeaux (réservé au
    // FAB/CTA principal). `flexShrink: 0` : garde toujours sa taille pleine,
    // c'est l'input qui doit céder la place, jamais ce bouton.
    sendButton: {
      flexShrink: 0,
      borderWidth: 1,
      borderColor: colors.accent,
      borderRadius: radius.pill,
      paddingHorizontal: 14,
      paddingVertical: 9,
    },
    sendButtonDisabled: { opacity: 0.5 },
    sendButtonText: { fontSize: 13, fontWeight: '700', color: colors.accent },
    optionsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center' },
    optionChoice: {
      borderWidth: 1,
      borderColor: colors.accent,
      borderRadius: radius.pill,
      paddingHorizontal: 12,
      paddingVertical: 7,
    },
    optionChoiceText: { fontSize: 13, fontWeight: '700', color: colors.accent },
    answeredLabel: { fontSize: 13, color: colors.textMuted },
    answeredValue: { fontWeight: '700', color: colors.text },
  });
}
