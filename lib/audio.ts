import { supabase } from './supabase';

const BUCKET = 'prediction-audio';

/**
 * Durée de validité d'une URL signée. Redemandée à chaque affichage plutôt que
 * mise en cache : plus simple que de gérer une expiration côté client, et le
 * coût d'un aller-retour de plus est négligeable face à une lecture audio.
 */
const SIGNED_URL_TTL_SECONDS = 3600;

/**
 * Envoie l'enregistrement vers le bucket privé, sous
 * `<prediction_id>/<horodatage>.m4a` — c'est ce premier segment que les
 * policies de stockage comparent à `predictions.id`. `uri` est le fichier
 * local renvoyé par `expo-audio` (aussi bien un `file://` natif qu'un
 * `blob:`/`data:` web : `fetch` sait lire les deux).
 */
export async function uploadPredictionAudio(predictionId: string, uri: string) {
  const response = await fetch(uri);
  const blob = await response.blob();
  const path = `${predictionId}/${Date.now()}.m4a`;

  const { error } = await supabase.storage.from(BUCKET).upload(path, blob, {
    contentType: 'audio/m4a',
    upsert: false,
  });

  if (error) return { path: null, error };
  return { path, error: null };
}

/** Associe le fichier déjà envoyé à la prédiction — colonne à part, RLS à part. */
export async function setPredictionAudioPath(predictionId: string, path: string) {
  // Même vérification que pour la photo (`setPredictionPhotoPath`) : un UPDATE
  // refusé par la RLS ne renvoie pas d'erreur, il ne touche aucune ligne. Sans
  // ce contrôle, le vocal partirait vers le stockage sans jamais être associé.
  const { data, error } = await supabase
    .from('prediction_contents')
    .update({ audio_path: path })
    .eq('prediction_id', predictionId)
    .select('prediction_id');

  if (error) return { error };
  if (!data || data.length === 0) {
    return { error: { message: 'la base a refusé d’associer le vocal à ce Predict.' } };
  }
  return { error: null };
}

/**
 * URL temporaire pour lire un message vocal. Passe par les mêmes policies que
 * le fichier lui-même (`prediction_audio_select`) : sans y avoir droit, cette
 * fonction renvoie une erreur plutôt qu'une URL.
 */
export async function getPredictionAudioUrl(path: string) {
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
  if (error) return { url: null, error };
  return { url: data.signedUrl, error: null };
}
