import type { AuthError, PostgrestError } from '@supabase/supabase-js';
import { Check, Eye, EyeOff, X } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PredictWord } from '../../components/PredictWord';
import { Text } from '../../components/Text';
import { TextInput } from '../../components/TextInput';
import { LEGAL_CONTENT } from '../../lib/legalContent';
import { MIN_PASSWORD_LENGTH, PASSWORD_RULES, passwordIssues } from '../../lib/password';
import { DEFAULT_NOTIFICATION_PREFS } from '../../lib/settings';
import type { LegalDocId } from '../../lib/settingsSections';
import { supabase } from '../../lib/supabase';
import { eyebrow, fonts, radius, spacing, type Colors } from '../../lib/theme';
import { useColors } from '../../lib/themeMode';

type Mode = 'signIn' | 'signUp';

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
      return `Mot de passe trop faible (${MIN_PASSWORD_LENGTH} caractères minimum, dont un chiffre et un signe).`;
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

/** Case à cocher carrée, reprise du reste de l'app (écran de création). */
function Checkbox({ checked }: { checked: boolean }) {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <View style={[styles.checkbox, checked && styles.checkboxChecked]}>
      {checked && <Check size={14} color={colors.background} strokeWidth={3} />}
    </View>
  );
}

export default function LoginScreen() {
  const router = useRouter();
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [mode, setMode] = useState<Mode>('signUp');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [username, setUsername] = useState('');
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [notificationsAccepted, setNotificationsAccepted] = useState(true);
  const [openDoc, setOpenDoc] = useState<LegalDocId | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const isSignUp = mode === 'signUp';
  // La liste des exigences ne s'affiche qu'une fois la saisie commencée : à
  // vide, elle se lirait comme quatre reproches avant même d'avoir tapé.
  const showPasswordRules = isSignUp && password.length > 0;

  function switchMode() {
    setMode(isSignUp ? 'signIn' : 'signUp');
    setError(null);
    setNotice(null);
  }

  /** Vérifications locales, pour éviter un aller-retour réseau inutile. */
  function validate(): string | null {
    if (!email.trim()) return 'Renseigne ton adresse email.';
    if (!password) return 'Renseigne un mot de passe.';

    if (isSignUp) {
      const issues = passwordIssues(password);
      if (issues.length > 0) {
        return `Mot de passe incomplet — il manque : ${issues.join(', ').toLowerCase()}.`;
      }

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
      if (!termsAccepted) {
        return 'Accepte les Conditions Générales d’Utilisation pour créer ton compte.';
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

    // Refusées à l'inscription, toutes les notifications partent à `false`.
    // Le réglage reste modifiable ensuite (Réglages › Notifications) : c'est
    // un choix de départ, pas une porte fermée.
    const notificationPrefs = notificationsAccepted
      ? DEFAULT_NOTIFICATION_PREFS
      : Object.fromEntries(Object.keys(DEFAULT_NOTIFICATION_PREFS).map((k) => [k, false]));

    const { data, error: signUpError } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      // Le username est aussi stocké dans les metadata : c'est le seul endroit
      // où il survit si la session n'est pas ouverte immédiatement (confirmation
      // d'email activée), et ça permet à un trigger côté base de le récupérer.
      // L'acceptation des CGU y est jointe pour la même raison : elle doit être
      // horodatée au moment du consentement, pas à la première connexion.
      options: {
        data: {
          username: trimmedUsername,
          terms_accepted_at: new Date().toISOString(),
          notifications_opt_in: notificationsAccepted,
        },
      },
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
        `Compte créé. Un email de confirmation vient de partir vers ${email.trim()} — ouvre-le pour activer ton compte, puis reviens te connecter. Pense à regarder tes spams.`
      );
      setMode('signIn');
      setPassword('');
      return;
    }

    // Session ouverte : on peut écrire dans `profiles`, la RLS voit bien
    // auth.uid(). `upsert` rend l'opération idempotente si un trigger côté base
    // a déjà créé la ligne.
    const { error: profileError } = await supabase.from('profiles').upsert({
      id: data.session.user.id,
      username: trimmedUsername,
      terms_accepted_at: new Date().toISOString(),
      notification_prefs: notificationPrefs,
    });

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

  const doc = openDoc ? LEGAL_CONTENT[openDoc] : null;

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
          {/* Colonne de largeur bornée, centrée : sur un navigateur large, un
              formulaire étalé sur 1400 px se lit mal et fait tout sauf sérieux. */}
          <View style={styles.column}>
            <View style={styles.headerBlock}>
              <Text style={styles.brand}>
                <PredictWord />
              </Text>
              <Text style={styles.tagline}>Scelle tes prédictions. Le temps te donnera raison.</Text>
            </View>

            <Text style={styles.title}>
              {isSignUp ? 'Créer un compte' : 'Bon retour'}
            </Text>
            <Text style={styles.subtitle}>
              {isSignUp
                ? 'Trois informations suffisent. Ton pseudo est ce que ton Cercle verra.'
                : 'Retrouve ton Cercle et tes Predicts en attente.'}
            </Text>

            {isSignUp && (
              <View style={styles.field}>
                <View style={styles.labelRow}>
                  <Text style={styles.label}>Pseudo</Text>
                  <Text style={styles.required}>obligatoire</Text>
                </View>
                <TextInput
                  value={username}
                  onChangeText={setUsername}
                  placeholder="ton_pseudo"
                  placeholderTextColor={colors.textFaint}
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="username"
                  editable={!submitting}
                  style={styles.input}
                />
                <Text style={styles.fieldHint}>
                  {MIN_USERNAME_LENGTH} à {MAX_USERNAME_LENGTH} caractères — lettres, chiffres, « _ » et « . ».
                  C’est par lui qu’on t’ajoutera dans un Cercle.
                </Text>
              </View>
            )}

            <View style={styles.field}>
              <View style={styles.labelRow}>
                <Text style={styles.label}>Email</Text>
                <Text style={styles.required}>obligatoire</Text>
              </View>
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
                style={styles.input}
              />
            </View>

            <View style={styles.field}>
              <View style={styles.labelRow}>
                <Text style={styles.label}>Mot de passe</Text>
                <Text style={styles.required}>obligatoire</Text>
              </View>
              <View style={styles.passwordRow}>
                <TextInput
                  value={password}
                  onChangeText={setPassword}
                  placeholder={isSignUp ? 'Choisis un mot de passe' : 'Ton mot de passe'}
                  placeholderTextColor={colors.textFaint}
                  secureTextEntry={!passwordVisible}
                  autoCapitalize="none"
                  autoComplete={isSignUp ? 'new-password' : 'current-password'}
                  editable={!submitting}
                  onSubmitEditing={handleSubmit}
                  returnKeyType="go"
                  style={[styles.input, styles.passwordInput]}
                />
                <Pressable
                  onPress={() => setPasswordVisible((v) => !v)}
                  style={styles.passwordToggle}
                  hitSlop={8}
                  accessibilityLabel={passwordVisible ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
                >
                  {passwordVisible ? (
                    <EyeOff size={20} color={colors.icon} strokeWidth={1.75} />
                  ) : (
                    <Eye size={20} color={colors.icon} strokeWidth={1.75} />
                  )}
                </Pressable>
              </View>

              {/* Chaque règle se coche en direct pendant la frappe : on sait
                  toujours ce qu'il reste à faire, plutôt que de se le voir
                  reprocher après coup au moment de valider. */}
              {showPasswordRules && (
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

            {isSignUp && (
              <View style={styles.consents}>
                <Pressable
                  onPress={() => setTermsAccepted((v) => !v)}
                  disabled={submitting}
                  style={styles.consentRow}
                >
                  <Checkbox checked={termsAccepted} />
                  <Text style={styles.consentText}>
                    J’ai lu et j’accepte les{' '}
                    <Text style={styles.link} onPress={() => setOpenDoc('terms')}>
                      Conditions Générales d’Utilisation
                    </Text>{' '}
                    et la{' '}
                    <Text style={styles.link} onPress={() => setOpenDoc('privacy')}>
                      Politique de confidentialité
                    </Text>
                    . <Text style={styles.required}>obligatoire</Text>
                  </Text>
                </Pressable>

                <Pressable
                  onPress={() => setNotificationsAccepted((v) => !v)}
                  disabled={submitting}
                  style={styles.consentRow}
                >
                  <Checkbox checked={notificationsAccepted} />
                  <Text style={styles.consentText}>
                    Je veux être prévenu des révélations et de l’activité de mon Cercle.{' '}
                    <Text style={styles.optional}>facultatif, modifiable à tout moment</Text>
                  </Text>
                </Pressable>
              </View>
            )}

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
                <ActivityIndicator color={colors.textOnAccent} />
              ) : (
                <Text style={styles.submitText}>
                  {isSignUp ? 'Créer mon compte' : 'Se connecter'}
                </Text>
              )}
            </Pressable>

            {/* Uniquement en mode connexion : à l'inscription, il n'y a pas
                encore de mot de passe à oublier. */}
            {!isSignUp && (
              <Pressable
                onPress={() => router.push('/forgot-password')}
                disabled={submitting}
                style={styles.forgot}
              >
                <Text style={styles.forgotText}>Mot de passe oublié ?</Text>
              </Pressable>
            )}

            <Pressable onPress={switchMode} disabled={submitting} style={styles.switch}>
              <Text style={styles.switchText}>
                {isSignUp
                  ? 'Déjà un compte ? Se connecter'
                  : 'Pas encore de compte ? En créer un'}
              </Text>
            </Pressable>

            <Text style={styles.legalFootnote}>
              Tes Predicts ne sont visibles que par les personnes de ton Cercle que tu choisis.
              Aucune donnée n’est revendue.{' '}
              <Text style={styles.link} onPress={() => setOpenDoc('mentions')}>
                Mentions légales
              </Text>
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Les textes légaux sont lisibles AVANT de cocher : les enfermer
          derrière l'écran Réglages reviendrait à faire accepter un document
          qu'on ne peut pas consulter. */}
      <Modal visible={openDoc !== null} animationType="slide" onRequestClose={() => setOpenDoc(null)}>
        <SafeAreaView style={styles.safe}>
          <View style={styles.docHeader}>
            <Pressable onPress={() => setOpenDoc(null)} hitSlop={8}>
              <Text style={styles.back}>Fermer</Text>
            </Pressable>
            <View style={styles.headerSpacer} />
          </View>
          <ScrollView contentContainerStyle={styles.docScroll}>
            {doc && (
              <>
                <Text style={styles.docUpdatedAt}>Mis à jour le {doc.updatedAt}</Text>
                {doc.intro && <Text style={styles.docParagraph}>{doc.intro}</Text>}
                {doc.sections.map((section) => (
                  <View key={section.heading} style={styles.docSection}>
                    <Text style={styles.docHeading}>{section.heading}</Text>
                    {section.paragraphs.map((paragraph, i) => (
                      <Text key={i} style={styles.docParagraph}>
                        {paragraph}
                      </Text>
                    ))}
                  </View>
                ))}
              </>
            )}
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

function createStyles(colors: Colors) {
  return StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  scroll: { flexGrow: 1, justifyContent: 'center', padding: spacing.lg },
  // Colonne bornée et centrée — c'est elle qui tient toute la mise en page.
  column: { width: '100%', maxWidth: 460, alignSelf: 'center' },
  headerBlock: { alignItems: 'center', marginBottom: spacing.xl },
  brand: {
    fontFamily: fonts.display,
    fontSize: 26,
    letterSpacing: 6,
    color: colors.text,
    textTransform: 'uppercase',
    textAlign: 'center',
  },
  tagline: {
    fontSize: 15,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: 10,
    lineHeight: 21,
  },
  title: {
    fontFamily: fonts.display,
    fontSize: 30,
    color: colors.text,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 15,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 21,
    marginTop: 8,
    marginBottom: spacing.lg,
  },
  field: { marginBottom: spacing.md },
  labelRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 6 },
  label: eyebrow(colors),
  // Mention portée par chaque champ concerné plutôt qu'un astérisque renvoyant
  // à une légende en bas de page : l'information est là où la question se pose.
  required: {
    fontFamily: fonts.label,
    fontSize: 12,
    color: colors.accent,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  optional: { fontSize: 14, color: colors.textFaint },
  fieldHint: { fontSize: 14, color: colors.textFaint, marginTop: 6, lineHeight: 19 },
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
  consents: { marginTop: 4, marginBottom: spacing.md, gap: 14 },
  consentRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  consentText: { flex: 1, fontSize: 14, color: colors.textMuted, lineHeight: 20 },
  link: { color: colors.text, fontFamily: fonts.bodyEmphasis, textDecorationLine: 'underline' },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  checkboxChecked: { backgroundColor: colors.accent, borderColor: colors.accent },
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
  // Texte sombre sur le bouton jaune — `text` (blanc en mode sombre) y serait peu lisible.
  submitText: { fontFamily: fonts.sansBold, color: colors.textOnAccent, fontSize: 16, textTransform: 'uppercase', letterSpacing: 0.5 },
  forgot: { marginTop: 16, alignItems: 'center' },
  forgotText: { fontSize: 15, color: colors.textMuted, textDecorationLine: 'underline' },
  switch: { marginTop: 18, alignItems: 'center' },
  switchText: { fontFamily: fonts.bodyEmphasis, color: colors.text, fontSize: 15 },
  legalFootnote: {
    fontSize: 13,
    color: colors.textFaint,
    textAlign: 'center',
    lineHeight: 19,
    marginTop: spacing.xl,
  },
  // --- Lecture d'un document légal, en plein écran -------------------------
  docHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  back: { fontSize: 15, color: colors.text },
  headerSpacer: { flex: 1 },
  docScroll: { padding: spacing.lg, maxWidth: 640, alignSelf: 'center', width: '100%' },
  docUpdatedAt: { fontSize: 14, color: colors.textFaint, marginBottom: spacing.md },
  docSection: { marginTop: spacing.lg },
  docHeading: { fontFamily: fonts.display, fontSize: 19, color: colors.text, marginBottom: 8 },
  docParagraph: { fontSize: 15, color: colors.textMuted, lineHeight: 23, marginBottom: 10 },
  });
}
