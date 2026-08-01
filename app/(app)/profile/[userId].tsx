import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Avatar } from '../../../components/Avatar';
import { PrestigeBadge } from '../../../components/PrestigeBadge';
import { QuickCreateButton } from '../../../components/QuickCreateButton';
import { fetchRealizedCount30d } from '../../../lib/badges';
import { fetchProfileById, type FriendProfile } from '../../../lib/friends';
import { fetchPredictionStats, type PredictionStats } from '../../../lib/predictions';
import { colors, eyebrow, fonts, radius, spacing } from '../../../lib/theme';

/**
 * Profil consultable d'un ami — accessible depuis Le Cercle ou depuis le nom
 * d'un auteur de commentaire. Uniquement des éléments publics agrégés
 * (compteurs, badge) : jamais le détail des prédictions elles-mêmes, `get_
 * prediction_stats` (security definer) réserve d'ailleurs l'accès à soi-même
 * ou à un ami accepté.
 */
export default function FriendProfileScreen() {
  const { userId } = useLocalSearchParams<{ userId: string }>();
  const router = useRouter();

  const [profile, setProfile] = useState<FriendProfile | null>(null);
  const [stats, setStats] = useState<PredictionStats | null>(null);
  const [badgeCount, setBadgeCount] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!userId) return;

    const { data, error: fetchError } = await fetchProfileById(userId);
    if (fetchError || !data) {
      setError('Profil introuvable.');
      return;
    }
    setError(null);
    setProfile(data);

    const [{ data: statsData }, { data: count }] = await Promise.all([
      fetchPredictionStats(userId),
      fetchRealizedCount30d(userId),
    ]);
    setStats(statsData);
    setBadgeCount(typeof count === 'number' ? count : 0);
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
        <QuickCreateButton />
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        {error && <Text style={styles.error}>{error}</Text>}

        {!profile && !error ? (
          <ActivityIndicator color={colors.gold} style={styles.loader} />
        ) : profile ? (
          <>
            <View style={styles.identityCard}>
              <Avatar url={profile.avatar_url} username={profile.username} size={72} />
              <Text style={styles.username}>@{profile.username}</Text>
            </View>

            <Text style={[styles.eyebrow, styles.sectionSpacing]}>Prestige</Text>
            <View style={styles.prestigeCard}>
              {badgeCount === null ? (
                <ActivityIndicator color={colors.gold} style={styles.loader} />
              ) : (
                <PrestigeBadge count={badgeCount} size="large" />
              )}
            </View>

            <Text style={[styles.eyebrow, styles.sectionSpacing]}>Scellés</Text>
            {stats === null ? (
              <ActivityIndicator color={colors.gold} style={styles.loader} />
            ) : (
              <View style={styles.statsRow}>
                <View style={styles.statCard}>
                  <Text style={styles.statValue}>{stats.total}</Text>
                  <Text style={styles.statLabel}>Total</Text>
                </View>
                <View style={styles.statCard}>
                  <Text style={[styles.statValue, styles.statValueRealized]}>{stats.realized}</Text>
                  <Text style={styles.statLabel}>Réalisés</Text>
                </View>
                <View style={styles.statCard}>
                  <Text style={[styles.statValue, styles.statValueMissed]}>{stats.missed}</Text>
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
  headerTitle: { fontFamily: fonts.serifItalic, fontSize: 18, color: colors.text },
  back: { fontSize: 15, color: colors.gold, width: 56 },
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
  prestigeCard: {
    marginTop: 12,
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
  statValue: { fontFamily: fonts.serifItalic, fontSize: 26, color: colors.text },
  statValueRealized: { color: colors.success },
  statValueMissed: { color: colors.danger },
  statLabel: { fontSize: 11, color: colors.textFaint, marginTop: 4, textTransform: 'uppercase', letterSpacing: 1 },
  error: {
    color: colors.danger,
    backgroundColor: colors.dangerSoft,
    borderRadius: radius.sm,
    padding: 12,
    fontSize: 14,
    marginBottom: 12,
  },
});
