import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PredictionCard } from '../../../components/PredictionCard';
import { QuickCreateButton } from '../../../components/QuickCreateButton';
import { useAuth } from '../../../lib/auth';
import {
  feedErrorMessage,
  fetchPredictionsFeed,
  type PredictionFeedItem,
} from '../../../lib/predictions';
import { supabase } from '../../../lib/supabase';
import { colors, fonts, spacing } from '../../../lib/theme';

type AuthorInfo = { username: string; avatar_url: string | null };
type AuthorMap = Record<string, AuthorInfo>;
type Tab = 'upcoming' | 'past';

/** Le même fil que l'accueil, réparti en deux onglets selon la révélation. */
export default function ArchivesScreen() {
  const { session } = useAuth();
  const userId = session?.user.id;

  const [feed, setFeed] = useState<PredictionFeedItem[] | null>(null);
  const [authors, setAuthors] = useState<AuthorMap>({});
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState<Tab>('upcoming');

  const load = useCallback(async () => {
    if (!userId) return;
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
        .select('id, username, avatar_url')
        .in('id', otherAuthorIds);
      const map: AuthorMap = {};
      for (const profile of profiles ?? []) {
        map[profile.id] = { username: profile.username, avatar_url: profile.avatar_url };
      }
      setAuthors(map);
    }
  }, [userId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  async function handleRefresh() {
    setRefreshing(true);
    try {
      await load();
    } finally {
      setRefreshing(false);
    }
  }

  const upcoming = (feed ?? []).filter((item) => !item.is_revealed);
  const past = (feed ?? []).filter((item) => item.is_revealed);
  const shown = tab === 'upcoming' ? upcoming : past;

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Text style={styles.title}>Archives</Text>
        <QuickCreateButton />
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
          <Text style={styles.empty}>
            {tab === 'upcoming' ? 'Rien de scellé pour l’instant.' : 'Rien de révélé pour l’instant.'}
          </Text>
        ) : (
          shown.map((item) => (
            <PredictionCard
              key={item.id}
              item={item}
              now={new Date()}
              authorLabel={item.author_id !== userId ? authors[item.author_id]?.username ?? '…' : undefined}
              authorId={item.author_id !== userId ? item.author_id : undefined}
              authorAvatarUrl={item.author_id !== userId ? authors[item.author_id]?.avatar_url : undefined}
              userId={userId!}
              mode="accordion"
            />
          ))
        )}
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
    paddingTop: 14,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  title: { fontFamily: fonts.serifItalic, fontSize: 26, color: colors.text },
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
  scroll: { padding: spacing.lg, paddingBottom: 24, flexGrow: 1 },
  loader: { marginTop: 32 },
  empty: { fontSize: 14, color: colors.textFaint, textAlign: 'center', marginTop: 32 },
  error: {
    color: colors.danger,
    backgroundColor: colors.dangerSoft,
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    marginBottom: 12,
  },
});
