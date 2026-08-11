import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { Text } from './Text';
import { TextInput } from './TextInput';

import {
  fetchAnswerOptions,
  fetchPredictionAnswers,
  MAX_ANSWER_LENGTH,
  questionAnswerErrorMessage,
  setAnswerCorrectness,
  submitPredictionAnswer,
  type PredictionAnswer,
  type PredictionAnswerOption,
} from '../lib/questions';
import type { PredictionFeedItem } from '../lib/predictions';
import { eyebrow, fonts, radius, spacing, type Colors } from '../lib/theme';
import { useColors } from '../lib/themeMode';
import { Avatar } from './Avatar';

/**
 * Le cœur d'une carte Question sur l'écran détail — remplace le bloc
 * contenu + Verdict d'une Déclaration (`app/(app)/prediction/[id].tsx`).
 *
 * Avant Clôture : l'auteur ne voit que le compteur (`prediction.answer_count`,
 * jamais le détail des réponses — voir schema.sql section 42) ; un
 * répondant voit un formulaire (texte ou options selon `answer_format`), ou
 * sa propre réponse déjà posée avec un lien pour la modifier.
 *
 * Après Clôture : tout le monde voit la liste des réponses ; l'auteur y
 * ajoute deux pastilles Correcte/Incorrecte par ligne. Aucun habillage de
 * gamification ici (sceau, score) — volontairement remis à plus tard,
 * seule la donnée brute (`is_correct`) est posée.
 */
export function QuestionAnswerPanel({
  prediction,
  isAuthor,
  closed,
  onAnswered,
}: {
  prediction: PredictionFeedItem;
  isAuthor: boolean;
  /** `reveal_at <= now()` côté appelant — la Clôture d'une Question. */
  closed: boolean;
  /** Prévient l'écran parent qu'une réponse vient d'être postée, pour qu'il
   * recharge `prediction` (compteur, `my_answer_*` à jour). */
  onAnswered?: () => void;
}) {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [options, setOptions] = useState<PredictionAnswerOption[] | null>(null);
  const [answers, setAnswers] = useState<PredictionAnswer[] | null>(null);
  const [answersError, setAnswersError] = useState<string | null>(null);

  const [editing, setEditing] = useState(false);
  const [draftText, setDraftText] = useState(prediction.my_answer_text ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [gradingId, setGradingId] = useState<string | null>(null);

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

  useEffect(() => {
    if (!closed) return;
    let cancelled = false;
    setAnswersError(null);
    fetchPredictionAnswers(prediction.id).then(({ data, error }) => {
      if (cancelled) return;
      if (error) {
        setAnswersError('Chargement des réponses impossible.');
        return;
      }
      setAnswers(data ?? []);
    });
    return () => {
      cancelled = true;
    };
  }, [prediction.id, closed]);

  const hasAnswered = prediction.my_answer_text !== null || prediction.my_answer_option_id !== null;
  const optionLabelById = new Map((options ?? []).map((o) => [o.id, o.label]));

  async function handleSubmitText() {
    const trimmed = draftText.trim();
    if (!trimmed) return;
    setSubmitting(true);
    setSubmitError(null);
    const { error } = await submitPredictionAnswer(prediction.id, { text: trimmed });
    setSubmitting(false);
    if (error) {
      setSubmitError(questionAnswerErrorMessage(error));
      return;
    }
    setEditing(false);
    onAnswered?.();
  }

  async function handleSubmitOption(optionId: string) {
    setSubmitting(true);
    setSubmitError(null);
    const { error } = await submitPredictionAnswer(prediction.id, { optionId });
    setSubmitting(false);
    if (error) {
      setSubmitError(questionAnswerErrorMessage(error));
      return;
    }
    setEditing(false);
    onAnswered?.();
  }

  async function handleGrade(answerId: string, isCorrect: boolean) {
    setGradingId(answerId);
    const previous = answers;
    setAnswers((prev) => (prev ?? []).map((a) => (a.id === answerId ? { ...a, is_correct: isCorrect } : a)));
    const { error } = await setAnswerCorrectness(answerId, isCorrect);
    setGradingId(null);
    if (error) {
      setAnswers(previous);
    }
  }

  if (closed) {
    return (
      <View style={styles.section}>
        <Text style={styles.eyebrow}>Réponses</Text>
        {answersError && <Text style={styles.error}>{answersError}</Text>}
        {answers === null ? (
          <ActivityIndicator color={colors.text} style={styles.loader} />
        ) : answers.length === 0 ? (
          <Text style={styles.hint}>Personne n’a répondu.</Text>
        ) : (
          answers.map((a) => {
            const label = a.option_id ? optionLabelById.get(a.option_id) ?? '…' : a.answer_text;
            return (
              <View key={a.id} style={styles.answerRow}>
                <Avatar url={a.avatar_url} username={a.username} size={26} />
                <View style={styles.answerBody}>
                  <Text style={styles.answerAuthor} numberOfLines={1}>
                    {a.username}
                  </Text>
                  <Text style={styles.answerText}>{label}</Text>
                </View>
                {isAuthor ? (
                  <View style={styles.gradeButtons}>
                    <Pressable
                      onPress={() => handleGrade(a.id, true)}
                      disabled={gradingId === a.id}
                      style={[styles.gradeButton, a.is_correct === true && styles.gradeButtonCorrectActive]}
                    >
                      <Text style={styles.gradeButtonText}>Correcte</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => handleGrade(a.id, false)}
                      disabled={gradingId === a.id}
                      style={[styles.gradeButton, a.is_correct === false && styles.gradeButtonIncorrectActive]}
                    >
                      <Text style={styles.gradeButtonText}>Incorrecte</Text>
                    </Pressable>
                  </View>
                ) : (
                  a.is_correct !== null && (
                    <Text style={a.is_correct ? styles.verdictCorrect : styles.verdictIncorrect}>
                      {a.is_correct ? '✓' : '✕'}
                    </Text>
                  )
                )}
              </View>
            );
          })
        )}
      </View>
    );
  }

  if (isAuthor) {
    return (
      <View style={styles.section}>
        <Text style={styles.eyebrow}>Réponses</Text>
        <Text style={styles.hint}>
          {prediction.answer_count === 0
            ? 'Aucune réponse pour l’instant.'
            : `${prediction.answer_count} réponse${prediction.answer_count > 1 ? 's' : ''} reçue${prediction.answer_count > 1 ? 's' : ''} pour l’instant — visibles à la Clôture.`}
        </Text>
      </View>
    );
  }

  if (hasAnswered && !editing) {
    const label =
      prediction.my_answer_option_id !== null
        ? optionLabelById.get(prediction.my_answer_option_id) ?? '…'
        : prediction.my_answer_text;
    return (
      <View style={styles.section}>
        <Text style={styles.eyebrow}>Ta réponse</Text>
        <Text style={styles.answerText}>{label}</Text>
        <Pressable onPress={() => setEditing(true)} hitSlop={4} style={styles.editLink}>
          <Text style={styles.editLinkText}>Modifier</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.section}>
      <Text style={styles.eyebrow}>Ta réponse</Text>
      {submitError && <Text style={styles.error}>{submitError}</Text>}
      {prediction.answer_format === 'choice' ? (
        options === null ? (
          <ActivityIndicator color={colors.text} style={styles.loader} />
        ) : (
          options.map((option) => (
            <Pressable
              key={option.id}
              onPress={() => handleSubmitOption(option.id)}
              disabled={submitting}
              style={[
                styles.optionChoice,
                prediction.my_answer_option_id === option.id && styles.optionChoiceActive,
              ]}
            >
              <Text
                style={[
                  styles.optionChoiceText,
                  prediction.my_answer_option_id === option.id && styles.optionChoiceTextActive,
                ]}
              >
                {option.label}
              </Text>
            </Pressable>
          ))
        )
      ) : (
        <>
          <TextInput
            value={draftText}
            onChangeText={setDraftText}
            placeholder="Ta réponse…"
            placeholderTextColor={colors.textFaint}
            multiline
            editable={!submitting}
            maxLength={MAX_ANSWER_LENGTH}
            style={styles.input}
          />
          <Pressable
            onPress={handleSubmitText}
            disabled={submitting || !draftText.trim()}
            style={[styles.submitButton, (submitting || !draftText.trim()) && styles.submitButtonDisabled]}
          >
            <Text style={styles.submitButtonText}>{submitting ? 'Envoi…' : 'Répondre'}</Text>
          </Pressable>
        </>
      )}
    </View>
  );
}

function createStyles(colors: Colors) {
  return StyleSheet.create({
    section: { marginTop: spacing.lg },
    eyebrow: { ...eyebrow(colors), marginBottom: 8 },
    hint: { fontSize: 14, color: colors.textFaint, lineHeight: 20 },
    loader: { marginTop: 8 },
    error: {
      color: colors.danger,
      backgroundColor: colors.dangerSoft,
      borderRadius: radius.sm,
      padding: 12,
      fontSize: 14,
      marginBottom: spacing.sm,
    },
    input: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.sm,
      paddingHorizontal: 14,
      paddingVertical: 12,
      fontSize: 16,
      color: colors.text,
      backgroundColor: colors.surface,
      minHeight: 60,
      textAlignVertical: 'top',
    },
    submitButton: {
      backgroundColor: colors.gold,
      borderRadius: radius.sm,
      paddingVertical: 12,
      alignItems: 'center',
      marginTop: spacing.sm,
    },
    submitButtonDisabled: { opacity: 0.5 },
    submitButtonText: { color: colors.textOnGold, fontSize: 15, fontWeight: '700' },
    optionChoice: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.sm,
      paddingHorizontal: 14,
      paddingVertical: 12,
      backgroundColor: colors.surface,
      marginBottom: 8,
    },
    optionChoiceActive: { borderColor: colors.gold, backgroundColor: colors.goldSoft },
    optionChoiceText: { fontSize: 15, fontWeight: '600', color: colors.text },
    optionChoiceTextActive: { color: colors.text, fontWeight: '700' },
    editLink: { marginTop: 8, alignSelf: 'flex-start' },
    editLinkText: { fontSize: 13, fontWeight: '700', color: colors.gold },
    answerText: { fontFamily: fonts.bodyEmphasis, fontSize: 16, color: colors.text },
    answerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingVertical: 10,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    answerBody: { flex: 1, minWidth: 0 },
    answerAuthor: { fontSize: 12, color: colors.textFaint, marginBottom: 2 },
    gradeButtons: { flexDirection: 'row', gap: 6 },
    gradeButton: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.pill,
      paddingHorizontal: 10,
      paddingVertical: 5,
    },
    gradeButtonCorrectActive: { borderColor: colors.neonGreen, backgroundColor: 'rgba(0, 230, 118, 0.12)' },
    gradeButtonIncorrectActive: { borderColor: colors.neonRed, backgroundColor: 'rgba(255, 23, 68, 0.12)' },
    gradeButtonText: { fontSize: 11, fontWeight: '700', color: colors.text },
    verdictCorrect: { fontSize: 16, fontWeight: '700', color: colors.neonGreen },
    verdictIncorrect: { fontSize: 16, fontWeight: '700', color: colors.neonRed },
  });
}
