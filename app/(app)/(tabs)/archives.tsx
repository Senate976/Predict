import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PredictionCard } from '../../../components/PredictionCard';
import { useAuth } from '../../../lib/auth';
import {
  feedErrorMessage,
  fetchPredictionsFeed,
  type PredictionFeedItem,
} from '../../../lib/predictions';
import { supabase } from '../../../lib/supabase';
import { colors, eyebrow, fonts, spacing } from '../../../lib/theme';

type AuthorNames = Record<string, string>;

/** Le même fil que l'accueil, réduit aux prédictions déjà révélées. */
export default function ArchivesScreen() {
  const { session } = useAuth();
  const router = useRouter();
  const userId = session?.user.id;

  const [feed, setFeed] = useState<PredictionFeedItem[] | null>(null);
  const [authorNames, setAuthorNames] = useState<AuthorNames>({});
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!userId) return;
    const { data, error: fetchError } = await fetchPredictionsFeed();
    if (fetchError) {
      setError(feedErrorMessage(fetchError));
      return;
    }
    setError(null);
    const items = (data ?? []).filter((item) => item.is_revealed);
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

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Text style={styles.eyebrow}>Historique</Text>
        <Text style={styles.title}>Archives</Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.gold} />}
      >
        {error && <Text style={styles.error}>{error}</Text>}

        {feed === null && !error ? (
          <ActivityIndicator style={styles.loader} color={colors.gold} />
        ) : (feed ?? []).length === 0 ? (
          <Text style={styles.empty}>Rien de révélé pour l’instant.</Text>
        ) : (
          (feed ?? []).map((item) => (
            <PredictionCard
              key={item.id}
              item={item}
              now={new Date()}
              authorLabel={item.author_id !== userId ? authorNames[item.author_id] ?? '…' : undefined}
              onPress={() => router.push(`/prediction/${item.id}`)}
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
    paddingHorizontal: spacing.lg,
    paddingTop: 14,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  eyebrow: { ...eyebrow, marginBottom: 4 },
  title: { fontFamily: fonts.serif, fontSize: 26, color: colors.text },
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
