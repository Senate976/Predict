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

import { CelebrationBurst } from '../../../components/CelebrationBurst';
import { PredictionCard } from '../../../components/PredictionCard';
import { WelcomeOnboarding } from '../../../components/WelcomeOnboarding';
import { useAuth } from '../../../lib/auth';
import { fetchNotifications, markNotificationRead } from '../../../lib/notifications';
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

type AuthorInfo = { username: string; avatar_url: string | null };
type AuthorMap = Record<string, AuthorInfo>;
type Tab = 'upcoming' | 'past';

/** Fil d'actualité — Archives a été fusionné ici, sous forme de deux onglets. */
export default function HomeScreen() {
  const { username, session, onboarded, markOnboarded } = useAuth();
  const router = useRouter();

  const [feed, setFeed] = useState<PredictionFeedItem[] | null>(null);
  const [authors, setAuthors] = useState<AuthorMap>({});
  const [celebration, setCelebration] = useState<{ visible: boolean; message: string }>({
    visible: false,
    message: '',
  });
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const [tab, setTab] = useState<Tab>('upcoming');

  const userId = session?.user.id;

  const load = useCallback(async () => {
    if (!userId) return;

    // Rattrape les notifications de révélation en retard avant de lire le
    // fil — sans ça, une prédiction tout juste révélée pourrait ne pas
    // encore avoir sa notification au premier chargement.
    await supabase.rpc('generate_reveal_notifications');

    const { data, error: fetchError } = await fetchPredictionsFeed();

    if (fetchError) {
      setError(feedErrorMessage(fetchError));
      return;
    }

    setError(null);
    const items = data ?? [];
    setFeed(items);

    const authorIds = Array.from(new Set(items.map((item) => item.author_id)));
    if (authorIds.length > 0) {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, username, avatar_url')
        .in('id', authorIds);
      const map: AuthorMap = {};
      for (const profile of profiles ?? []) {
        map[profile.id] = { username: profile.username, avatar_url: profile.avatar_url };
      }
      setAuthors(map);
    }

    // La première approbation non vue déclenche la célébration, une seule
    // fois — marquée lue tout de suite pour qu'un focus ultérieur de cet
    // écran ne la rejoue pas.
    const { data: notifications } = await fetchNotifications(userId);
    const approval = (notifications ?? []).find(
      (n) => n.type === 'prediction_approved' && !n.is_read
    );
    if (approval) {
      markNotificationRead(approval.id);
      setCelebration({
        visible: true,
        message: approval.prediction
          ? `« ${approval.prediction.teaser} » approuvée par vos pairs !`
          : 'Prédiction approuvée par vos pairs !',
      });
    }
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

  async function handleStartFirstPrediction() {
    await markOnboarded();
  }

  const upcoming = (feed ?? []).filter((item) => !item.is_revealed);
  const past = (feed ?? []).filter((item) => item.is_revealed);
  const shown = tab === 'upcoming' ? upcoming : past;

  return (
    <SafeAreaView style={styles.safe}>
      <WelcomeOnboarding visible={onboarded === false} onStart={handleStartFirstPrediction} />

      <CelebrationBurst
        visible={celebration.visible}
        message={celebration.message}
        onFinish={() => setCelebration((c) => ({ ...c, visible: false }))}
      />

      <View style={styles.header}>
        <View style={styles.flex}>
          <Text style={styles.brand}>Predict</Text>
          <Text style={styles.greeting} numberOfLines={1}>
            {username ?? session?.user.email ?? ''}
          </Text>
        </View>
      </View>

      <View style={styles.tabs}>
        <Pressable
          onPress={() => setTab('upcoming')}
          style={[styles.tab, tab === 'upcoming' && styles.tabActive]}
        >
          <Text style={[styles.tabText, tab === 'upcoming' && styles.tabTextActive]}>À venir</Text>
        </Pressable>
        <Pressable onPress={() => setTab('past')} style={[styles.tab, tab === 'past' && styles.tabActive]}>
          <Text style={[styles.tabText, tab === 'past' && styles.tabTextActive]}>Passées</Text>
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.gold} />}
      >
        {error && <Text style={styles.error}>{error}</Text>}

        {feed === null && !error ? (
          <ActivityIndicator style={styles.loader} color={colors.gold} />
        ) : shown.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>
              {tab === 'upcoming' ? 'Aucune prédiction en cours.' : 'Rien de révélé pour l’instant.'}
            </Text>
            {tab === 'upcoming' && (
              <Text style={styles.emptyText}>
                Écris ce que tu vois venir pour quelqu’un de ton cercle, et choisis
                quand ça se dévoile.
              </Text>
            )}
          </View>
        ) : (
          shown.map((item) => (
            <PredictionCard
              key={item.id}
              item={item}
              now={now}
              authorLabel={authors[item.author_id]?.username ?? '…'}
              authorId={item.author_id}
              authorAvatarUrl={authors[item.author_id]?.avatar_url}
              userId={userId!}
              mode={tab === 'past' ? 'accordion' : 'link'}
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
  brand: { fontFamily: fonts.serifItalic, fontSize: 26, color: colors.text },
  greeting: { fontSize: 17, fontWeight: '700', color: colors.text, marginTop: 2 },
  tabs: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 999,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  tabActive: { borderColor: colors.gold, backgroundColor: colors.goldSoft },
  tabText: { fontSize: 12, fontWeight: '700', letterSpacing: 1, color: colors.textMuted, textTransform: 'uppercase' },
  tabTextActive: { color: colors.gold },
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
