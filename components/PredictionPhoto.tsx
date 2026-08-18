import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Image, StyleSheet, View } from 'react-native';
import { Text } from './Text';

import { getPredictionPhotoUrl } from '../lib/photos';
import { radius, type Colors } from '../lib/theme';
import { useColors } from '../lib/themeMode';

/**
 * Affiche une photo à partir de son chemin de stockage — création ou
 * preuve de verdict selon `bucket`. Même principe que `AudioPlayerButton` :
 * `path` n'arrive ici que si la RLS a déjà laissé passer la ligne
 * correspondante, pas de vérification de visibilité supplémentaire à faire
 * côté client.
 */
export function PredictionPhoto({
  bucket,
  path,
  fill = false,
}: {
  bucket: 'content' | 'verdict';
  path: string;
  /** Occupe tout le parent au lieu de garder son ratio 4/3 — pour la photo
   * glissée derrière la lettre, qui doit épouser la feuille exactement. Le
   * parent se charge alors de l'arrondi et du rognage. */
  fill?: boolean;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);

  useEffect(() => {
    let cancelled = false;
    setUrl(null);
    setFailed(false);
    getPredictionPhotoUrl(bucket, path).then(({ url: signedUrl, error }) => {
      if (cancelled) return;
      if (error || !signedUrl) {
        setFailed(true);
        return;
      }
      setUrl(signedUrl);
    });
    return () => {
      cancelled = true;
    };
  }, [bucket, path]);

  if (failed) {
    return <Text style={styles.errorText}>Photo indisponible.</Text>;
  }

  if (!url) {
    return (
      <View style={[fill ? styles.fill : styles.image, styles.loaderBox]}>
        <ActivityIndicator size="small" color={colors.text} />
      </View>
    );
  }

  return <Image source={{ uri: url }} style={fill ? styles.fill : styles.image} resizeMode="cover" />;
}

function createStyles(colors: Colors) {
  return StyleSheet.create({
    image: {
      width: '100%',
      aspectRatio: 4 / 3,
      borderRadius: radius.sm,
      backgroundColor: colors.border,
    },
    fill: { ...StyleSheet.absoluteFill, backgroundColor: colors.border },
    loaderBox: { alignItems: 'center', justifyContent: 'center' },
    errorText: { fontSize: 14, color: colors.textFaint },
  });
}
