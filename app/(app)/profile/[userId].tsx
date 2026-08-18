import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
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
import { Ban, Flag } from 'lucide-react-native';

import { BottomNavBar } from '../../../components/BottomNavBar';
import { ReportDialog } from '../../../components/ReportDialog';
import { useAuth } from '../../../lib/auth';
import { blockUser, isBlockedByMe, unblockUser } from '../../../lib/moderation';
import { PredictWord } from '../../../components/PredictWord';
import { PrediscoreGauge } from '../../../components/PrediscoreGauge';
import { fetchProfileById, type FriendProfile } from '../../../lib/friends';
import {
  fetchPredictionStats,
  fetchPrediscore,
  isMissingSchema,
  type PredictionStats,
} from '../../../lib/predictions';
import { eyebrow, fonts, radius, spacing, type Colors } from '../../../lib/theme';
import { useColors } from '../../../lib/themeMode';

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
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [profile, setProfile] = useState<FriendProfile | null>(null);
  const [stats, setStats] = useState<PredictionStats | null>(null);
  const [prediscore, setPrediscore] = useState<number | null>(null);
  const [prediscoreLoaded, setPrediscoreLoaded] = useState(false);
  const [prediscoreError, setPrediscoreError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [avatarOpen, setAvatarOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [blockPending, setBlockPending] = useState(false);
  const { session } = useAuth();
  const myId = session?.user.id;

  const load = useCallback(async () => {
    if (!userId) return;

    const { data, error: fetchError } = await fetchProfileById(userId);
    if (fetchError || !data) {
      setError('Profil introuvable.');
      return;
    }
    setError(null);
    setProfile(data);
    if (myId) setBlocked(await isBlockedByMe(myId, userId));

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
              <Text style={styles.username}>{profile.username}</Text>
            </View>

            {/* La barre de Prediscore vient directement sous les infos du
                profil, à 50% de la largeur — plus de carte séparée autour. */}
            <View style={[styles.prediscoreWrap, styles.sectionSpacing]}>
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
                  <Text style={styles.statLabel}>Scellées</Text>
                </View>
              </View>
            )}

            {/* Signaler et bloquer, en bas et en retrait : ce sont des recours,
                pas des actions courantes. Jamais sur son propre profil. */}
            {myId && myId !== userId && (
              <View style={styles.moderation}>
                <Pressable onPress={() => setReportOpen(true)} style={styles.moderationRow}>
                  <Flag size={19} color={colors.icon} strokeWidth={1.75} />
                  <Text style={styles.moderationText}>Signaler {profile.username}</Text>
                </Pressable>

                <Pressable
                  onPress={async () => {
                    setBlockPending(true);
                    if (blocked) {
                      await unblockUser(myId, userId);
                      setBlocked(false);
                    } else {
                      await blockUser(userId);
                      setBlocked(true);
                    }
                    setBlockPending(false);
                  }}
                  disabled={blockPending}
                  style={[styles.moderationRow, styles.moderationRowLast]}
                >
                  <Ban size={19} color={blocked ? colors.icon : colors.danger} strokeWidth={1.75} />
                  <Text style={[styles.moderationText, !blocked && styles.moderationTextDanger]}>
                    {blockPending
                      ? 'Un instant…'
                      : blocked
                        ? `Débloquer ${profile.username}`
                        : `Bloquer ${profile.username}`}
                  </Text>
                </Pressable>
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

      {userId && myId && (
        <ReportDialog
          visible={reportOpen}
          target={{ kind: 'user', id: userId }}
          reporterId={myId}
          onClose={() => setReportOpen(false)}
        />
      )}

      <BottomNavBar />
    </SafeAreaView>
  );
}

function createStyles(colors: Colors) {
  return StyleSheet.create({
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
  eyebrow: { ...eyebrow(colors) },
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
  username: { fontFamily: fonts.bodyEmphasis, fontSize: 26, color: colors.text, marginTop: 10 },
  prediscoreWrap: { width: '50%', minWidth: 180, alignSelf: 'center' },
  statsRow: { flexDirection: 'row', gap: 8, marginTop: spacing.lg },
  statCard: {
    flex: 1,
    paddingVertical: 16,
    borderRadius: radius.xl,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
  moderation: { marginTop: spacing.xl, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.md },
  moderationRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  moderationRowLast: { paddingBottom: 6 },
  moderationText: { fontSize: 16, color: colors.text },
  moderationTextDanger: { color: colors.danger },
  statValue: { fontFamily: fonts.body, fontSize: 32, color: colors.text },
  statLabel: { fontSize: 14, color: colors.textFaint, marginTop: 4, textTransform: 'uppercase', letterSpacing: 1 },
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
}
