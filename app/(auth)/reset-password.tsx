import { Check, Eye, EyeOff, X } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Text } from '../../components/Text';
import { TextInput } from '../../components/TextInput';
import { useAuth } from '../../lib/auth';
import { PASSWORD_RULES, passwordIssues } from '../../lib/password';
import { updatePassword } from '../../lib/settings';
import { eyebrow, fonts, radius, spacing, type Colors } from '../../lib/theme';
import { useColors } from '../../lib/themeMode';

/**
 * Choix du nouveau mot de passe, après avoir suivi le lien reçu par email.
 *
 * On n'arrive ici que par la redirection de `RootNavigator` quand `recovering`
 * est vrai — c'est-à-dire quand la session ouverte vient d'un lien de
 * récupération. `endRecovery()` referme cette parenthèse une fois le mot de
 * passe enregistré, ce qui laisse la navigation normale reprendre la main et
 * emmener l'utilisateur sur le Fil, connecté.
 */
export default function ResetPasswordScreen() {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { endRecovery, signOut } = useAuth();
  const [password, setPassword] = useState('');
  const [visible, setVisible] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    setError(null);
    const issues = passwordIssues(password);
    if (issues.length > 0) {
      setError(`Mot de passe incomplet — il manque : ${issues.join(', ').toLowerCase()}.`);
      return;
    }

    setSubmitting(true);
    const { error: updateError } = await updatePassword(password);
    setSubmitting(false);

    if (updateError) {
      setError(updateError.message || 'Enregistrement impossible.');
      return;
    }
    endRecovery();
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.column}>
          <Text style={styles.title}>Nouveau mot de passe</Text>
          <Text style={styles.subtitle}>
            Choisis-en un nouveau. Tu seras connecté directement après l’enregistrement.
          </Text>

          <View style={styles.field}>
            <Text style={styles.label}>Mot de passe</Text>
            <View style={styles.passwordRow}>
              <TextInput
                value={password}
                onChangeText={setPassword}
                placeholder="Choisis un mot de passe"
                placeholderTextColor={colors.textFaint}
                secureTextEntry={!visible}
                autoCapitalize="none"
                autoComplete="new-password"
                autoFocus
                editable={!submitting}
                onSubmitEditing={handleSubmit}
                returnKeyType="go"
                style={[styles.input, styles.passwordInput]}
              />
              <Pressable
                onPress={() => setVisible((v) => !v)}
                style={styles.passwordToggle}
                hitSlop={8}
                accessibilityLabel={visible ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
              >
                {visible ? (
                  <EyeOff size={20} color={colors.icon} strokeWidth={1.75} />
                ) : (
                  <Eye size={20} color={colors.icon} strokeWidth={1.75} />
                )}
              </Pressable>
            </View>

            {password.length > 0 && (
              <View style={styles.rules}>
                {PASSWORD_RULES.map((rule) => {
                  const ok = rule.test(password);
                  return (
                    <View key={rule.label} style={styles.ruleRow}>
                      {ok ? (
                        <Check size={15} color={colors.accent} strokeWidth={3} />
                      ) : (
                        <X size={15} color={colors.textFaint} strokeWidth={2.5} />
                      )}
                      <Text style={[styles.ruleText, ok && styles.ruleTextOk]}>{rule.label}</Text>
                    </View>
                  );
                })}
              </View>
            )}
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
              <Text style={styles.submitText}>Enregistrer</Text>
            )}
          </Pressable>

          {/* Sortie de secours : sans elle, quelqu'un qui ouvre le lien par
              erreur resterait bloqué sur cet écran, puisque la redirection y
              ramène tant que la récupération est en cours. */}
          <Pressable
            onPress={() => {
              endRecovery();
              signOut();
            }}
            disabled={submitting}
            style={styles.switch}
          >
            <Text style={styles.switchText}>Annuler et revenir à la connexion</Text>
          </Pressable>
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
    passwordRow: { position: 'relative', justifyContent: 'center' },
    passwordInput: { paddingRight: 48 },
    passwordToggle: { position: 'absolute', right: 12, height: '100%', justifyContent: 'center' },
    rules: { marginTop: 10, gap: 5 },
    ruleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    ruleText: { fontSize: 14, color: colors.textFaint },
    ruleTextOk: { color: colors.text },
    error: {
      color: colors.danger,
      backgroundColor: colors.dangerSoft,
      borderRadius: radius.sm,
      padding: 12,
      fontSize: 14,
      lineHeight: 20,
      marginBottom: spacing.sm,
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
