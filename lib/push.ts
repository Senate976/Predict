import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { supabase } from './supabase';

/**
 * Notifications push.
 *
 * Jusqu'ici, une « notification » de Predict était une ligne de table visible
 * dans l'onglet du même nom — rien n'arrivait jamais sur un téléphone
 * verrouillé. Or toute la promesse du produit tient dans un rendez-vous
 * (« le 12 mars, tu sauras ») : si personne n'est prévenu ce jour-là, le rituel
 * n'a pas lieu.
 *
 * Ce module ne s'occupe que du côté appareil : demander l'autorisation et
 * enregistrer le jeton. L'envoi se fait côté serveur (voir
 * `supabase/functions/send-push/`), à partir des jetons stockés ici.
 */

// Comportement quand une notification arrive alors que l'app est ouverte :
// on l'affiche quand même. Sans ça, un rappel reçu pendant qu'on consulte le
// Fil serait silencieusement avalé.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

export type PushRegistration =
  | { status: 'ok'; token: string }
  | { status: 'denied' }
  | { status: 'unsupported'; reason: string }
  | { status: 'error'; message: string };

/**
 * Demande l'autorisation et enregistre le jeton de cet appareil.
 *
 * Ne demande JAMAIS l'autorisation de but en blanc au premier lancement : sur
 * iOS, un refus est définitif (il faut aller dans les Réglages du téléphone
 * pour revenir dessus). L'appelant doit donc n'appeler cette fonction qu'après
 * avoir expliqué à quoi servent les notifications — ici, après l'inscription,
 * où la case correspondante a déjà été cochée en connaissance de cause.
 */
export async function registerForPush(userId: string): Promise<PushRegistration> {
  // Un émulateur n'a pas de jeton push : ce n'est pas une erreur, juste une
  // limite de l'environnement, et ça ne doit pas remonter comme un incident.
  if (!Device.isDevice) {
    return { status: 'unsupported', reason: 'Les notifications push ne fonctionnent pas sur simulateur.' };
  }
  if (Platform.OS === 'web') {
    return { status: 'unsupported', reason: 'Notifications push non gérées sur le web.' };
  }

  try {
    const existing = await Notifications.getPermissionsAsync();
    let granted = existing.granted;

    if (!granted && existing.canAskAgain) {
      const asked = await Notifications.requestPermissionsAsync();
      granted = asked.granted;
    }
    if (!granted) return { status: 'denied' };

    // Android exige un canal, sinon les notifications n'apparaissent pas.
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Révélations',
        importance: Notifications.AndroidImportance.DEFAULT,
        lightColor: '#eca835',
      });
    }

    // `projectId` vient de la configuration EAS. Sans projet EAS lié, l'appel
    // échoue : on le signale clairement plutôt que de laisser une exception
    // opaque remonter, parce que c'est une étape de configuration à faire une
    // fois, pas un bug.
    const projectId =
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (Constants as any)?.expoConfig?.extra?.eas?.projectId ??
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (Constants as any)?.easConfig?.projectId;

    if (!projectId) {
      return {
        status: 'unsupported',
        reason:
          'Aucun projet EAS lié : lance `eas init` une fois, pour que les jetons push puissent être délivrés.',
      };
    }

    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });

    // `upsert` sur le jeton (clé primaire) : un même appareil qui change de
    // compte doit être réattribué, pas dupliqué — sinon l'ancien propriétaire
    // continuerait de recevoir les notifications du nouveau.
    const { error } = await supabase.from('push_tokens').upsert(
      {
        token,
        user_id: userId,
        platform: Platform.OS === 'ios' ? 'ios' : 'android',
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'token' }
    );

    if (error) return { status: 'error', message: error.message };
    return { status: 'ok', token };
  } catch (unexpected) {
    return {
      status: 'error',
      message: unexpected instanceof Error ? unexpected.message : String(unexpected),
    };
  }
}

/** Retire le jeton de cet appareil — à la déconnexion, pour ne pas continuer
 * d'envoyer les notifications d'un compte à quelqu'un d'autre. */
export async function unregisterPush(token: string) {
  return supabase.from('push_tokens').delete().eq('token', token);
}
