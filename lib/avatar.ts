import * as ImagePicker from 'expo-image-picker';

import { supabase } from './supabase';

const BUCKET = 'avatars';

/**
 * Ouvre le sélecteur d'image et renvoie l'URI locale choisie, ou `null` si
 * l'utilisateur a annulé ou refusé l'autorisation. Bucket public (contrairement
 * à `prediction-audio`) : une photo de profil n'est pas un contenu scellé, pas
 * besoin d'URL signée pour l'afficher partout (Fil, commentaires, Cercle).
 */
export async function pickAvatarImage(): Promise<{ uri: string | null; error: Error | null }> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    return { uri: null, error: new Error('Autorisation d’accès aux photos refusée.') };
  }

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsEditing: true,
    aspect: [1, 1],
    quality: 0.7,
  });

  if (result.canceled || !result.assets?.[0]) {
    return { uri: null, error: null };
  }

  return { uri: result.assets[0].uri, error: null };
}

/**
 * Envoie l'image dans `avatars/<userId>/...` et met à jour `profiles.avatar_url`.
 * `upsert: true` : un nom de fichier fixe par utilisateur remplacerait la
 * photo précédente, mais on horodate quand même pour éviter tout souci de
 * cache d'image côté client sur une URL qui n'aurait pas changé.
 */
export async function uploadAvatar(userId: string, uri: string) {
  const response = await fetch(uri);
  const blob = await response.blob();
  const path = `${userId}/${Date.now()}.jpg`;

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(path, blob, { contentType: 'image/jpeg', upsert: true });
  if (uploadError) return { url: null, error: uploadError };

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);

  const { error: updateError } = await supabase
    .from('profiles')
    .update({ avatar_url: data.publicUrl })
    .eq('id', userId);
  if (updateError) return { url: null, error: updateError };

  return { url: data.publicUrl, error: null };
}

/**
 * Retire la photo de profil sans avoir besoin d'en choisir une nouvelle —
 * repasse simplement `avatar_url` à `null`. Le fichier reste dans le bucket
 * (pas de suppression de l'objet de stockage) : un chemin fixe par upload
 * suffit à ne plus jamais l'exposer, sans complexité de parsing d'URL ici.
 */
export async function removeAvatar(userId: string) {
  return supabase.from('profiles').update({ avatar_url: null }).eq('id', userId);
}
