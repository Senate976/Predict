import type { ReactNode } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { colors, fonts, radius, spacing } from '../lib/theme';
import { PredictWord } from './PredictWord';

const STEPS: ReactNode[] = [
  <>
    Scellez votre <PredictWord /> et définissez sa date de révélation et à qui vous souhaitez le
    révéler.
  </>,
  'Partagez le teaser exclusif à votre Cercle.',
  'Révélez la vérité le jour J et laissez vos proches confirmer si votre intuition était la bonne.',
];

/**
 * Écran de bienvenue affiché une seule fois, juste après l'inscription
 * (`profiles.onboarded = false` par défaut). `onStart` ferme la modale
 * (`markOnboarded`, côté appelant) et enchaîne directement sur la création de
 * la première prédiction — c'est la seule sortie prévue, volontairement : pas
 * de « passer », l'écran doit pousser vers l'action.
 */
export function WelcomeOnboarding({
  visible,
  onStart,
}: {
  visible: boolean;
  onStart: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <ScrollView contentContainerStyle={styles.scroll}>
            <Text style={styles.brand}>
              <PredictWord />
            </Text>
            <Text style={styles.title}>
              Bienvenue sur <PredictWord />.
            </Text>
            <Text style={styles.lead}>
              Prédisez tout, n’importe quoi, mais surtout : prouvez-le à vos amis.
            </Text>

            {STEPS.map((step, index) => (
              <View key={index} style={styles.stepRow}>
                <View style={styles.stepNumber}>
                  <Text style={styles.stepNumberText}>{index + 1}</Text>
                </View>
                <Text style={styles.stepText}>{step}</Text>
              </View>
            ))}

            <Text style={styles.body}>
              Accumulez les <PredictWord /> réussis, débloquez des badges de prestige
              et montrez à votre réseau qui avait raison depuis le début.
            </Text>

            <Text style={styles.closing}>À vous de jouer.</Text>

            <Pressable
              onPress={onStart}
              style={({ pressed }) => [styles.cta, pressed && styles.ctaPressed]}
            >
              <Text style={styles.ctaText}>
                Sceller mon premier <PredictWord />
              </Text>
            </Pressable>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(23, 21, 18, 0.55)',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  card: {
    maxHeight: '92%',
    backgroundColor: colors.background,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
  },
  scroll: { padding: spacing.lg },
  brand: {
    fontFamily: fonts.serifItalic,
    fontSize: 13,
    letterSpacing: 4,
    color: colors.gold,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  title: {
    fontFamily: fonts.serifItalic,
    fontSize: 30,
    color: colors.text,
    marginBottom: 14,
  },
  lead: {
    fontSize: 16,
    color: colors.text,
    lineHeight: 22,
    marginBottom: spacing.lg,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: spacing.md,
  },
  stepNumber: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.gold,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  stepNumberText: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },
  stepText: { flex: 1, fontSize: 15, color: colors.text, lineHeight: 21 },
  body: {
    fontSize: 15,
    color: colors.textMuted,
    lineHeight: 21,
    marginTop: spacing.xs,
    marginBottom: spacing.md,
  },
  closing: {
    fontFamily: fonts.serifItalic,
    fontSize: 20,
    color: colors.gold,
    marginBottom: spacing.lg,
  },
  cta: {
    backgroundColor: colors.gold,
    borderRadius: radius.sm,
    paddingVertical: 16,
    alignItems: 'center',
  },
  ctaPressed: { backgroundColor: colors.goldBright },
  ctaText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
});
