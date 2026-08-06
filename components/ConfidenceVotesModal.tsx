import { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from './Text';

import { Avatar } from './Avatar';
import { ConfidenceSlider } from './ConfidenceSlider';
import { castConfidenceVote, fetchConfidenceVotes, voteErrorMessage, type ConfidenceVoter } from '../lib/votes';
import { colors, radius } from '../lib/theme';

/**
 * Un seul et même panneau pour les deux actions liées au vote de confiance :
 * poser ou changer son propre vote (`ConfidenceSlider`, si éligible et pas
 * l'auteur), et consulter le détail de qui a voté quoi. Ouvert au tap sur la
 * jauge, carte du Fil comme écran détail.
 */
export function ConfidenceVotesModal({
  visible,
  predictionId,
  userId,
  canVote,
  myConfidence,
  onVoted,
  onClose,
}: {
  visible: boolean;
  predictionId: string;
  userId: string;
  /** Révélée et pas l'auteur — l'auteur ne vote pas sur sa propre prédiction. */
  canVote: boolean;
  myConfidence: number | null;
  /** Prévient l'écran/la carte appelante du nouveau vote, pour mettre à jour
   * la jauge sans recharger tout le fil. */
  onVoted: (confidence: number) => void;
  onClose: () => void;
}) {
  const [voters, setVoters] = useState<ConfidenceVoter[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setVoters(null);
    setError(null);
    setSubmitError(null);
    fetchConfidenceVotes(predictionId).then(({ data, error: fetchError }) => {
      if (fetchError) {
        setError('Chargement impossible.');
      } else {
        setVoters(data ?? []);
      }
    });
  }, [visible, predictionId]);

  async function handleSubmit(value: number) {
    setSubmitting(true);
    setSubmitError(null);
    const { error: submitErr } = await castConfidenceVote(predictionId, userId, value);
    setSubmitting(false);
    if (submitErr) {
      setSubmitError(voteErrorMessage(submitErr));
      return;
    }
    onVoted(value);
    setVoters((prev) => {
      const others = (prev ?? []).filter((v) => v.user_id !== userId);
      return [...others, { user_id: userId, username: 'Toi', avatar_url: null, confidence: value }];
    });
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={styles.box} onPress={() => {}}>
          {canVote && (
            <>
              <Text style={styles.title}>
                {myConfidence === null ? 'Ton vote' : 'Ton vote (modifiable)'}
              </Text>
              <ConfidenceSlider
                initialValue={myConfidence ?? 50}
                onSubmit={handleSubmit}
                submitting={submitting}
                submitLabel={myConfidence === null ? 'Voter' : 'Mettre à jour'}
              />
              {submitError && <Text style={styles.error}>{submitError}</Text>}
              <View style={styles.divider} />
            </>
          )}

          <Text style={styles.title}>Détails des votes</Text>
          {error ? (
            <Text style={styles.empty}>{error}</Text>
          ) : voters === null ? (
            <ActivityIndicator color={colors.text} style={styles.loader} />
          ) : voters.length === 0 ? (
            <Text style={styles.empty}>Personne n’a encore voté.</Text>
          ) : (
            <ScrollView>
              {voters.map((voter) => (
                <View key={voter.user_id} style={styles.row}>
                  <Avatar url={voter.avatar_url} username={voter.username} size={28} />
                  <Text style={styles.username} numberOfLines={1}>
                    {voter.user_id === userId ? 'Toi' : voter.username}
                  </Text>
                  <Text style={styles.confidence}>{voter.confidence}%</Text>
                </View>
              ))}
            </ScrollView>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  box: {
    width: '100%',
    maxWidth: 320,
    borderRadius: 16,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 14,
    paddingHorizontal: 18,
    maxHeight: '80%',
  },
  title: { fontSize: 15, fontWeight: '700', color: colors.text, marginBottom: 10 },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: 14 },
  error: { fontSize: 12, color: colors.danger, marginTop: 8 },
  loader: { marginVertical: 12 },
  empty: { fontSize: 13, color: colors.textFaint },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 7 },
  username: { flex: 1, fontSize: 14, fontWeight: '600', color: colors.text },
  confidence: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.text,
    backgroundColor: colors.goldSoft,
    borderRadius: radius.pill,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
});
