import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PrestigeBadge } from '../../../components/PrestigeBadge';
import { fetchRealizedCount30d } from '../../../lib/badges';
import { useAuth } from '../../../lib/auth';
import { formatRevealAt } from '../../../lib/datetime';
import {
  fetchPredictionOutcomes,
  type PredictionOutcome,
  type PredictionOutcomeStatus,
} from '../../../lib/predictions';
import { colors, eyebrow, fonts, radius, spacing } from '../../../lib/theme';

type Filter = 'total' | 'realized' | 'missed' | 'pending';

const FILTER_LABEL: Record<Filter, string> = {
  total: 'Total',
  realized: 'Réalisés',
  missed: 'Manqués',
  pending: 'En cours',
};

function statusLabel(status: PredictionOutcomeStatus, isRevealed: boolean): string {
  if (!isRevealed) return 'En cours';
  if (status === 'realized') return 'Réalisée';
  if (status === 'missed') return 'Manquée';
  return 'En attente du verdict';
}

export default function ProfileScreen() {
  const { username, session, signOut } = useAuth();
  const router = useRouter();
  const userId = session?.user.id;

  const [outcomes, setOutcomes] = useState<PredictionOutcome[] | null>(null);
  const [badgeCount, setBadgeCount] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('total');

  const load = useCallback(async () => {
    if (!userId) return;

    // Les deux chargements sont indépendants : un échec de l'un ne doit pas
    // laisser l'autre bloqué indéfiniment (le badge restait en chargement
    // perpétuel si les scellés échouaient, faute d'être jamais appelé).
    const { data, error: fetchError } = await fetchPredictionOutcomes(userId);
    if (fetchError) {
      setError(`Chargement impossible : ${fetchError.message}`);
    } else {
      setError(null);
      setOutcomes(data ?? []);
    }

    const { data: count, error: badgeError } = await fetchRealizedCount30d(userId);
    setBadgeCount(!badgeError && typeof count === 'number' ? count : 0);
  }, [userId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const realized = (outcomes ?? []).filter((o) => o.final_status === 'realized');
  const missed = (outcomes ?? []).filter((o) => o.final_status === 'missed');
  const pending = (outcomes ?? []).filter((o) => o.final_status === 'pending');
  const total = outcomes ?? [];

  const filtered =
    filter === 'realized' ? realized : filter === 'missed' ? missed : filter === 'pending' ? pending : total;

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.eyebrow}>Bienvenue</Text>
        <Text style={styles.brand}>Predict</Text>

        <View style={styles.identityCard}>
          <Text style={styles.eyebrow}>Nom d’utilisateur</Text>
          <Text style={styles.username}>@{username ?? '…'}</Text>
          <Text style={styles.email}>{session?.user.email ?? ''}</Text>
        </View>

        <Text style={[styles.eyebrow, styles.sectionSpacing]}>Prestige</Text>
        <View style={styles.prestigeCard}>
          {badgeCount === null ? (
            <ActivityIndicator color={colors.gold} style={styles.loader} />
          ) : (
            <>
              <PrestigeBadge count={badgeCount} size="large" />
              <Text style={styles.prestigeHint}>
                Prédictions approuvées par le Cercle, 30 derniers jours
              </Text>
            </>
          )}
        </View>

        <Text style={[styles.eyebrow, styles.sectionSpacing]}>Vos scellés</Text>

        {error && <Text style={styles.error}>{error}</Text>}

        {outcomes === null && !error ? (
          <ActivityIndicator color={colors.gold} style={styles.loader} />
        ) : (
          <>
            <View style={styles.statsRow}>
              <Pressable
                onPress={() => setFilter('total')}
                style={[styles.statCard, filter === 'total' && styles.statCardActive]}
              >
                <Text style={styles.statValue}>{total.length}</Text>
                <Text style={styles.statLabel}>Total</Text>
              </Pressable>
              <Pressable
                onPress={() => setFilter('realized')}
                style={[styles.statCard, filter === 'realized' && styles.statCardActive]}
              >
                <Text style={[styles.statValue, styles.statValueRealized]}>{realized.length}</Text>
                <Text style={styles.statLabel}>Réalisés</Text>
              </Pressable>
              <Pressable
                onPress={() => setFilter('missed')}
                style={[styles.statCard, filter === 'missed' && styles.statCardActive]}
              >
                <Text style={[styles.statValue, styles.statValueMissed]}>{missed.length}</Text>
                <Text style={styles.statLabel}>Manqués</Text>
              </Pressable>
              <Pressable
                onPress={() => setFilter('pending')}
                style={[styles.statCard, filter === 'pending' && styles.statCardActive]}
              >
                <Text style={styles.statValue}>{pending.length}</Text>
                <Text style={styles.statLabel}>En cours</Text>
              </Pressable>
            </View>

            <Pressable onPress={signOut} style={styles.signOut}>
              <Text style={styles.signOutText}>Se déconnecter</Text>
            </Pressable>

            <Text style={[styles.eyebrow, styles.sectionSpacing]}>{FILTER_LABEL[filter]}</Text>
            {filtered.length === 0 ? (
              <Text style={styles.hint}>Rien ici pour l’instant.</Text>
            ) : (
              filtered.map((item) => (
                <Pressable
                  key={item.prediction_id}
                  onPress={() => router.push(`/prediction/${item.prediction_id}`)}
                  style={styles.historyRow}
                >
                  <Text style={styles.historyTeaser} numberOfLines={2}>
                    {item.teaser}
                  </Text>
                  <Text style={styles.historyMeta}>
                    {statusLabel(item.final_status, item.is_revealed)} ·{' '}
                    {formatRevealAt(new Date(item.reveal_at))}
                  </Text>
                </Pressable>
              ))
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  scroll: { padding: spacing.lg, paddingBottom: 40 },
  eyebrow: { ...eyebrow },
  sectionSpacing: { marginTop: spacing.xl },
  brand: { fontFamily: fonts.serifItalic, fontSize: 40, color: colors.text, marginTop: 2 },
  identityCard: {
    marginTop: spacing.lg,
    padding: 18,
    borderRadius: radius.xl,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  username: { fontFamily: fonts.serifItalic, fontSize: 22, color: colors.text, marginTop: 6 },
  email: { fontSize: 13, color: colors.textFaint, marginTop: 4 },
  loader: { marginTop: 24 },
  prestigeCard: {
    marginTop: 12,
    paddingVertical: 24,
    borderRadius: radius.xl,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
  prestigeHint: {
    fontSize: 12,
    color: colors.textFaint,
    marginTop: 10,
    textAlign: 'center',
    paddingHorizontal: 24,
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
  statCardActive: { borderColor: colors.gold, backgroundColor: colors.goldSoft },
  statValue: { fontFamily: fonts.serifItalic, fontSize: 26, color: colors.text },
  statValueRealized: { color: colors.success },
  statValueMissed: { color: colors.danger },
  statLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: colors.textFaint,
    marginTop: 4,
  },
  signOut: {
    marginTop: spacing.lg,
    paddingVertical: 15,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
  signOutText: { fontSize: 14, fontWeight: '600', color: colors.textMuted },
  hint: { fontSize: 14, color: colors.textFaint, marginTop: 8 },
  historyRow: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  historyTeaser: { fontFamily: fonts.serifItalic, fontSize: 17, color: colors.text },
  historyMeta: { fontSize: 12, color: colors.textFaint, marginTop: 4 },
  error: {
    color: colors.danger,
    backgroundColor: colors.dangerSoft,
    borderRadius: radius.sm,
    padding: 12,
    fontSize: 14,
    marginTop: spacing.md,
  },
});
