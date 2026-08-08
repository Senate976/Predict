import type { AuthError, PostgrestError } from '@supabase/supabase-js';

import { supabase } from './supabase';

/** Doivent rester alignés sur MIN/MAX_USERNAME_LENGTH de app/(auth)/login.tsx
 * et sur l'index unique `profiles_username_lower_key` côté SQL. */
export const MIN_USERNAME_LENGTH = 3;
export const MAX_USERNAME_LENGTH = 20;
/** Doit rester aligné sur MIN_PASSWORD_LENGTH de app/(auth)/login.tsx. */
export const MIN_PASSWORD_LENGTH = 6;

/**
 * Réutilise la RPC `is_username_available` de l'inscription (accessible à
 * `anon` comme à `authenticated`) : même vérification, même garde-fou final
 * côté base (l'index unique sur `lower(username)`).
 */
export async function isUsernameAvailable(candidate: string): Promise<boolean | null> {
  const { data, error } = await supabase.rpc('is_username_available', { candidate });
  if (error || typeof data !== 'boolean') return null;
  return data;
}

/** Traduit une violation d'unicité (23505) en message lisible ; sinon message générique. */
export function usernameErrorMessage(error: PostgrestError): string {
  if (error.code === '23505') return 'Ce pseudo est déjà pris, choisis-en un autre.';
  return `Mise à jour impossible : ${error.message}`;
}

export async function updateUsername(userId: string, username: string) {
  return supabase.from('profiles').update({ username: username.trim() }).eq('id', userId);
}

/** Change l'email de connexion — Supabase envoie un lien de confirmation aux
 * deux adresses (ancienne et nouvelle) avant que le changement prenne effet. */
export async function updateEmail(email: string) {
  return supabase.auth.updateUser({ email: email.trim() });
}

export async function updatePassword(password: string) {
  return supabase.auth.updateUser({ password });
}

export function authErrorMessage(error: AuthError): string {
  switch (error.code) {
    case 'email_address_invalid':
    case 'validation_failed':
      return 'Adresse email invalide.';
    case 'email_exists':
      return 'Cette adresse email est déjà utilisée.';
    case 'weak_password':
      return `Mot de passe trop faible (${MIN_PASSWORD_LENGTH} caractères minimum).`;
    case 'same_password':
      return 'Choisis un mot de passe différent de l’actuel.';
    default:
      return error.message;
  }
}

/**
 * Suppression du compte, en libre-service et irréversible : `delete_own_account`
 * (security definer, section 36) supprime la ligne `auth.users`, ce qui
 * cascade sur `profiles` puis sur toutes les données qui en dépendent.
 * Le client doit appeler `signOut()` juste après — la session locale reste
 * autrement valide jusqu'à son expiration naturelle, alors que le compte
 * n'existe plus côté serveur.
 */
export async function deleteOwnAccount() {
  return supabase.rpc('delete_own_account');
}

export type NotificationPrefs = {
  new_teaser: boolean;
  prediction_revealed: boolean;
  prediction_verdict: boolean;
  prediction_mentioned: boolean;
  group_invite: boolean;
};

export const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = {
  new_teaser: true,
  prediction_revealed: true,
  prediction_verdict: true,
  prediction_mentioned: true,
  group_invite: true,
};

export const NOTIFICATION_PREF_LABELS: { key: keyof NotificationPrefs; label: string; hint: string }[] = [
  { key: 'new_teaser', label: 'Nouveaux Predicts', hint: 'Quand quelqu’un de ton Cercle en scelle un nouveau.' },
  { key: 'prediction_revealed', label: 'Révélations', hint: 'Quand un Predict que tu peux voir se révèle.' },
  { key: 'prediction_verdict', label: 'Verdicts', hint: 'Quand un auteur affirme Réalisé ou Manqué.' },
  { key: 'prediction_mentioned', label: 'Mentions', hint: 'Quand quelqu’un te cite avec « @pseudo ».' },
  { key: 'group_invite', label: 'Invitations de groupe', hint: 'Quand on t’invite à rejoindre un groupe.' },
];

export async function fetchNotificationPrefs(userId: string) {
  const { data, error } = await supabase
    .from('profiles')
    .select('notification_prefs')
    .eq('id', userId)
    .maybeSingle();
  return { data: (data?.notification_prefs as NotificationPrefs | null) ?? null, error };
}

export async function updateNotificationPrefs(userId: string, prefs: NotificationPrefs) {
  return supabase.from('profiles').update({ notification_prefs: prefs }).eq('id', userId);
}

export const REMINDER_LEAD_OPTIONS: { minutes: number; label: string }[] = [
  { minutes: 15, label: '15 minutes avant' },
  { minutes: 60, label: '1 heure avant' },
  { minutes: 1440, label: '1 jour avant' },
];

export type ReminderSettings = { enabled: boolean; leadMinutes: number };

export async function fetchReminderSettings(userId: string) {
  const { data, error } = await supabase
    .from('profiles')
    .select('reveal_reminder_enabled, reveal_reminder_lead_minutes')
    .eq('id', userId)
    .maybeSingle();
  return {
    data: data
      ? { enabled: data.reveal_reminder_enabled as boolean, leadMinutes: data.reveal_reminder_lead_minutes as number }
      : null,
    error,
  };
}

export async function updateReminderSettings(userId: string, settings: ReminderSettings) {
  return supabase
    .from('profiles')
    .update({
      reveal_reminder_enabled: settings.enabled,
      reveal_reminder_lead_minutes: settings.leadMinutes,
    })
    .eq('id', userId);
}
