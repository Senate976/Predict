import { Ionicons } from '@expo/vector-icons';
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

import { Avatar } from '../../../components/Avatar';
import { CelebrationBurst } from '../../../components/CelebrationBurst';
import { PredictionCard } from '../../../components/PredictionCard';
import { WelcomeOnboarding } from '../../../components/WelcomeOnboarding';
import { useAuth } from '../../../lib/auth';
import { fetchNotifications, markNotificationRead } from '../../../lib/notifications';
import {
  deletePrediction,
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
type SortOrder = 'recent' | 'oldest';

/** Fil d'actualité — Archives a été fusionné ici, sous forme de deux onglets. */
export default function HomeScreen() {
  const { username, session, onboarded, markOnboarded } = useAuth();
  const router = useRouter();

  const [feed, setFeed] = useState<PredictionFeedItem[] | null>(null);
  const [authors, setAuthors] = useState<AuthorMap>({});
  const [votedIds, setVotedIds] = useState<Set<string>>(new Set());
  const [celebration, setCelebration] = useState<{ visible: boolean; message: string }>({
    visible: false,
    message: '',
  });
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const [tab, setTab] = useState<Tab>('upcoming');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [authorFilter, setAuthorFilter] = useState<string | null>(null);
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  // Par défaut (`false`), l'ordre de chaque onglet reste celui déjà établi
  // (À venir par publication, Passées par date de révélation) — ce tri par
  // date de scellé est une bascule optionnelle, pas un nouveau défaut.
  const [sortBySealDate, setSortBySealDate] = useState(false);
  const [sortOrder, setSortOrder] = useState<SortOrder>('recent');
  const [showHidden, setShowHidden] = useState(false);

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

    // Inclut toujours son propre id, même fil vide : c'est aussi la source
    // de l'avatar affiché dans l'en-tête, à côté de « Predict ».
    const authorIds = Array.from(new Set([...items.map((item) => item.author_id), userId]));
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, username, avatar_url')
      .in('id', authorIds);
    const map: AuthorMap = {};
    for (const profile of profiles ?? []) {
      map[profile.id] = { username: profile.username, avatar_url: profile.avatar_url };
    }
    setAuthors(map);

    // Sert uniquement à masquer « Donner mon avis » une fois le vote posé —
    // la RLS de `prediction_votes` ne renvoie de toute façon que ses propres
    // votes, pas besoin de filtrer sur les ids de ce chargement.
    const { data: myVotes } = await supabase
      .from('prediction_votes')
      .select('prediction_id')
      .eq('voter_id', userId);
    setVotedIds(new Set((myVotes ?? []).map((v) => v.prediction_id)));

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

  async function handleDeletePrediction(predictionId: string) {
    const { error: deleteError } = await deletePrediction(predictionId);
    if (deleteError) {
      setError(`Suppression impossible : ${deleteError.message}`);
      return;
    }
    setFeed((prev) => (prev ?? []).filter((item) => item.id !== predictionId));
  }

  // Tient `feed` à jour immédiatement quand une carte bascule favori/masqué —
  // sans ça, les filtres de cet écran resteraient basés sur l'état chargé au
  // départ jusqu'au prochain rafraîchissement complet.
  function handleFavoriteChange(predictionId: string, isFavorite: boolean) {
    setFeed((prev) =>
      (prev ?? []).map((item) => (item.id === predictionId ? { ...item, is_favorite: isFavorite } : item))
    );
  }

  function handleHiddenChange(predictionId: string, isHidden: boolean) {
    setFeed((prev) =>
      (prev ?? []).map((item) => (item.id === predictionId ? { ...item, is_hidden: isHidden } : item))
    );
  }

  const byTab = (feed ?? []).filter((item) => (tab === 'upcoming' ? !item.is_revealed : item.is_revealed));
  const hiddenCount = byTab.filter((item) => item.is_hidden).length;

  const authorEntries = Array.from(new Set(byTab.map((item) => item.author_id))).map((id) => ({
    id,
    username: authors[id]?.username ?? '…',
  }));

  const filtered = byTab
    .filter((item) => showHidden || !item.is_hidden)
    .filter((item) => !authorFilter || item.author_id === authorFilter)
    .filter((item) => !favoritesOnly || item.is_favorite);

  const shown = [...filtered].sort((a, b) => {
    if (sortBySealDate) {
      const diff = new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      return sortOrder === 'recent' ? diff : -diff;
    }
    // Défaut inchangé : À venir par ordre de publication, Passées par date de
    // révélation la plus récente.
    return tab === 'past'
      ? new Date(b.reveal_at).getTime() - new Date(a.reveal_at).getTime()
      : new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });

  return (
    <SafeAreaView style={styles.safe}>
      <WelcomeOnboarding visible={onboarded === false} onStart={handleStartFirstPrediction} />

      <CelebrationBurst
        visible={celebration.visible}
        message={celebration.message}
        onFinish={() => setCelebration((c) => ({ ...c, visible: false }))}
      />

      <View style={styles.header}>
        <Text style={styles.brand}>Actu</Text>
        <View style={styles.headerActions}>
          <Pressable
            onPress={handleRefresh}
            disabled={refreshing}
            style={styles.refreshButton}
            hitSlop={8}
          >
            {refreshing ? (
              <ActivityIndicator size="small" color={colors.gold} />
            ) : (
              <Ionicons name="refresh-outline" size={20} color={colors.gold} />
            )}
          </Pressable>
          <Pressable style={styles.userChip} onPress={() => router.push('/profile')} hitSlop={4}>
            <Avatar url={userId ? authors[userId]?.avatar_url ?? null : null} username={username ?? ''} size={32} />
            <Text style={styles.userChipName} numberOfLines={1}>
              {username ?? session?.user.email ?? ''}
            </Text>
          </Pressable>
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

      <Pressable onPress={() => setFiltersOpen((o) => !o)} style={styles.filtersToggle} hitSlop={4}>
        <Text style={styles.filtersToggleText}>Filtres{filtersOpen ? ' ▲' : ' ▼'}</Text>
      </Pressable>

      {filtersOpen && (
        <View style={styles.filtersPanel}>
          <Text style={styles.filterLabel}>Auteur</Text>
          <View style={styles.filterChipsRow}>
            <Pressable
              onPress={() => setAuthorFilter(null)}
              style={[styles.filterChip, authorFilter === null && styles.filterChipActive]}
            >
              <Text style={[styles.filterChipText, authorFilter === null && styles.filterChipTextActive]}>
                Tous
              </Text>
            </Pressable>
            {authorEntries.map((a) => (
              <Pressable
                key={a.id}
                onPress={() => setAuthorFilter(a.id)}
                style={[styles.filterChip, authorFilter === a.id && styles.filterChipActive]}
              >
                <Text style={[styles.filterChipText, authorFilter === a.id && styles.filterChipTextActive]}>
                  {a.username}
                </Text>
              </Pressable>
            ))}
          </View>

          <Text style={[styles.filterLabel, styles.filterSpacing]}>Date de scellé</Text>
          <View style={styles.filterChipsRow}>
            <Pressable
              onPress={() => setSortBySealDate((o) => !o)}
              style={[styles.filterChip, sortBySealDate && styles.filterChipActive]}
            >
              <Text style={[styles.filterChipText, sortBySealDate && styles.filterChipTextActive]}>
                Trier par date de scellé
              </Text>
            </Pressable>
            {sortBySealDate && (
              <Pressable
                onPress={() => setSortOrder((o) => (o === 'recent' ? 'oldest' : 'recent'))}
                style={styles.filterChip}
              >
                <Text style={styles.filterChipText}>
                  {sortOrder === 'recent' ? 'Plus récent d’abord' : 'Plus ancien d’abord'}
                </Text>
              </Pressable>
            )}
          </View>

          <Text style={[styles.filterLabel, styles.filterSpacing]}>Favoris</Text>
          <View style={styles.filterChipsRow}>
            <Pressable
              onPress={() => setFavoritesOnly((o) => !o)}
              style={[styles.filterChip, favoritesOnly && styles.filterChipActive]}
            >
              <Text style={[styles.filterChipText, favoritesOnly && styles.filterChipTextActive]}>
                ★ Favoris uniquement
              </Text>
            </Pressable>
          </View>

          {hiddenCount > 0 && (
            <Pressable onPress={() => setShowHidden((o) => !o)} style={styles.showHiddenLink}>
              <Text style={styles.showHiddenLinkText}>
                {showHidden
                  ? 'Masquer à nouveau les prédictions masquées'
                  : `${hiddenCount} prédiction${hiddenCount > 1 ? 's' : ''} masquée${hiddenCount > 1 ? 's' : ''} — afficher`}
              </Text>
            </Pressable>
          )}
        </View>
      )}

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
              hasVoted={votedIds.has(item.id)}
              onPress={() => router.push(`/prediction/${item.id}`)}
              onDelete={() => handleDeletePrediction(item.id)}
              onFavoriteChange={(isFavorite) => handleFavoriteChange(item.id, isFavorite)}
              onHiddenChange={(isHidden) => handleHiddenChange(item.id, isHidden)}
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  brand: { fontFamily: fonts.serifItalic, fontSize: 26, color: colors.text },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  refreshButton: { padding: 2 },
  userChip: { flexDirection: 'row', alignItems: 'center', gap: 8, maxWidth: '55%' },
  userChipName: { fontSize: 14, fontWeight: '700', color: colors.text, flexShrink: 1 },
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
  filtersToggle: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, alignSelf: 'flex-start' },
  filtersToggleText: { fontSize: 12, fontWeight: '700', color: colors.textFaint },
  filtersPanel: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
  filterLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: colors.textFaint,
    marginBottom: 6,
  },
  filterSpacing: { marginTop: spacing.md },
  filterChipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  filterChip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: colors.surface,
  },
  filterChipActive: { borderColor: colors.gold, backgroundColor: colors.goldSoft },
  filterChipText: { fontSize: 12, fontWeight: '600', color: colors.textMuted },
  filterChipTextActive: { color: colors.gold },
  showHiddenLink: { marginTop: spacing.md },
  showHiddenLinkText: { fontSize: 12, fontWeight: '600', color: colors.gold },
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
