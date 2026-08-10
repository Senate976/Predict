import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet } from 'react-native';
import { Text } from './Text';

import { getPredictionAudioUrl } from '../lib/audio';
import { radius, type Colors } from '../lib/theme';
import { useColors } from '../lib/themeMode';

/**
 * Lecture d'un message vocal à partir de son chemin de stockage. `path`
 * n'arrive ici que si la RLS a déjà laissé passer la ligne
 * `prediction_contents` correspondante (`predictions_feed` renvoie `content`
 * et `audio_path` ensemble, masqués ensemble) — pas de vérification de
 * visibilité supplémentaire à faire côté client.
 */
export function AudioPlayerButton({ path }: { path: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const player = useAudioPlayer(url ?? undefined);
  const status = useAudioPlayerStatus(player);
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);

  useEffect(() => {
    let cancelled = false;
    setUrl(null);
    setFailed(false);
    getPredictionAudioUrl(path).then(({ url: signedUrl, error }) => {
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
  }, [path]);

  if (failed) {
    return <Text style={styles.errorText}>Message vocal indisponible.</Text>;
  }

  return (
    <Pressable
      onPress={() => (status.playing ? player.pause() : player.play())}
      disabled={!url}
      style={styles.button}
    >
      {!url ? (
        <ActivityIndicator size="small" color={colors.text} />
      ) : (
        <Text style={styles.text}>
          {status.playing ? '❙❙ Pause' : '▶ Écouter le message vocal'}
        </Text>
      )}
    </Pressable>
  );
}

function createStyles(colors: Colors) {
  return StyleSheet.create({
    button: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.pill,
      paddingVertical: 10,
      paddingHorizontal: 16,
      alignSelf: 'flex-start',
      backgroundColor: colors.goldSoft,
    },
    text: { fontSize: 13, fontWeight: '600', color: colors.text },
    errorText: { fontSize: 12, color: colors.textFaint },
  });
}
