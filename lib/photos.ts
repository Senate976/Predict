import * as ImagePicker from 'expo-image-picker';

import { supabase } from './supabase';

/** Photo jointe à la création — même visibilité que le contenu texte/audio
 * (masquée avant révélation). */
const CONTENT_BUCKET = 'prediction-photos';
/** Photo-preuve posée avec le verdict (Réalisé/Manqué) — visible dès qu'elle
 * existe, sans condition de date (le verdict n'est possible qu'après
 * révélation, donc toujours déjà visible par construction). */
const VERDICT_BUCKET = 'prediction-verdict-photos';

/** Redemandée à chaque affichage plutôt que mise en cache — même choix que
 * `lib/audio.ts`, pour la même raison (pas d'expiration à gérer côté client). */
const SIGNED_URL_TTL_SECONDS = 3600;

/** Ouvre le sélecteur d'image et renvoie l'URI locale choisie, ou `null` si
 * l'utilisateur a annulé ou refusé l'autorisation — même principe que
 * `pickAvatarImage` (lib/avatar.ts), sans cadrage carré forcé : une photo de
 * création ou de preuve n'a pas à être un portrait. */
export async function pickPredictionPhoto(): Promise<{ uri: string | null; error: Error | null }> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    return { uri: null, error: new Error('Autorisation d’accès aux photos refusée.') };
  }

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsEditing: true,
    quality: 0.7,
  });

  if (result.canceled || !result.assets?.[0]) {
    return { uri: null, error: null };
  }

  return { uri: result.assets[0].uri, error: null };
}

async function uploadPhoto(bucket: string, predictionId: string, uri: string) {
  const response = await fetch(uri);
  const blob = await response.blob();
  const path = `${predictionId}/${Date.now()}.jpg`;

  const { error } = await supabase.storage.from(bucket).upload(path, blob, {
    contentType: 'image/jpeg',
    upsert: false,
  });

  if (error) return { path: null, error };
  return { path, error: null };
}

/** Envoie la photo de création vers le bucket privé, sous
 * `<prediction_id>/<horodatage>.jpg`. */
export async function uploadPredictionPhoto(predictionId: string, uri: string) {
  return uploadPhoto(CONTENT_BUCKET, predictionId, uri);
}

/** Associe le fichier déjà envoyé à la prédiction — colonne à part, RLS à part,
 * même principe que `setPredictionAudioPath` (lib/audio.ts). */
export async function setPredictionPhotoPath(predictionId: string, path: string) {
  return supabase.from('prediction_contents').update({ photo_path: path }).eq('prediction_id', predictionId);
}

/** Envoie la photo-preuve du verdict vers son propre bucket privé — le chemin
 * renvoyé est ensuite passé à `setPredictionVerdict` (lib/predictions.ts),
 * qui pose la colonne dans le même geste que le verdict lui-même. */
export async function uploadVerdictPhoto(predictionId: string, uri: string) {
  return uploadPhoto(VERDICT_BUCKET, predictionId, uri);
}

/** URL temporaire pour afficher une photo — création ou preuve de verdict
 * selon `bucket`. Passe par les policies de stockage correspondantes : sans y
 * avoir droit, cette fonction renvoie une erreur plutôt qu'une URL. */
export async function getPredictionPhotoUrl(bucket: 'content' | 'verdict', path: string) {
  const bucketId = bucket === 'content' ? CONTENT_BUCKET : VERDICT_BUCKET;
  const { data, error } = await supabase.storage.from(bucketId).createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
  if (error) return { url: null, error };
  return { url: data.signedUrl, error: null };
}
