import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text } from '../../../components/Text';
import { TextInput } from '../../../components/TextInput';

import { useAuth } from '../../../lib/auth';
import {
  authErrorMessage,
  isUsernameAvailable,
  MAX_USERNAME_LENGTH,
  MIN_USERNAME_LENGTH,
  updateEmail,
  updateUsername,
  usernameErrorMessage,
} from '../../../lib/settings';
import { eyebrow, fonts, radius, spacing, type Colors } from '../../../lib/theme';
import { useColors } from '../../../lib/themeMode';

/** Nom d'utilisateur et email — les deux identifiants du compte, jamais
 * modifiables ailleurs dans l'app (le Profil ne fait qu'afficher le
 * pseudo). */
export default function AccountSettingsScreen() {
  const router = useRouter();
  const { session, username: currentUsername } = useAuth();
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const userId = session?.user.id;

  const [username, setUsername] = useState(currentUsername ?? '');
  const [usernameSaving, setUsernameSaving] = useState(false);
  const [usernameError, setUsernameError] = useState<string | null>(null);
  const [usernameSaved, setUsernameSaved] = useState(false);

  const [email, setEmail] = useState(session?.user.email ?? '');
  const [emailSaving, setEmailSaving] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [emailSent, setEmailSent] = useState(false);

  const usernameChanged = username.trim() !== (currentUsername ?? '') && username.trim().length > 0;
  const emailChanged = email.trim() !== (session?.user.email ?? '') && email.trim().length > 0;

  async function handleSaveUsername() {
    if (!userId) return;
    const trimmed = username.trim();
    setUsernameError(null);
    setUsernameSaved(false);

    if (trimmed.length < MIN_USERNAME_LENGTH || trimmed.length > MAX_USERNAME_LENGTH) {
      setUsernameError(`${MIN_USERNAME_LENGTH} à ${MAX_USERNAME_LENGTH} caractères.`);
      return;
    }

    setUsernameSaving(true);
    try {
      const available = await isUsernameAvailable(trimmed);
      if (available === false) {
        setUsernameError('Ce pseudo est déjà pris, choisis-en un autre.');
        return;
      }

      const { error } = await updateUsername(userId, trimmed);
      if (error) {
        setUsernameError(usernameErrorMessage(error));
        return;
      }
      setUsernameSaved(true);
    } finally {
      setUsernameSaving(false);
    }
  }

  async function handleSaveEmail() {
    const trimmed = email.trim();
    setEmailError(null);
    setEmailSent(false);
    setEmailSaving(true);
    try {
      const { error } = await updateEmail(trimmed);
      if (error) {
        setEmailError(authErrorMessage(error));
        return;
      }
      setEmailSent(true);
    } finally {
      setEmailSaving(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <Text style={styles.back}>Retour</Text>
        </Pressable>
        <Text style={styles.headerTitle}>Compte</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.eyebrow}>Nom d’utilisateur</Text>
        <TextInput
          value={username}
          onChangeText={(v) => {
            setUsername(v);
            setUsernameSaved(false);
          }}
          placeholder="ton_pseudo"
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="username"
          editable={!usernameSaving}
          style={styles.input}
        />
        <Text style={styles.hint}>
          {MIN_USERNAME_LENGTH} à {MAX_USERNAME_LENGTH} caractères. Visible de tout ton Cercle.
        </Text>
        {usernameError && <Text style={styles.error}>{usernameError}</Text>}
        {usernameSaved && <Text style={styles.success}>Pseudo mis à jour.</Text>}
        <Pressable
          onPress={handleSaveUsername}
          disabled={!usernameChanged || usernameSaving}
          style={[styles.button, (!usernameChanged || usernameSaving) && styles.buttonDisabled]}
        >
          {usernameSaving ? (
            <ActivityIndicator color={colors.background} size="small" />
          ) : (
            <Text style={styles.buttonText}>Enregistrer</Text>
          )}
        </Pressable>

        <Text style={[styles.eyebrow, styles.sectionSpacing]}>Email</Text>
        <TextInput
          value={email}
          onChangeText={(v) => {
            setEmail(v);
            setEmailSent(false);
          }}
          placeholder="toi@exemple.com"
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="email"
          editable={!emailSaving}
          style={styles.input}
        />
        <Text style={styles.hint}>
          {session?.user.email_confirmed_at ? 'Adresse confirmée.' : 'Confirmation en attente.'}
        </Text>
        {emailError && <Text style={styles.error}>{emailError}</Text>}
        {emailSent && (
          <Text style={styles.success}>
            Vérifie ta boîte mail : un lien de confirmation a été envoyé aux deux adresses.
          </Text>
        )}
        <Pressable
          onPress={handleSaveEmail}
          disabled={!emailChanged || emailSaving}
          style={[styles.button, (!emailChanged || emailSaving) && styles.buttonDisabled]}
        >
          {emailSaving ? (
            <ActivityIndicator color={colors.background} size="small" />
          ) : (
            <Text style={styles.buttonText}>Changer l’email</Text>
          )}
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

function createStyles(colors: Colors) {
  return StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerTitle: { fontFamily: fonts.display, fontSize: 17, color: colors.text },
  back: { fontSize: 15, color: colors.text, width: 56 },
  headerSpacer: { width: 56 },
  scroll: { padding: spacing.lg, paddingBottom: 48 },
  eyebrow: { ...eyebrow(colors), marginBottom: 8 },
  sectionSpacing: { marginTop: spacing.xl },
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
  hint: { fontSize: 12, color: colors.textFaint, marginTop: 6 },
  error: {
    color: colors.danger,
    backgroundColor: colors.dangerSoft,
    borderRadius: radius.sm,
    padding: 10,
    fontSize: 13,
    marginTop: 8,
  },
  success: { color: colors.textMuted, fontSize: 13, marginTop: 8 },
  button: {
    marginTop: 12,
    alignSelf: 'flex-start',
    backgroundColor: colors.text,
    borderRadius: radius.pill,
    paddingHorizontal: 18,
    paddingVertical: 11,
    minWidth: 130,
    alignItems: 'center',
  },
  buttonDisabled: { opacity: 0.4 },
  buttonText: { color: colors.background, fontSize: 14, fontWeight: '700' },
  });
}
