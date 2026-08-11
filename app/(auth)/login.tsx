import type { AuthError, PostgrestError } from '@supabase/supabase-js';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { Text } from '../../components/Text';
import { TextInput } from '../../components/TextInput';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PredictWord } from '../../components/PredictWord';
import { supabase } from '../../lib/supabase';
import { eyebrow, fonts, radius, spacing, type Colors } from '../../lib/theme';
import { useColors } from '../../lib/themeMode';

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
    // Erreur côté base pendant la création de l'utilisateur. Le seul traitement
    // base branché sur auth.users est le trigger on_auth_user_created, et la
    // seule contrainte qu'il peut violer est l'unicité du pseudo : deux
    // inscriptions simultanées passent toutes les deux la vérification
    // préalable, puis l'index unique en recale une.
    case 'unexpected_failure':
      return 'Ce pseudo vient d’être pris, choisis-en un autre.';
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

/**
 * Indique si le pseudo est libre, ou `null` si la vérification n'a pas abouti.
 *
 * Passe par la RPC `is_username_available` et non par un select sur `profiles` :
 * on est encore anonyme à ce stade, et la policy de lecture est réservée aux
 * utilisateurs connectés — un select direct renverrait 0 ligne pour n'importe
 * quel pseudo et les déclarerait tous libres.
 *
 * En cas d'échec on renvoie `null` plutôt que de bloquer l'inscription : c'est
 * un contrôle de confort, l'index unique côté base reste le vrai garde-fou.
 */
async function checkUsernameAvailable(candidate: string): Promise<boolean | null> {
  const { data, error } = await supabase.rpc('is_username_available', {
    candidate,
  });

  if (error || typeof data !== 'boolean') return null;
  return data;
}

export default function LoginScreen() {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
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

    // Avant signUp : sans ça, un pseudo déjà pris fait échouer le trigger
    // on_auth_user_created, ce qui annule la création du compte et ne remonte
    // qu'une erreur opaque.
    if ((await checkUsernameAvailable(trimmedUsername)) === false) {
      setError('Ce pseudo est déjà pris, choisis-en un autre.');
      return;
    }

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
          <Text style={styles.brand}>
            <PredictWord />
          </Text>
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
              <Text style={styles.fieldHint}>
                {MIN_USERNAME_LENGTH} à {MAX_USERNAME_LENGTH} caractères — lettres, chiffres, « _ » et « . » uniquement.
              </Text>
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
              <ActivityIndicator color={colors.text} />
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

function createStyles(colors: Colors) {
  return StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  scroll: { flexGrow: 1, justifyContent: 'center', padding: spacing.lg },
  brand: {
    fontFamily: fonts.display,
    fontSize: 18,
    letterSpacing: 4,
    color: colors.text,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  title: {
    fontFamily: fonts.display,
    fontSize: 30,
    color: colors.text,
    marginBottom: 28,
  },
  field: { marginBottom: spacing.md },
  label: { ...eyebrow(colors), marginBottom: 6 },
  fieldHint: { fontSize: 12, color: colors.textFaint, marginTop: 6 },
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
    marginBottom: spacing.sm,
  },
  notice: {
    color: colors.text,
    backgroundColor: colors.accentSoft,
    borderRadius: radius.sm,
    padding: 12,
    fontSize: 14,
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
  // Texte sombre sur le bouton jaune — `text` (blanc en mode sombre) y serait peu lisible.
  submitText: { fontFamily: fonts.sansBold, color: colors.textOnAccent, fontSize: 16, textTransform: 'uppercase', letterSpacing: 0.5 },
  switch: { marginTop: 18, alignItems: 'center' },
  switchText: { fontFamily: fonts.bodyEmphasis, color: colors.text, fontSize: 14 },
  });
}
