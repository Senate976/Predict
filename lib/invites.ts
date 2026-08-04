import { supabase } from './supabase';

/**
 * Envoie une invitation Predict par SMS au numéro donné, via la fonction Edge
 * `send-invite-sms`. Celle-ci enregistre aussi l'invitation (`phone_invites`)
 * pour que le compte créé plus tard avec ce même numéro reçoive
 * automatiquement une demande d'ami — voir `handle_phone_invite_match` dans
 * supabase/schema.sql.
 *
 * Peut échouer avec `not_configured` si le service SMS (Twilio) n'a pas
 * encore été branché côté Supabase.
 */
export async function invitePhoneBySms(phone: string) {
  return supabase.functions.invoke<{ ok: boolean }>('send-invite-sms', {
    body: { phone },
  });
}
