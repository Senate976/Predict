import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';

import { Bookshelf, type ShelfBook } from '../../../components/Bookshelf';
import { BottomNavBar } from '../../../components/BottomNavBar';
import { Text } from '../../../components/Text';
import { useAuth } from '../../../lib/auth';
import {
  fetchPredictionsFeed,
  feedErrorMessage,
  isRevealed,
  setPredictionUserState,
  type PredictionFeedItem,
} from '../../../lib/predictions';
import { supabase } from '../../../lib/supabase';
import { fonts, spacing, type Colors } from '../../../lib/theme';
import { useColors } from '../../../lib/themeMode';

/**
 * UN RAYON EN ENTIER.
 *
 * Le caisson de l'accueil ne montre que les premiers livres — au-delà, il
 * faudrait tasser des dos jusqu'à les rendre illisibles. Le « + » amène ici,
 * où le même rayon se déroule sans limite.
 *
 * La répartition est refaite à l'identique de l'accueil plutôt que passée en
 * paramètre : un rayon qui se remplirait autrement selon la façon dont on y
 * est arrivé serait pire qu'inutile.
 */
const RAYONS = {
  scellees: {
    titre: 'Scellées',
    vide: 'Aucun secret en attente.',
    garde: (item: PredictionFeedItem, moi: string, now: Date) =>
      item.type !== 'question' && item.author_id !== moi && !isRevealed(item, now),
  },
  miennes: {
    titre: 'Les miennes',
    vide: 'Tu ne gardes aucun secret.',
    garde: (item: PredictionFeedItem, moi: string, now: Date) =>
      item.type !== 'question' && item.author_id === moi && !isRevealed(item, now),
  },
  revelees: {
    titre: 'Révélées',
    vide: "Rien n'est encore sorti.",
    garde: (item: PredictionFeedItem, _moi: string, now: Date) =>
      item.type !== 'question' && isRevealed(item, now),
  },
  sondages: {
    titre: 'Sondages',
    vide: 'Aucune question posée.',
    garde: (item: PredictionFeedItem) => item.type === 'question',
  },
} as const;

type NomRayon = keyof typeof RAYONS;

export default function RayonScreen() {
  const { zone } = useLocalSearchParams<{ zone: string }>();
  const router = useRouter();
  const { session } = useAuth();
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const userId = session?.user.id;

  const [feed, setFeed] = useState<PredictionFeedItem[] | null>(null);
  const [authors, setAuthors] = useState<Record<string, { username: string; avatar_url: string | null }>>({});
  const [error, setError] = useState<string | null>(null);
  const now = useMemo(() => new Date(), []);

  const rayon = RAYONS[(zone as NomRayon) in RAYONS ? (zone as NomRayon) : 'scellees'];

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
    // Mêmes profils que l'accueil, chargés de la même façon : le nom écrit
    // sur la tranche doit être le même des deux côtés.
    const ids = Array.from(new Set(items.map((i) => i.author_id)));
    const { data: profils } = await supabase
      .from('profiles')
      .select('id, username, avatar_url')
      .in('id', ids);
    setAuthors(
      Object.fromEntries(
        (profils ?? []).map((p) => [p.id, { username: p.username, avatar_url: p.avatar_url }])
      )
    );
  }, [userId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const livres: ShelfBook[] = (feed ?? [])
    .filter((item) => !item.is_hidden && rayon.garde(item, userId ?? '', now))
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .map((item) => ({
      id: item.id,
      authorName: authors[item.author_id]?.username ?? '…',
      authorAvatarUrl: authors[item.author_id]?.avatar_url,
      highlighted:
        item.type !== 'question' &&
        item.author_id !== userId &&
        isRevealed(item, now) &&
        !item.is_opened,
      unread: !item.is_seen && item.author_id !== userId,
    }));

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <Text style={styles.back}>Retour</Text>
        </Pressable>
        <Text style={styles.title}>{rayon.titre}</Text>
        <View style={styles.spacer} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        {error && <Text style={styles.error}>{error}</Text>}
        {feed === null && !error ? (
          <ActivityIndicator color={colors.text} style={styles.loader} />
        ) : (
          <Bookshelf
            title={`${livres.length} livre${livres.length > 1 ? 's' : ''}`}
            books={livres}
            emptyLabel={rayon.vide}
            showAll
            onPressBook={(id) => {
              if (userId) setPredictionUserState(id, userId, { seen: true });
              router.push(`/prediction/${id}`);
            }}
          />
        )}
      </ScrollView>

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
    back: { fontSize: 15, color: colors.text },
    title: { fontFamily: fonts.display, fontSize: 17, color: colors.text },
    spacer: { width: 52 },
    scroll: { padding: spacing.lg },
    loader: { marginTop: spacing.lg },
    error: { color: colors.danger, marginBottom: spacing.md },
  });
}
