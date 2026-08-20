import { useEffect, useMemo, useState } from 'react';
import { Pressable, ActivityIndicator, StyleSheet, View } from 'react-native';
import { Text } from './Text';

import {
  fetchAnswerOptions,
  fetchPredictionAnswers,
  fetchPredictionVoters,
  setAnswerCorrectness,
  type PredictionAnswer,
  type PredictionAnswerOption,
  type PredictionVoter,
} from '../lib/questions';
import type { PredictionFeedItem } from '../lib/predictions';
import { eyebrow, fonts, radius, spacing, type Colors } from '../lib/theme';
import { useColors } from '../lib/themeMode';
import { Avatar } from './Avatar';
import { InlineQuestionAnswer } from './InlineQuestionAnswer';

/**
 * Le cœur d'une carte Question sur l'écran détail — remplace le bloc
 * contenu + Verdict d'une Déclaration (`app/(app)/prediction/[id].tsx`).
 *
 * Avant Clôture : tout le monde peut répondre, auteur inclus
 * (`InlineQuestionAnswer`) — l'auteur voit en plus QUI a répondu
 * (`fetchPredictionVoters`), jamais QUOI : le détail des réponses des
 * autres reste caché jusqu'à la Clôture (voir schema.sql section 42).
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

  // Chargées ici (pas dans `InlineQuestionAnswer`, qui n'en a pas besoin
  // avant Clôture) uniquement pour étiqueter les réponses à choix une fois
  // la liste affichée ci-dessous.
  const [options, setOptions] = useState<PredictionAnswerOption[] | null>(null);
  const [answers, setAnswers] = useState<PredictionAnswer[] | null>(null);
  const [answersError, setAnswersError] = useState<string | null>(null);
  const [gradingId, setGradingId] = useState<string | null>(null);
  // Les votants — l'identité seule, chargée uniquement pour l'auteur et
  // uniquement avant Clôture : après, la liste complète des réponses ci-dessous
  // dit déjà qui a répondu.
  const [voters, setVoters] = useState<PredictionVoter[] | null>(null);

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
    if (closed || !isAuthor) return;
    let cancelled = false;
    fetchPredictionVoters(prediction.id).then(({ data }) => {
      if (!cancelled) setVoters(data ?? []);
    });
    return () => {
      cancelled = true;
    };
    // `answer_count` en dépendance : quand quelqu'un vient de répondre,
    // l'écran parent recharge la prédiction et la liste se rafraîchit avec.
  }, [prediction.id, prediction.answer_count, closed, isAuthor]);

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

  const optionLabelById = new Map((options ?? []).map((o) => [o.id, o.label]));

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

  return (
    <View style={styles.section}>
      {/* L'auteur voit ce compteur global en plus de son propre formulaire
       * juste en dessous — jamais le détail des réponses des autres avant
       * Clôture, mais rien ne l'empêche de répondre à sa propre Question
       * comme n'importe quel destinataire. */}
      {isAuthor && (
        <>
          <Text style={styles.eyebrow}>Réponses</Text>
          <Text style={styles.hint}>
            {prediction.answer_count === 0
              ? 'Aucune réponse pour l’instant.'
              : `${prediction.answer_count} réponse${prediction.answer_count > 1 ? 's' : ''} reçue${prediction.answer_count > 1 ? 's' : ''} pour l’instant — visibles à la Clôture.`}
          </Text>
          {/* Qui a répondu, sans ce qui a été répondu. */}
          {!!voters?.length && (
            <View style={styles.votersRow}>
              {voters.map((v) => (
                <View key={v.user_id} style={styles.voterChip}>
                  <Avatar url={v.avatar_url} username={v.username} size={22} />
                  <Text style={styles.voterName} numberOfLines={1}>
                    {v.username}
                  </Text>
                </View>
              ))}
            </View>
          )}
        </>
      )}
      {/* Plus d'intitulé « Ta réponse » ici : `InlineQuestionAnswer` écrit
          déjà « Ta réponse : … » une fois répondu, et son champ porte le même
          mot en indication tant qu'on ne l'a pas fait. Le titre en petites
          capitales redisait donc, en plus petit, ce qui se lisait juste
          en dessous. */}
      <View style={isAuthor ? styles.eyebrowSpaced : undefined}>
        <InlineQuestionAnswer prediction={prediction} onAnswered={onAnswered} />
      </View>
    </View>
  );
}

function createStyles(colors: Colors) {
  return StyleSheet.create({
    section: { marginTop: spacing.lg },
    eyebrow: { ...eyebrow(colors), marginBottom: 8 },
    eyebrowSpaced: { marginTop: spacing.md },
    hint: { fontSize: 14, color: colors.textFaint, lineHeight: 20 },
    loader: { marginTop: 8 },
    votersRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
    voterChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.pill,
      paddingLeft: 4,
      paddingRight: 10,
      paddingVertical: 4,
      maxWidth: '100%',
    },
    voterName: { fontFamily: fonts.bodyEmphasis, fontSize: 14, color: colors.textMuted, flexShrink: 1 },
    error: {
      color: colors.danger,
      backgroundColor: colors.dangerSoft,
      borderRadius: radius.sm,
      padding: 12,
      fontSize: 14,
      marginBottom: spacing.sm,
    },
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
    answerAuthor: { fontSize: 14, color: colors.textFaint, marginBottom: 2 },
    gradeButtons: { flexDirection: 'row', gap: 6 },
    gradeButton: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.pill,
      paddingHorizontal: 10,
      paddingVertical: 5,
    },
    // Même registre que les boutons Réalisé/Manqué d'une Déclaration
    // (`PredictionCard`) : Correcte en accent plein, Incorrecte en contour
    // neutre — plus de vert/rouge, une seule couleur d'accent dans toute
    // l'app.
    gradeButtonCorrectActive: { borderColor: colors.accent, backgroundColor: colors.accentSoft },
    gradeButtonIncorrectActive: { borderColor: colors.ink, backgroundColor: colors.border },
    gradeButtonText: { fontSize: 13, fontWeight: '700', color: colors.text },
    verdictCorrect: { fontSize: 16, fontWeight: '700', color: colors.accent },
    verdictIncorrect: { fontSize: 16, fontWeight: '700', color: colors.ink },
  });
}
