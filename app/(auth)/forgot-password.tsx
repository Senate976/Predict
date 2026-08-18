import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Text } from '../../components/Text';
import { TextInput } from '../../components/TextInput';
import { sendPasswordReset } from '../../lib/settings';
import { eyebrow, fonts, radius, spacing, type Colors } from '../../lib/theme';
import { useColors } from '../../lib/themeMode';

/**
 * Demande d'un lien de réinitialisation.
 *
 * Le message de confirmation est volontairement le MÊME que l'adresse existe
 * ou non : répondre « ce compte n'existe pas » permettrait à n'importe qui de
 * tester des adresses pour savoir qui est inscrit sur Predict.
 */
export default function ForgotPasswordScreen() {
  const router = useRouter();
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    setError(null);
    if (!email.trim()) {
      setError('Renseigne ton adresse email.');
      return;
    }

    setSubmitting(true);
    const { error: resetError } = await sendPasswordReset(email);
    setSubmitting(false);

    if (resetError && /rate limit/i.test(resetError.message)) {
      setError('Trop de demandes. Réessaie dans quelques minutes.');
      return;
    }
    setSent(true);
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.column}>
          <Text style={styles.title}>Mot de passe oublié</Text>

          {sent ? (
            <>
              <Text style={styles.notice}>
                Si un compte existe avec cette adresse, un lien de réinitialisation vient
                de partir. Ouvre-le pour choisir un nouveau mot de passe — il est valable
                une heure. Pense à regarder tes spams.
              </Text>
              <Pressable onPress={() => router.replace('/login')} style={styles.submit}>
                <Text style={styles.submitText}>Retour à la connexion</Text>
              </Pressable>
            </>
          ) : (
            <>
              <Text style={styles.subtitle}>
                Indique l’adresse de ton compte. Nous t’enverrons un lien pour en choisir
                un nouveau.
              </Text>

              <View style={styles.field}>
                <Text style={styles.label}>Email</Text>
                <TextInput
                  value={email}
                  onChangeText={setEmail}
                  placeholder="toi@exemple.com"
                  placeholderTextColor={colors.textFaint}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="email"
                  editable={!submitting}
                  onSubmitEditing={handleSubmit}
                  returnKeyType="go"
                  style={styles.input}
                />
              </View>

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
                  <Text style={styles.submitText}>Envoyer le lien</Text>
                )}
              </Pressable>

              <Pressable onPress={() => router.replace('/login')} style={styles.switch}>
                <Text style={styles.switchText}>Revenir à la connexion</Text>
              </Pressable>
            </>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function createStyles(colors: Colors) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.background },
    scroll: { flexGrow: 1, justifyContent: 'center', padding: spacing.lg },
    column: { width: '100%', maxWidth: 460, alignSelf: 'center' },
    title: { fontFamily: fonts.display, fontSize: 30, color: colors.text, textAlign: 'center' },
    subtitle: {
      fontSize: 15,
      color: colors.textMuted,
      textAlign: 'center',
      lineHeight: 21,
      marginTop: 8,
      marginBottom: spacing.lg,
    },
    field: { marginBottom: spacing.md },
    label: { ...eyebrow(colors), marginBottom: 6 },
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
    error: {
      color: colors.danger,
      backgroundColor: colors.dangerSoft,
      borderRadius: radius.sm,
      padding: 12,
      fontSize: 14,
      lineHeight: 20,
      marginBottom: spacing.sm,
    },
    notice: {
      color: colors.text,
      backgroundColor: colors.accentSoft,
      borderRadius: radius.sm,
      padding: 14,
      fontSize: 15,
      lineHeight: 22,
      marginTop: spacing.md,
      marginBottom: spacing.lg,
    },
    submit: {
      backgroundColor: colors.accent,
      borderRadius: radius.pill,
      paddingVertical: 15,
      alignItems: 'center',
      marginTop: 4,
      minHeight: 52,
      justifyContent: 'center',
    },
    submitPressed: { backgroundColor: colors.accentBright },
    submitDisabled: { opacity: 0.6 },
    submitText: {
      fontFamily: fonts.sansBold,
      color: colors.textOnAccent,
      fontSize: 16,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    switch: { marginTop: 18, alignItems: 'center' },
    switchText: { fontFamily: fonts.bodyEmphasis, color: colors.text, fontSize: 15 },
  });
}
