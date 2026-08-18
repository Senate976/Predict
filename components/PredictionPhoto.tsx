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
  /**
   * Rapport largeur/hauteur réel de l'image, mesuré une fois l'URL connue.
   *
   * Le cadre était figé à 4/3, donc au format paysage : une photo prise en
   * portrait s'y trouvait rognée en haut et en bas, et il n'y avait aucun moyen
   * d'en voir le sujet. On suit désormais la forme de l'image, en bornant
   * seulement la hauteur pour qu'un portrait très allongé n'occupe pas tout
   * l'écran à lui seul.
   */
  const [ratio, setRatio] = useState<number | null>(null);
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
      Image.getSize(
        signedUrl,
        (w, h) => {
          if (!cancelled && h > 0) setRatio(w / h);
        },
        // Échec de mesure : on garde le cadre par défaut plutôt que de ne rien
        // afficher. L'image reste visible, simplement au format d'origine.
        () => {}
      );
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

  if (fill) {
    return <Image source={{ uri: url }} style={styles.fill} resizeMode="cover" />;
  }

  // `contain` et non `cover` dès que la forme réelle est connue : le cadre
  // épouse l'image, il n'y a donc plus rien à rogner.
  return (
    <Image
      source={{ uri: url }}
      style={[styles.image, ratio ? { aspectRatio: ratio } : null]}
      resizeMode={ratio ? 'contain' : 'cover'}
    />
  );
}

function createStyles(colors: Colors) {
  return StyleSheet.create({
    image: {
      width: '100%',
      // Cadre de repli, le temps que la forme réelle soit mesurée.
      aspectRatio: 4 / 3,
      // Un portrait très allongé ne doit pas occuper tout l'écran : au-delà,
      // l'image se contente de cette hauteur.
      maxHeight: 460,
      borderRadius: radius.sm,
      backgroundColor: colors.border,
    },
    fill: { ...StyleSheet.absoluteFill, backgroundColor: colors.border },
    loaderBox: { alignItems: 'center', justifyContent: 'center' },
    errorText: { fontSize: 14, color: colors.textFaint },
  });
}
