import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text } from '../../../components/Text';
import { TextInput } from '../../../components/TextInput';

import { useAuth } from '../../../lib/auth';
import { authErrorMessage, deleteOwnAccount, MIN_PASSWORD_LENGTH, updatePassword } from '../../../lib/settings';
import { eyebrow, fonts, radius, spacing, type Colors } from '../../../lib/theme';
import { useColors } from '../../../lib/themeMode';

export default function SecuritySettingsScreen() {
  const router = useRouter();
  const { signOut } = useAuth();
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSaved, setPasswordSaved] = useState(false);

  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  async function handleChangePassword() {
    setPasswordError(null);
    setPasswordSaved(false);

    if (password.length < MIN_PASSWORD_LENGTH) {
      setPasswordError(`Mot de passe trop faible (${MIN_PASSWORD_LENGTH} caractères minimum).`);
      return;
    }
    if (password !== passwordConfirm) {
      setPasswordError('Les deux mots de passe ne correspondent pas.');
      return;
    }

    setPasswordSaving(true);
    try {
      const { error } = await updatePassword(password);
      if (error) {
        setPasswordError(authErrorMessage(error));
        return;
      }
      setPassword('');
      setPasswordConfirm('');
      setPasswordSaved(true);
    } finally {
      setPasswordSaving(false);
    }
  }

  async function runDeleteAccount() {
    setDeleteError(null);
    setDeleting(true);
    try {
      const { error } = await deleteOwnAccount();
      if (error) {
        setDeleteError(`Suppression impossible : ${error.message}`);
        return;
      }
      await signOut();
    } finally {
      setDeleting(false);
    }
  }

  function handleDeleteAccount() {
    const message =
      'Ton compte, tes Predicts, tes commentaires et tout ton historique seront supprimés définitivement. Cette action est irréversible.';

    if (Platform.OS === 'web') {
      if (window.confirm(`Supprimer définitivement ton compte ?\n\n${message}`)) runDeleteAccount();
      return;
    }
    Alert.alert('Supprimer définitivement ton compte ?', message, [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Supprimer', style: 'destructive', onPress: runDeleteAccount },
    ]);
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <Text style={styles.back}>Retour</Text>
        </Pressable>
        <Text style={styles.headerTitle}>Sécurité</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.eyebrow}>Changer le mot de passe</Text>
        <TextInput
          value={password}
          onChangeText={(v) => {
            setPassword(v);
            setPasswordSaved(false);
          }}
          placeholder="Nouveau mot de passe"
          secureTextEntry
          autoCapitalize="none"
          autoComplete="new-password"
          editable={!passwordSaving}
          style={styles.input}
        />
        <TextInput
          value={passwordConfirm}
          onChangeText={(v) => {
            setPasswordConfirm(v);
            setPasswordSaved(false);
          }}
          placeholder="Confirmer le mot de passe"
          secureTextEntry
          autoCapitalize="none"
          autoComplete="new-password"
          editable={!passwordSaving}
          style={[styles.input, styles.inputSpacing]}
        />
        {passwordError && <Text style={styles.error}>{passwordError}</Text>}
        {passwordSaved && <Text style={styles.success}>Mot de passe mis à jour.</Text>}
        <Pressable
          onPress={handleChangePassword}
          disabled={passwordSaving || !password || !passwordConfirm}
          style={[
            styles.button,
            (passwordSaving || !password || !passwordConfirm) && styles.buttonDisabled,
          ]}
        >
          {passwordSaving ? (
            <ActivityIndicator color={colors.background} size="small" />
          ) : (
            <Text style={styles.buttonText}>Enregistrer</Text>
          )}
        </Pressable>

        <Pressable onPress={signOut} style={[styles.signOut, styles.sectionSpacing]}>
          <Text style={styles.signOutText}>Se déconnecter</Text>
        </Pressable>

        <Text style={[styles.eyebrow, styles.dangerSpacing]}>Zone de danger</Text>
        <View style={styles.dangerBox}>
          <Text style={styles.dangerText}>
            Supprimer ton compte efface définitivement ton profil, tes Predicts et tout ce qui s’y rattache.
          </Text>
          {deleteError && <Text style={styles.error}>{deleteError}</Text>}
          <Pressable
            onPress={handleDeleteAccount}
            disabled={deleting}
            style={[styles.deleteButton, deleting && styles.buttonDisabled]}
          >
            {deleting ? (
              <ActivityIndicator color={colors.danger} size="small" />
            ) : (
              <Text style={styles.deleteButtonText}>Supprimer mon compte</Text>
            )}
          </Pressable>
        </View>
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
  dangerSpacing: { marginTop: spacing.xl * 1.5 },
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
  inputSpacing: { marginTop: 10 },
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
  signOut: {
    paddingVertical: 15,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
  signOutText: { fontSize: 14, fontWeight: '600', color: colors.textMuted },
  dangerBox: {
    marginTop: 8,
    padding: 16,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.danger,
    backgroundColor: colors.dangerSoft,
  },
  dangerText: { fontSize: 13, color: colors.text, lineHeight: 19 },
  deleteButton: {
    marginTop: 14,
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: colors.danger,
    borderRadius: radius.pill,
    paddingHorizontal: 18,
    paddingVertical: 11,
  },
  deleteButtonText: { color: colors.danger, fontSize: 14, fontWeight: '700' },
  });
}
