import * as Clipboard from 'expo-clipboard';
import * as Contacts from 'expo-contacts';
import * as SMS from 'expo-sms';
import { Platform } from 'react-native';

/**
 * Adresse vers laquelle pointe une invitation. C'est le site public de l'app :
 * un lien `predict://` ne mènerait nulle part chez quelqu'un qui ne l'a pas
 * encore installée, ce qui est précisément le cas d'une personne qu'on invite.
 * Réglable par variable d'environnement pour suivre le domaine réel sans
 * toucher au code.
 */
export const INVITE_URL = process.env.EXPO_PUBLIC_INVITE_URL ?? 'https://predict-orpin-five.vercel.app';

/** Le texte envoyé. `username` sert à se retrouver une fois l'app installée :
 * c'est par le pseudo qu'on s'ajoute (voir l'onglet Cercle). */
export function inviteMessage(username: string | null): string {
  const signature = username ? ` Mon pseudo est ${username}.` : '';
  return `Rejoins-moi sur Predict, on y scelle ses prédictions entre amis.${signature} ${INVITE_URL}`;
}

export type InviteOutcome =
  | { kind: 'sent'; contactName: string | null }
  | { kind: 'copied' }
  | { kind: 'cancelled' }
  | { kind: 'denied' }
  | { kind: 'no-number'; contactName: string | null }
  | { kind: 'error'; message: string };

/**
 * Invite quelqu'un depuis le répertoire du téléphone.
 *
 * Le répertoire ne quitte jamais l'appareil : on passe par le sélecteur du
 * système (`presentContactPickerAsync`), qui ne rend que la fiche choisie —
 * l'app ne lit donc jamais la liste entière, et rien n'est envoyé au serveur.
 *
 * Sur le web il n'y a pas de répertoire accessible : on recopie le message
 * dans le presse-papier, à coller où l'on veut. C'est le repli, pas un
 * appauvrissement — le geste reste « inviter quelqu'un ».
 */
export async function inviteFromContacts(username: string | null): Promise<InviteOutcome> {
  const message = inviteMessage(username);

  if (Platform.OS === 'web') {
    await Clipboard.setStringAsync(message);
    return { kind: 'copied' };
  }

  try {
    const { granted } = await Contacts.requestPermissionsAsync();
    if (!granted) return { kind: 'denied' };

    const contact = await Contacts.presentContactPickerAsync();
    if (!contact) return { kind: 'cancelled' };

    const name = contact.name ?? null;
    const number = contact.phoneNumbers?.[0]?.number;
    if (!number) return { kind: 'no-number', contactName: name };

    // `isAvailableAsync` est faux sur un appareil sans application SMS (un iPad
    // par exemple) : mieux vaut alors le presse-papier qu'un bouton sans effet.
    if (!(await SMS.isAvailableAsync())) {
      await Clipboard.setStringAsync(message);
      return { kind: 'copied' };
    }

    const { result } = await SMS.sendSMSAsync([number], message);
    // `result` vaut « cancelled » si l'utilisateur ferme l'écran de rédaction.
    // Sur Android il vaut « unknown » : le système ne dit pas si le message
    // est parti, on considère alors que oui.
    return result === 'cancelled' ? { kind: 'cancelled' } : { kind: 'sent', contactName: name };
  } catch (unexpected) {
    return {
      kind: 'error',
      message: unexpected instanceof Error ? unexpected.message : String(unexpected),
    };
  }
}
