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

import { useAuth } from '../../lib/auth';
import { formatCountdown, formatRevealAt } from '../../lib/datetime';
import {
  feedErrorMessage,
  fetchPredictionsFeed,
  isRevealed,
  type PredictionFeedItem,
} from '../../lib/predictions';
import { supabase } from '../../lib/supabase';
import { colors, fonts, radius, spacing } from '../../lib/theme';

/**
 * Période de rafraîchissement des comptes à rebours.
 *
 * Sans ce tic, « dans 2 min » reste affiché indéfiniment et une prédiction ne
 * bascule jamais visuellement sur « Révélée » sans quitter l'écran.
 */
const TICK_MS = 30_000;

type AuthorNames = Record<string, string>;

function PredictionCard({
  item,
  now,
  authorLabel,
}: {
  item: PredictionFeedItem;
  now: Date;
  authorLabel?: string;
}) {
  const revealAt = new Date(item.reveal_at);
  const revealed = isRevealed(item, now);

  return (
    <View style={styles.card}>
      <View style={[styles.badge, revealed ? styles.badgeOpen : styles.badgeLocked]}>
        <Text style={[styles.badgeText, revealed ? styles.badgeTextOpen : styles.badgeTextLocked]}>
          {revealed ? 'Révélée' : formatCountdown(revealAt, now)}
        </Text>
      </View>

      {authorLabel && <Text style={styles.author}>{authorLabel}</Text>}
      <Text style={styles.cardTeaser}>{item.teaser}</Text>

      {revealed && item.content ? (
        <View style={styles.contentBox}>
          <Text style={styles.contentLabel}>Contenu</Text>
          <Text style={styles.cardContent}>{item.content}</Text>
        </View>
      ) : (
        <View style={styles.sealedBox}>
          <Text style={styles.sealedText}>🔒 Contenu scellé jusqu’à la révélation</Text>
        </View>
      )}

      <Text style={styles.cardMeta}>
        {revealed ? 'Révélée' : 'Se révèle'} {formatRevealAt(revealAt)}
      </Text>
    </View>
  );
}

export default function HomeScreen() {
  const { username, session, signOut } = useAuth();
  const router = useRouter();

  const [feed, setFeed] = useState<PredictionFeedItem[] | null>(null);
  const [authorNames, setAuthorNames] = useState<AuthorNames>({});
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [now, setNow] = useState(() => new Date());

  const userId = session?.user.id;

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
        .select('id, username')
        .in('id', otherAuthorIds);
      const names: AuthorNames = {};
      for (const profile of profiles ?? []) {
        names[profile.id] = profile.username;
      }
      setAuthorNames(names);
    }
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

  const mine = (feed ?? []).filter((item) => item.author_id === userId);
  const fromCircle = (feed ?? []).filter((item) => item.author_id !== userId);

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <View style={styles.flex}>
          <Text style={styles.brand}>Predict</Text>
          <Text style={styles.greeting} numberOfLines={1}>
            {username ?? session?.user.email ?? ''}
          </Text>
        </View>
        <Pressable onPress={() => router.push('/circle')} hitSlop={8} style={styles.circleLink}>
          <Text style={styles.circleLinkText}>Le Cercle</Text>
        </Pressable>
        <Pressable onPress={signOut} hitSlop={8}>
          <Text style={styles.signOut}>Se déconnecter</Text>
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.gold} />}
      >
        {error && <Text style={styles.error}>{error}</Text>}

        {feed === null && !error ? (
          <ActivityIndicator style={styles.loader} color={colors.gold} />
        ) : (
          <>
            <Text style={styles.sectionTitle}>Mes prédictions</Text>
            {mine.length === 0 ? (
              <View style={styles.empty}>
                <Text style={styles.emptyTitle}>Aucune prédiction pour l’instant.</Text>
                <Text style={styles.emptyText}>
                  Écris ce que tu vois venir pour quelqu’un de ton cercle, et choisis
                  quand ça se dévoile.
                </Text>
              </View>
            ) : (
              mine.map((item) => <PredictionCard key={item.id} item={item} now={now} />)
            )}

            <Text style={[styles.sectionTitle, styles.sectionSpacing]}>Le Cercle</Text>
            {fromCircle.length === 0 ? (
              <Text style={styles.emptyText}>
                Rien de tes amis pour l’instant — leurs prédictions apparaîtront ici.
              </Text>
            ) : (
              fromCircle.map((item) => (
                <PredictionCard
                  key={item.id}
                  item={item}
                  now={now}
                  authorLabel={authorNames[item.author_id] ?? '…'}
                />
              ))
            )}
          </>
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
    fontFamily: fonts.serif,
    fontSize: 15,
    letterSpacing: 3,
    color: colors.gold,
    textTransform: 'uppercase',
  },
  greeting: { fontSize: 17, fontWeight: '700', color: colors.text, marginTop: 2 },
  circleLink: {
    borderWidth: 1,
    borderColor: colors.gold,
    borderRadius: radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  circleLinkText: { fontSize: 13, fontWeight: '700', color: colors.gold },
  signOut: { fontSize: 13, color: colors.textFaint },
  scroll: { padding: spacing.lg, paddingBottom: 8, flexGrow: 1 },
  sectionTitle: {
    fontFamily: fonts.serif,
    fontSize: 20,
    color: colors.text,
    marginBottom: 12,
  },
  sectionSpacing: { marginTop: spacing.lg },
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
    borderRadius: radius.sm,
    padding: 12,
    fontSize: 14,
    marginBottom: 12,
  },
  card: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: 16,
    marginBottom: 12,
    backgroundColor: colors.surface,
  },
  badge: {
    alignSelf: 'flex-start',
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginBottom: 10,
  },
  badgeLocked: { backgroundColor: colors.goldSoft },
  badgeOpen: { backgroundColor: colors.successSoft },
  badgeText: { fontSize: 12, fontWeight: '700' },
  badgeTextLocked: { color: colors.gold },
  badgeTextOpen: { color: colors.success },
  author: { fontSize: 12, color: colors.textFaint, marginBottom: 4 },
  cardTeaser: {
    fontFamily: fonts.serif,
    fontSize: 20,
    color: colors.text,
    lineHeight: 26,
  },
  contentBox: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  contentLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.gold,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 4,
  },
  cardContent: {
    fontFamily: fonts.serif,
    fontSize: 17,
    color: colors.text,
    lineHeight: 23,
  },
  sealedBox: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  sealedText: { fontSize: 13, color: colors.textFaint, fontStyle: 'italic' },
  cardMeta: { fontSize: 12, color: colors.textFaint, marginTop: 10 },
  footer: {
    paddingHorizontal: spacing.lg,
    paddingTop: 12,
    paddingBottom: 20,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  create: {
    backgroundColor: colors.gold,
    borderRadius: radius.sm,
    paddingVertical: 15,
    alignItems: 'center',
  },
  createPressed: { backgroundColor: colors.goldBright },
  createText: { color: colors.text, fontSize: 16, fontWeight: '700' },
});
