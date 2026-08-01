import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PredictionCard } from '../../../components/PredictionCard';
import { useAuth } from '../../../lib/auth';
import { fetchNotifications } from '../../../lib/notifications';
import {
  feedErrorMessage,
  fetchPredictionsFeed,
  type PredictionFeedItem,
} from '../../../lib/predictions';
import { supabase } from '../../../lib/supabase';
import { colors, fonts, spacing } from '../../../lib/theme';

/**
 * Période de rafraîchissement des comptes à rebours.
 *
 * Sans ce tic, « dans 2 min » reste affiché indéfiniment et une prédiction ne
 * bascule jamais visuellement sur « Révélée » sans quitter l'écran.
 */
const TICK_MS = 30_000;

type AuthorNames = Record<string, string>;

export default function HomeScreen() {
  const { username, session } = useAuth();
  const router = useRouter();

  const [feed, setFeed] = useState<PredictionFeedItem[] | null>(null);
  const [authorNames, setAuthorNames] = useState<AuthorNames>({});
  const [unreadCount, setUnreadCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [now, setNow] = useState(() => new Date());

  const userId = session?.user.id;

  const load = useCallback(async () => {
    if (!userId) return;

    // Rattrape les notifications de révélation en retard avant de lire le
    // fil et le compteur — sans ça, une prédiction tout juste révélée
    // pourrait ne pas encore avoir sa notification au premier chargement.
    await supabase.rpc('generate_reveal_notifications');

    const { data, error: fetchError } = await fetchPredictionsFeed();

    if (fetchError) {
      setError(feedErrorMessage(fetchError));
      return;
    }

    setError(null);
    const items = data ?? [];
    setFeed(items);

    const otherAuthorIds = Array.from(
      new Set(items.filter((item) => item.author_id !== userId).map((item) => item.author_id))
    );
    if (otherAuthorIds.length > 0) {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, username')
        .in('id', otherAuthorIds);
      const names: AuthorNames = {};
      for (const profile of profiles ?? []) {
        names[profile.id] = profile.username;
      }
      setAuthorNames(names);
    }

    const { data: notifications } = await fetchNotifications(userId);
    setUnreadCount((notifications ?? []).filter((n) => !n.is_read).length);
  }, [userId]);

  // Au focus et non au montage : les écrans de création/gestion reviennent
  // ici par `router.back()`, qui ne remonte pas le composant. Sans ça, une
  // prédiction tout juste créée n'apparaîtrait qu'après un pull-to-refresh.
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
        <Pressable onPress={() => router.push('/notifications')} hitSlop={8} style={styles.iconButton}>
          <Text style={styles.iconButtonText}>Notifs</Text>
          {unreadCount > 0 && (
            <View style={styles.badgeDot}>
              <Text style={styles.badgeDotText}>{unreadCount > 9 ? '9+' : unreadCount}</Text>
            </View>
          )}
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.gold} />}
      >
        {error && <Text style={styles.error}>{error}</Text>}

        {feed === null && !error ? (
          <ActivityIndicator style={styles.loader} color={colors.gold} />
        ) : (feed ?? []).length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>Aucune prédiction pour l’instant.</Text>
            <Text style={styles.emptyText}>
              Écris ce que tu vois venir pour quelqu’un de ton cercle, et choisis
              quand ça se dévoile.
            </Text>
          </View>
        ) : (
          (feed ?? []).map((item) => (
            <PredictionCard
              key={item.id}
              item={item}
              now={now}
              authorLabel={item.author_id !== userId ? authorNames[item.author_id] ?? '…' : undefined}
              onPress={() => router.push(`/prediction/${item.id}`)}
            />
          ))
        )}
      </ScrollView>

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
  safe: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: spacing.md,
  },
  brand: {
    fontFamily: fonts.serifItalic,
    fontSize: 15,
    letterSpacing: 3,
    color: colors.gold,
    textTransform: 'uppercase',
  },
  greeting: { fontSize: 17, fontWeight: '700', color: colors.text, marginTop: 2 },
  iconButton: { position: 'relative', paddingHorizontal: 2 },
  iconButtonText: { fontSize: 13, color: colors.textMuted, fontWeight: '600' },
  badgeDot: {
    position: 'absolute',
    top: -8,
    right: -10,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    paddingHorizontal: 3,
    backgroundColor: colors.gold,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeDotText: { fontSize: 10, fontWeight: '700', color: colors.background },
  scroll: { padding: spacing.lg, paddingBottom: 8, flexGrow: 1 },
  loader: { marginTop: 32 },
  empty: { paddingVertical: 24, alignItems: 'center' },
  emptyTitle: { fontSize: 16, fontWeight: '600', color: colors.text, marginBottom: 6 },
  emptyText: {
    fontSize: 14,
    color: colors.textFaint,
    textAlign: 'center',
    lineHeight: 20,
  },
  error: {
    color: colors.danger,
    backgroundColor: colors.dangerSoft,
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    marginBottom: 12,
  },
  footer: {
    paddingHorizontal: spacing.lg,
    paddingTop: 12,
    paddingBottom: 20,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  create: {
    backgroundColor: colors.gold,
    borderRadius: 8,
    paddingVertical: 15,
    alignItems: 'center',
  },
  createPressed: { backgroundColor: colors.goldBright },
  createText: { color: colors.text, fontSize: 16, fontWeight: '700' },
});
