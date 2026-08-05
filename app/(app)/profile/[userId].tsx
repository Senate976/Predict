import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { Text } from '../../../components/Text';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Avatar } from '../../../components/Avatar';
import { CreateFab } from '../../../components/CreateFab';
import { PredictWatermark } from '../../../components/PredictWatermark';
import { PredictWord } from '../../../components/PredictWord';
import { PrediscoreGauge } from '../../../components/PrediscoreGauge';
import { fetchProfileById, type FriendProfile } from '../../../lib/friends';
import {
  fetchPredictionStats,
  fetchPrediscore,
  isMissingSchema,
  type PredictionStats,
} from '../../../lib/predictions';
import { colors, eyebrow, fonts, radius, spacing } from '../../../lib/theme';

/**
 * Profil consultable d'un ami — accessible depuis Le Cercle ou depuis le nom
 * d'un auteur de commentaire. Uniquement des éléments publics agrégés
 * (compteurs, Prediscore) : jamais le détail des prédictions elles-mêmes,
 * `get_prediction_stats`/`get_prediscore` (security definer) réservent
 * d'ailleurs l'accès à soi-même ou à un ami accepté.
 */
export default function FriendProfileScreen() {
  const { userId } = useLocalSearchParams<{ userId: string }>();
  const router = useRouter();

  const [profile, setProfile] = useState<FriendProfile | null>(null);
  const [stats, setStats] = useState<PredictionStats | null>(null);
  const [prediscore, setPrediscore] = useState<number | null>(null);
  const [prediscoreLoaded, setPrediscoreLoaded] = useState(false);
  const [prediscoreError, setPrediscoreError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [avatarOpen, setAvatarOpen] = useState(false);

  const load = useCallback(async () => {
    if (!userId) return;

    const { data, error: fetchError } = await fetchProfileById(userId);
    if (fetchError || !data) {
      setError('Profil introuvable.');
      return;
    }
    setError(null);
    setProfile(data);

    const [{ data: statsData }, { data: prediscoreData, error: prediscoreFetchError }] = await Promise.all([
      fetchPredictionStats(userId),
      fetchPrediscore(userId),
    ]);
    setStats(statsData);
    setPrediscore(prediscoreData.score);
    setPrediscoreError(
      prediscoreFetchError
        ? isMissingSchema(prediscoreFetchError)
          ? 'Prediscore indisponible : le schéma n’est pas encore à jour.'
          : `Prediscore indisponible : ${prediscoreFetchError.message}`
        : null
    );
    setPrediscoreLoaded(true);
  }, [userId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  return (
    <SafeAreaView style={styles.safe}>
      <PredictWatermark opacity={0.05} />

      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <Text style={styles.back}>Retour</Text>
        </Pressable>
        <Text style={styles.headerTitle}>Profil</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        {error && <Text style={styles.error}>{error}</Text>}

        {!profile && !error ? (
          <ActivityIndicator color={colors.text} style={styles.loader} />
        ) : profile ? (
          <>
            <View style={styles.identityCard}>
              <Pressable
                onPress={() => profile.avatar_url && setAvatarOpen(true)}
                disabled={!profile.avatar_url}
                hitSlop={4}
              >
                <Avatar url={profile.avatar_url} username={profile.username} size={72} />
              </Pressable>
              <Text style={styles.username}>@{profile.username}</Text>
            </View>

            <View style={[styles.prediscoreCard, styles.sectionSpacing]}>
              {!prediscoreLoaded ? (
                <ActivityIndicator color={colors.text} style={styles.loader} />
              ) : prediscoreError ? (
                <Text style={styles.error}>{prediscoreError}</Text>
              ) : (
                <PrediscoreGauge
                  score={prediscore}
                  emptyMessage={`Le Prediscore de ${profile.username} apparaîtra après son premier Predict révélé.`}
                />
              )}
            </View>

            <Text style={[styles.eyebrow, styles.sectionSpacing]}>
              <PredictWord />
            </Text>
            {stats === null ? (
              <ActivityIndicator color={colors.text} style={styles.loader} />
            ) : (
              <View style={styles.statsRow}>
                <View style={styles.statCard}>
                  <Text style={styles.statValue}>{stats.total}</Text>
                  <Text style={styles.statLabel}>
                    <PredictWord />
                  </Text>
                </View>
                <View style={styles.statCard}>
                  <Text style={styles.statValue}>{stats.realized}</Text>
                  <Text style={styles.statLabel}>Réalisés</Text>
                </View>
                <View style={styles.statCard}>
                  <Text style={styles.statValue}>{stats.missed}</Text>
                  <Text style={styles.statLabel}>Manqués</Text>
                </View>
                <View style={styles.statCard}>
                  <Text style={styles.statValue}>{stats.pending}</Text>
                  <Text style={styles.statLabel}>En cours</Text>
                </View>
              </View>
            )}
          </>
        ) : null}
      </ScrollView>

      <Modal
        visible={avatarOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setAvatarOpen(false)}
      >
        <Pressable style={styles.lightboxBackdrop} onPress={() => setAvatarOpen(false)}>
          {profile?.avatar_url && (
            <Image
              source={{ uri: profile.avatar_url }}
              style={styles.lightboxImage}
              resizeMode="contain"
            />
          )}
        </Pressable>
      </Modal>

      <CreateFab />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerTitle: {
    fontFamily: fonts.display,
    fontSize: 17,
    color: colors.text,
  },
  back: { fontSize: 15, color: colors.text, width: 56 },
  headerSpacer: { width: 56 },
  scroll: { padding: spacing.lg, paddingBottom: 48 },
  loader: { marginTop: 24 },
  eyebrow: { ...eyebrow },
  sectionSpacing: { marginTop: spacing.xl },
  identityCard: {
    marginTop: spacing.sm,
    padding: 18,
    borderRadius: radius.xl,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
  username: { fontFamily: fonts.serifItalic, fontSize: 22, color: colors.text, marginTop: 10 },
  prediscoreCard: {
    paddingVertical: 24,
    borderRadius: radius.xl,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
  statsRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
  statCard: {
    flex: 1,
    paddingVertical: 16,
    borderRadius: radius.xl,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
  statValue: { fontFamily: fonts.display, fontSize: 26, color: colors.text },
  statLabel: { fontSize: 11, color: colors.textFaint, marginTop: 4, textTransform: 'uppercase', letterSpacing: 1 },
  error: {
    color: colors.danger,
    backgroundColor: colors.dangerSoft,
    borderRadius: radius.sm,
    padding: 12,
    fontSize: 14,
    marginBottom: 12,
  },
  lightboxBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(23, 21, 18, 0.92)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  lightboxImage: { width: '88%', height: '70%' },
});
