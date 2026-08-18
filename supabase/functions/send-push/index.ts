/**
 * Envoi des notifications push en attente.
 *
 * Fonction Edge Supabase (Deno). Elle lit les notifications jamais poussées
 * (`pending_push_notifications`), les expédie au service de push d'Expo, puis
 * les marque comme envoyées. À déclencher toutes les quelques minutes — voir
 * le README de ce dossier.
 *
 * Pourquoi ici et pas dans l'app : envoyer une notification suppose de lire les
 * jetons de TOUS les destinataires, ce que la RLS interdit — et doit
 * heureusement interdire — à un utilisateur connecté. Cette fonction s'exécute
 * avec la clé de service, hors session, sur un serveur.
 */
import { createClient } from 'jsr:@supabase/supabase-js@2';

/** Limite imposée par Expo : 100 messages par requête. */
const EXPO_BATCH_SIZE = 100;
const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

type Pending = {
  notification_id: string;
  token: string;
  platform: string;
  type: string;
  teaser: string | null;
  author_username: string | null;
};

/** Le texte affiché sur l'écran verrouillé, par type de notification. */
function messageFor(row: Pending): { title: string; body: string } {
  const who = row.author_username ?? 'Quelqu’un';
  const what = row.teaser ? `« ${row.teaser} »` : 'un Predict';

  switch (row.type) {
    case 'prediction_revealed':
      return { title: 'Une révélation', body: `${what} vient de s’ouvrir.` };
    case 'reveal_reminder':
      return { title: 'Bientôt', body: `${what} se révèle dans peu de temps.` };
    case 'open_reminder':
      return { title: 'Ton Predict attend', body: `${what} est toujours scellé. À toi de l’ouvrir.` };
    case 'new_teaser':
      return { title: 'Nouveau Predict', body: `${who} a scellé ${what}.` };
    case 'prediction_realized':
      return { title: 'Verdict', body: `${who} confirme que ${what} s’est réalisé.` };
    case 'prediction_missed':
      return { title: 'Verdict', body: `${who} confirme que ${what} a été manqué.` };
    case 'prediction_mentioned':
      return { title: 'On parle de toi', body: `${who} t’a cité dans ${what}.` };
    case 'question_answered':
      return { title: 'Nouvelle réponse', body: 'Quelqu’un a répondu à ton Sondage.' };
    case 'new_comment':
      return { title: 'Nouveau commentaire', body: `${who} a commenté ${what}.` };
    case 'group_invite':
      return { title: 'Invitation', body: `${who} t’invite dans un groupe.` };
    default:
      return { title: 'Predict', body: 'Du nouveau dans ton Cercle.' };
  }
}

Deno.serve(async () => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    // Clé de service : contourne la RLS, indispensable pour lire les jetons de
    // tout le monde. Elle ne doit JAMAIS se retrouver côté application.
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  const { data, error } = await supabase.rpc('pending_push_notifications');
  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const rows = (data ?? []) as Pending[];
  if (rows.length === 0) {
    return Response.json({ sent: 0 });
  }

  const messages = rows.map((row) => ({
    to: row.token,
    sound: 'default',
    ...messageFor(row),
    data: { notificationId: row.notification_id, type: row.type },
  }));

  // Les jetons refusés par Expo (« DeviceNotRegistered ») correspondent à des
  // apps désinstallées : on les supprime, sinon la table gonfle indéfiniment
  // d'appareils qui ne répondront plus jamais.
  const deadTokens: string[] = [];

  for (let i = 0; i < messages.length; i += EXPO_BATCH_SIZE) {
    const batch = messages.slice(i, i + EXPO_BATCH_SIZE);
    const response = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(batch),
    });
    const result = await response.json().catch(() => null);

    (result?.data ?? []).forEach((ticket: { status?: string; details?: { error?: string } }, index: number) => {
      if (ticket?.details?.error === 'DeviceNotRegistered') {
        deadTokens.push(batch[index].to);
      }
    });
  }

  if (deadTokens.length > 0) {
    await supabase.from('push_tokens').delete().in('token', deadTokens);
  }

  // Marquées comme poussées même en cas d'échec partiel : réessayer sans fin
  // une notification qu'Expo refuse enverrait la même erreur à chaque passage.
  // Une notification manquée vaut mieux qu'une boucle infinie — et elle reste
  // visible dans l'onglet Notifications de l'app.
  await supabase.rpc('mark_notifications_pushed', {
    p_ids: [...new Set(rows.map((r) => r.notification_id))],
  });

  return Response.json({ sent: rows.length, removedTokens: deadTokens.length });
});
