import type { AuthError, PostgrestError } from '@supabase/supabase-js';
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

import { supabase } from '../../lib/supabase';

type Mode = 'signIn' | 'signUp';

const MIN_PASSWORD_LENGTH = 6;
const MIN_USERNAME_LENGTH = 3;
const MAX_USERNAME_LENGTH = 20;

/** Détecte les échecs réseau, qui remontent en anglais depuis fetch. */
function isNetworkFailure(message: string): boolean {
  return /failed to fetch|network request failed|networkerror|err_/i.test(message);
}

/** Traduit les erreurs Supabase Auth en messages lisibles. */
function authErrorMessage(error: AuthError): string {
  if (isNetworkFailure(error.message)) {
    return 'Connexion au serveur impossible. Vérifie ta connexion internet.';
  }

  switch (error.code) {
    case 'user_already_exists':
    case 'email_exists':
      return 'Cette adresse email est déjà utilisée.';
    case 'weak_password':
      return `Mot de passe trop faible (${MIN_PASSWORD_LENGTH} caractères minimum).`;
    case 'invalid_credentials':
      return 'Email ou mot de passe incorrect.';
    case 'email_not_confirmed':
      return 'Confirme ton adresse email avant de te connecter.';
    case 'email_address_invalid':
    case 'validation_failed':
      return 'Adresse email invalide.';
    case 'over_request_rate_limit':
    case 'over_email_send_rate_limit':
      return 'Trop de tentatives. Réessaie dans quelques minutes.';
    case 'signup_disabled':
      return 'Les inscriptions sont désactivées pour le moment.';
    default:
      return error.message;
  }
}

/** Traduit les erreurs d'insertion dans `profiles`. */
function profileErrorMessage(error: PostgrestError): string {
  // 23505 = violation de contrainte unique (username déjà pris).
  if (error.code === '23505') {
    return 'Ce pseudo est déjà pris, choisis-en un autre.';
  }
  return `Compte créé, mais le profil n'a pas pu être enregistré : ${error.message}`;
}

export default function LoginScreen() {
  const [mode, setMode] = useState<Mode>('signUp');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const isSignUp = mode === 'signUp';

  function switchMode() {
    setMode(isSignUp ? 'signIn' : 'signUp');
    setError(null);
    setNotice(null);
  }

  /** Vérifications locales, pour éviter un aller-retour réseau inutile. */
  function validate(): string | null {
    if (!email.trim()) return 'Renseigne ton adresse email.';
    if (!password) return 'Renseigne un mot de passe.';
    if (password.length < MIN_PASSWORD_LENGTH) {
      return `Le mot de passe doit contenir au moins ${MIN_PASSWORD_LENGTH} caractères.`;
    }
    if (isSignUp) {
      const trimmed = username.trim();
      if (trimmed.length < MIN_USERNAME_LENGTH) {
        return `Le pseudo doit contenir au moins ${MIN_USERNAME_LENGTH} caractères.`;
      }
      if (trimmed.length > MAX_USERNAME_LENGTH) {
        return `Le pseudo ne peut pas dépasser ${MAX_USERNAME_LENGTH} caractères.`;
      }
      if (!/^[a-zA-Z0-9_.]+$/.test(trimmed)) {
        return 'Le pseudo ne peut contenir que des lettres, chiffres, _ et .';
      }
    }
    return null;
  }

  async function handleSignUp() {
    const trimmedUsername = username.trim();

    const { data, error: signUpError } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      // Le username est aussi stocké dans les metadata : c'est le seul endroit
      // où il survit si la session n'est pas ouverte immédiatement (confirmation
      // d'email activée), et ça permet à un trigger côté base de le récupérer.
      options: { data: { username: trimmedUsername } },
    });

    if (signUpError) {
      setError(authErrorMessage(signUpError));
      return;
    }

    // Quand la confirmation d'email est activée, Supabase renvoie un
    // utilisateur factice sans identité pour ne pas divulguer les emails
    // existants. C'est le seul indice qu'on a que l'email est déjà pris.
    if (data.user && data.user.identities?.length === 0) {
      setError('Cette adresse email est déjà utilisée.');
      return;
    }

    if (!data.session) {
      setNotice(
        'Compte créé. Vérifie ta boîte mail pour confirmer ton adresse, puis connecte-toi.'
      );
      setMode('signIn');
      setPassword('');
      return;
    }

    // Session ouverte : on peut écrire dans `profiles`, la RLS voit bien
    // auth.uid(). `upsert` rend l'opération idempotente si un trigger côté base
    // a déjà créé la ligne.
    const { error: profileError } = await supabase
      .from('profiles')
      .upsert({ id: data.session.user.id, username: trimmedUsername });

    if (profileError) {
      setError(profileErrorMessage(profileError));
      return;
    }

    // La redirection est gérée par app/_layout.tsx via onAuthStateChange.
  }

  async function handleSignIn() {
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (signInError) {
      setError(authErrorMessage(signInError));
    }
  }

  async function handleSubmit() {
    setError(null);
    setNotice(null);

    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }

    setSubmitting(true);
    try {
      if (isSignUp) {
        await handleSignUp();
      } else {
        await handleSignIn();
      }
    } catch (unexpected) {
      const message =
        unexpected instanceof Error ? unexpected.message : String(unexpected);
      setError(
        isNetworkFailure(message)
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
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.brand}>Predict</Text>
          <Text style={styles.title}>
            {isSignUp ? 'Créer un compte' : 'Se connecter'}
          </Text>

          {isSignUp && (
            <View style={styles.field}>
              <Text style={styles.label}>Pseudo</Text>
              <TextInput
                value={username}
                onChangeText={setUsername}
                placeholder="ton_pseudo"
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="username"
                editable={!submitting}
                style={styles.input}
              />
            </View>
          )}

          <View style={styles.field}>
            <Text style={styles.label}>Email</Text>
            <TextInput
              value={email}
              onChangeText={setEmail}
              placeholder="toi@exemple.com"
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="email"
              editable={!submitting}
              style={styles.input}
            />
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Mot de passe</Text>
            <TextInput
              value={password}
              onChangeText={setPassword}
              placeholder={`${MIN_PASSWORD_LENGTH} caractères minimum`}
              secureTextEntry
              autoCapitalize="none"
              autoComplete={isSignUp ? 'new-password' : 'current-password'}
              editable={!submitting}
              onSubmitEditing={handleSubmit}
              returnKeyType="go"
              style={styles.input}
            />
          </View>

          {error && <Text style={styles.error}>{error}</Text>}
          {notice && <Text style={styles.notice}>{notice}</Text>}

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
              <Text style={styles.submitText}>
                {isSignUp ? 'Créer mon compte' : 'Se connecter'}
              </Text>
            )}
          </Pressable>

          <Pressable onPress={switchMode} disabled={submitting} style={styles.switch}>
            <Text style={styles.switchText}>
              {isSignUp
                ? 'Déjà un compte ? Se connecter'
                : 'Pas encore de compte ? En créer un'}
            </Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#fff' },
  flex: { flex: 1 },
  scroll: { flexGrow: 1, justifyContent: 'center', padding: 24 },
  brand: {
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 2,
    color: '#2563eb',
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  title: { fontSize: 26, fontWeight: '700', color: '#111', marginBottom: 28 },
  field: { marginBottom: 16 },
  label: { fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 6 },
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
  error: {
    color: '#b91c1c',
    backgroundColor: '#fef2f2',
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    marginBottom: 12,
  },
  notice: {
    color: '#166534',
    backgroundColor: '#f0fdf4',
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    marginBottom: 12,
  },
  submit: {
    backgroundColor: '#2563eb',
    borderRadius: 10,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 4,
    minHeight: 52,
    justifyContent: 'center',
  },
  submitPressed: { backgroundColor: '#1d4ed8' },
  submitDisabled: { opacity: 0.7 },
  submitText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  switch: { marginTop: 18, alignItems: 'center' },
  switchText: { color: '#2563eb', fontSize: 14, fontWeight: '600' },
});
