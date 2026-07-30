import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '../../lib/auth';
import { formatCountdown, formatRevealAt } from '../../lib/datetime';
import {
  fetchMyPredictions,
  isMissingTable,
  isRevealed,
  type Prediction,
} from '../../lib/predictions';

/**
 * Période de rafraîchissement des comptes à rebours.
 *
 * Sans ce tic, « dans 2 min » reste affiché indéfiniment et une prédiction ne
 * bascule jamais visuellement sur « Révélée » sans quitter l'écran.
 */
const TICK_MS = 30_000;

export default function HomeScreen() {
  const { username, session, signOut } = useAuth();
  const router = useRouter();

  const [predictions, setPredictions] = useState<Prediction[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [now, setNow] = useState(() => new Date());

  const userId = session?.user.id;

  const load = useCallback(async () => {
    if (!userId) return;

    const { data, error: fetchError } = await fetchMyPredictions(userId);

    if (fetchError) {
      setError(
        isMissingTable(fetchError)
          ? 'Table `predictions` introuvable. Exécute supabase/schema.sql dans le SQL Editor.'
          : `Chargement impossible : ${fetchError.message}`
      );
      return;
    }

    setError(null);
    setPredictions(data ?? []);
  }, [userId]);

  // Au focus et non au montage : l'écran de création revient ici par
  // `router.back()`, qui ne remonte pas le composant. Sans ça, une prédiction
  // tout juste créée n'apparaîtrait qu'après un pull-to-refresh.
  useFocusEffect(
    useCallback(() => {
      setNow(new Date());
      load();
    }, [load])
  );

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), TICK_MS);
    return () => clearInterval(interval);
  }, []);

  async function handleRefresh() {
    setRefreshing(true);
    setNow(new Date());
    try {
      await load();
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <View style={styles.flex}>
          <Text style={styles.brand}>Predict</Text>
          <Text style={styles.greeting} numberOfLines={1}>
            {username ?? session?.user.email ?? ''}
          </Text>
        </View>
        <Pressable onPress={signOut} hitSlop={8}>
          <Text style={styles.signOut}>Se déconnecter</Text>
        </Pressable>
      </View>

      <FlatList
        data={predictions ?? []}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
        }
        ListHeaderComponent={
          <>
            <Text style={styles.sectionTitle}>Mes prédictions</Text>
            {error && <Text style={styles.error}>{error}</Text>}
          </>
        }
        ListEmptyComponent={
          // `predictions === null` = premier chargement en cours. Sans cette
          // distinction, l'état vide s'afficherait une fraction de seconde
          // avant les données.
          predictions === null && !error ? (
            <ActivityIndicator style={styles.loader} />
          ) : (
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>Aucune prédiction pour l’instant.</Text>
              <Text style={styles.emptyText}>
                Écris ce que tu vois venir pour quelqu’un de ton cercle, et choisis
                quand ça se dévoile.
              </Text>
            </View>
          )
        }
        renderItem={({ item }) => {
          const revealAt = new Date(item.reveal_at);
          const revealed = isRevealed(item, now);

          return (
            <View style={styles.card}>
              <View style={[styles.badge, revealed ? styles.badgeOpen : styles.badgeLocked]}>
                <Text
                  style={[
                    styles.badgeText,
                    revealed ? styles.badgeTextOpen : styles.badgeTextLocked,
                  ]}
                >
                  {revealed ? 'Révélée' : formatCountdown(revealAt, now)}
                </Text>
              </View>
              <Text style={styles.cardContent}>{item.content}</Text>
              <Text style={styles.cardMeta}>
                {revealed ? 'Révélée' : 'Se révèle'} {formatRevealAt(revealAt)}
              </Text>
            </View>
          );
        }}
      />

      <View style={styles.footer}>
        <Pressable
          onPress={() => router.push('/new-prediction')}
          style={({ pressed }) => [styles.create, pressed && styles.createPressed]}
        >
          <Text style={styles.createText}>Nouvelle prédiction</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#fff' },
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
    gap: 12,
  },
  brand: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 2,
    color: '#2563eb',
    textTransform: 'uppercase',
  },
  greeting: { fontSize: 17, fontWeight: '700', color: '#111', marginTop: 2 },
  signOut: { fontSize: 13, color: '#6b7280' },
  list: { padding: 20, paddingBottom: 8, flexGrow: 1 },
  sectionTitle: { fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 12 },
  loader: { marginTop: 32 },
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingBottom: 40 },
  emptyTitle: { fontSize: 16, fontWeight: '600', color: '#374151', marginBottom: 6 },
  emptyText: {
    fontSize: 14,
    color: '#6b7280',
    textAlign: 'center',
    lineHeight: 20,
    maxWidth: 300,
  },
  error: {
    color: '#b91c1c',
    backgroundColor: '#fef2f2',
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    marginBottom: 12,
  },
  card: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    backgroundColor: '#fff',
  },
  badge: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginBottom: 10,
  },
  badgeLocked: { backgroundColor: '#eff6ff' },
  badgeOpen: { backgroundColor: '#f0fdf4' },
  badgeText: { fontSize: 12, fontWeight: '700' },
  badgeTextLocked: { color: '#1d4ed8' },
  badgeTextOpen: { color: '#166534' },
  cardContent: { fontSize: 16, color: '#111', lineHeight: 22 },
  cardMeta: { fontSize: 13, color: '#6b7280', marginTop: 10 },
  footer: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 20,
    borderTopWidth: 1,
    borderTopColor: '#f3f4f6',
  },
  create: {
    backgroundColor: '#2563eb',
    borderRadius: 10,
    paddingVertical: 15,
    alignItems: 'center',
  },
  createPressed: { backgroundColor: '#1d4ed8' },
  createText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
