import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioPlayer,
  useAudioPlayerStatus,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, radius } from '../lib/theme';
import { PredictWord } from './PredictWord';

type Props = {
  /** URI locale de l'enregistrement en cours (natif `file://`, ou `blob:`/`data:` sur web). */
  uri: string | null;
  onChange: (uri: string | null) => void;
  disabled?: boolean;
};

function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

/**
 * Enregistreur pour la prédiction vocale : bouton unique qui bascule
 * enregistrement → aperçu à l'écoute → possibilité de recommencer. Le fichier
 * n'est envoyé au stockage qu'à la validation du formulaire (lib/audio.ts) —
 * ce composant ne gère que la capture locale.
 */
export function PredictionRecorder({ uri, onChange, disabled }: Props) {
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(recorder);
  const player = useAudioPlayer(uri ?? undefined);
  const playerStatus = useAudioPlayerStatus(player);
  const [permissionError, setPermissionError] = useState<string | null>(null);

  async function handleStart() {
    setPermissionError(null);
    const { granted } = await requestRecordingPermissionsAsync();
    if (!granted) {
      setPermissionError('Autorise l’accès au micro pour enregistrer ton Predict.');
      return;
    }
    await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
    await recorder.prepareToRecordAsync();
    recorder.record();
  }

  async function handleStop() {
    await recorder.stop();
    onChange(recorder.uri);
  }

  if (uri) {
    return (
      <View style={styles.box}>
        <Pressable
          onPress={() => (playerStatus.playing ? player.pause() : player.play())}
          disabled={disabled}
          style={styles.playButton}
        >
          <Text style={styles.playButtonText}>{playerStatus.playing ? '❙❙ Pause' : '▶ Écouter'}</Text>
        </Pressable>
        <Text style={styles.duration}>
          {formatDuration((playerStatus.duration || 0) * 1000)}
        </Text>
        <Pressable onPress={() => onChange(null)} disabled={disabled} style={styles.resetButton}>
          <Text style={styles.resetButtonText}>Recommencer</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.box}>
      {permissionError && <Text style={styles.errorText}>{permissionError}</Text>}
      <Pressable
        onPress={recorderState.isRecording ? handleStop : handleStart}
        disabled={disabled}
        style={[styles.recordButton, recorderState.isRecording && styles.recordButtonActive]}
      >
        <View style={[styles.dot, recorderState.isRecording && styles.dotSquare]} />
        <Text style={styles.recordButtonText}>
          {recorderState.isRecording ? (
            `Arrêter · ${formatDuration(recorderState.durationMillis)}`
          ) : (
            <>
              Enregistrer mon <PredictWord />
            </>
          )}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    padding: 14,
    backgroundColor: colors.surface,
  },
  recordButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 12,
  },
  recordButtonActive: {},
  recordButtonText: { fontSize: 15, fontWeight: '600', color: colors.text },
  dot: { width: 12, height: 12, borderRadius: 6, backgroundColor: colors.danger },
  dotSquare: { borderRadius: 3 },
  playButton: { alignSelf: 'flex-start' },
  playButtonText: { fontSize: 15, fontWeight: '600', color: colors.gold },
  duration: { fontSize: 13, color: colors.textFaint, marginTop: 8 },
  resetButton: { marginTop: 10, alignSelf: 'flex-start' },
  resetButtonText: { fontSize: 13, color: colors.textMuted, fontWeight: '600' },
  errorText: { color: colors.danger, fontSize: 13, marginBottom: 10 },
});
