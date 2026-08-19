import { Ionicons } from '@expo/vector-icons';
import { useMemo } from 'react';
import { Image, Pressable, StyleSheet, View } from 'react-native';
import { Text } from './Text';

import { pickPredictionPhoto } from '../lib/photos';
import { radius, type Colors } from '../lib/theme';
import { useColors } from '../lib/themeMode';

type Props = {
  /** URI locale de la photo choisie, ou `null` sans photo — l'envoi vers le
   * stockage se fait ailleurs (à la validation du formulaire, ou du verdict),
   * ce composant ne gère que le choix local. */
  uri: string | null;
  onChange: (uri: string | null) => void;
  disabled?: boolean;
  label?: string;
};

/** Bouton de sélection de photo — aperçu + « Retirer » une fois choisie,
 * même registre que `PredictionRecorder` pour le message vocal. Réutilisé à
 * la création (photo jointe au secret) et à la pose du verdict (photo-preuve). */
export function PhotoAttachButton({ uri, onChange, disabled, label = 'Ajouter une photo' }: Props) {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);

  async function handlePick() {
    const { uri: pickedUri, error } = await pickPredictionPhoto();
    if (error) return;
    if (pickedUri) onChange(pickedUri);
  }

  if (uri) {
    return (
      <View style={styles.box}>
        <Image source={{ uri }} style={styles.preview} resizeMode="contain" />
        <Pressable onPress={() => onChange(null)} disabled={disabled} style={styles.resetButton}>
          <Text style={styles.resetButtonText}>Retirer la photo</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <Pressable onPress={handlePick} disabled={disabled} style={styles.pickButton}>
      <Ionicons name="image-outline" size={20} color={colors.text} />
      <Text style={styles.pickButtonText}>{label}</Text>
    </Pressable>
  );
}

function createStyles(colors: Colors) {
  return StyleSheet.create({
    box: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.sm,
      padding: 10,
      backgroundColor: colors.surface,
    },
    // `resizeMode="contain"` et hauteur bornée plutôt qu'un rapport figé :
    // l'aperçu doit montrer ce qui sera réellement envoyé, portrait compris.
    preview: { width: '100%', height: 240, borderRadius: radius.sm },
    resetButton: { marginTop: 8, alignSelf: 'flex-start' },
    resetButtonText: { fontSize: 15, color: colors.textMuted, fontWeight: '600' },
    pickButton: {
      flexDirection: 'row',
      gap: 10,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.sm,
      paddingVertical: 12,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.surface,
    },
    // Même taille que le libellé du bouton vocal : les deux pièces jointes
    // s'empilent l'une sous l'autre, elles doivent avoir le même poids visuel.
    pickButtonText: { fontSize: 15, fontWeight: '600', color: colors.text },
  });
}
