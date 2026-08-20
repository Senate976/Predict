import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioPlayer,
  useAudioPlayerStatus,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';
import { Ionicons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from './Text';

import { fonts, radius, type Colors } from '../lib/theme';
import { useColors } from '../lib/themeMode';
import { PredictWord } from './PredictWord';

type Props = {
  /** URI locale de l'enregistrement en cours (natif `file://`, ou `blob:`/`data:` sur web). */
  uri: string | null;
  onChange: (uri: string | null) => void;
  disabled?: boolean;
  /**
   * `bloc` : le cadre bordé, sur sa propre ligne. `discret` : rien qu'un
   * picto micro, fait pour se poser dans un coin du champ de saisie.
   *
   * Le bouton « Enregistrer un vocal » disait à voix haute une possibilité
   * qui n'a pas à occuper une ligne entière : parler est une manière d'écrire,
   * pas une pièce jointe de plus. En discret, le micro se range là où on le
   * cherche — au bord du champ, comme dans une messagerie.
   */
  variant?: 'bloc' | 'discret';
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
export function PredictionRecorder({ uri, onChange, disabled, variant = 'bloc' }: Props) {
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(recorder);
  const player = useAudioPlayer(uri ?? undefined);
  const playerStatus = useAudioPlayerStatus(player);
  const [permissionError, setPermissionError] = useState<string | null>(null);
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);

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

  if (variant === 'discret') {
    // Un enregistrement existe : on le réécoute, ou on le jette pour
    // recommencer. Deux pictos, aucun mot — la place est comptée, on est dans
    // le coin d'un champ de saisie.
    if (uri) {
      return (
        <View style={styles.discreetRow}>
          <Pressable
            onPress={() => (playerStatus.playing ? player.pause() : player.play())}
            disabled={disabled}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={playerStatus.playing ? 'Mettre en pause' : 'Écouter mon vocal'}
          >
            <Ionicons
              name={playerStatus.playing ? 'pause' : 'play'}
              size={20}
              color={colors.text}
            />
          </Pressable>
          <Text style={styles.discreetDuration}>
            {formatDuration((playerStatus.duration || 0) * 1000)}
          </Text>
          <Pressable
            onPress={() => onChange(null)}
            disabled={disabled}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Supprimer mon vocal"
          >
            <Ionicons name="close" size={18} color={colors.textFaint} />
          </Pressable>
        </View>
      );
    }

    return (
      <View style={styles.discreetRow}>
        <Pressable
          onPress={recorderState.isRecording ? handleStop : handleStart}
          disabled={disabled}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel={
            recorderState.isRecording ? 'Arrêter l’enregistrement' : 'Enregistrer un vocal'
          }
        >
          {recorderState.isRecording ? (
            <View style={styles.dotSquare} />
          ) : (
            <Ionicons name="mic" size={22} color={colors.textMuted} />
          )}
        </Pressable>
        {recorderState.isRecording && (
          <Text style={styles.discreetDuration}>
            {formatDuration(recorderState.durationMillis)}
          </Text>
        )}
        {permissionError && <Text style={styles.discreetError}>{permissionError}</Text>}
      </View>
    );
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
        {/* Un picto micro dit le geste ; la pastille rouge, elle, se lisait
            comme un enregistrement déjà en cours. Pendant l'enregistrement on
            passe au carré « stop », qui est ce que le bouton fait alors. */}
        {recorderState.isRecording ? (
          <View style={styles.dotSquare} />
        ) : (
          <Ionicons name="mic" size={20} color={colors.text} />
        )}
        <Text style={styles.recordButtonText}>
          {recorderState.isRecording ? (
            `Arrêter · ${formatDuration(recorderState.durationMillis)}`
          ) : (
            // « Enregistrer mon Predict » se lisait comme « sauvegarder » —
            // le mot juste, à côté d'un bouton « Ajouter une photo », est le
            // geste : parler.
            'Enregistrer un vocal'
          )}
        </Text>
      </Pressable>
    </View>
  );
}

function createStyles(colors: Colors) {
  return StyleSheet.create({
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
  dotSquare: { width: 12, height: 12, borderRadius: 3, backgroundColor: colors.danger },
  // Aucun cadre ni fond : la rangée se pose dans le coin du champ de saisie,
  // qui porte déjà sa propre bordure.
  discreetRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  discreetDuration: { fontSize: 13, color: colors.textMuted },
  discreetError: { fontSize: 13, color: colors.danger, flexShrink: 1 },
  playButton: { alignSelf: 'flex-start' },
  playButtonText: { fontFamily: fonts.bodyEmphasis, fontSize: 15, color: colors.text },
  duration: { fontSize: 15, color: colors.textFaint, marginTop: 8 },
  resetButton: { marginTop: 10, alignSelf: 'flex-start' },
  resetButtonText: { fontSize: 15, color: colors.textMuted, fontWeight: '600' },
  errorText: { color: colors.danger, fontSize: 15, marginBottom: 10 },
  });
}
