import { useFocusEffect, useRouter } from 'expo-router';
import { ChevronLeft, ChevronRight, SlidersHorizontal, XCircle } from 'lucide-react-native';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { Text } from '../../../components/Text';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Avatar } from '../../../components/Avatar';
import { CelebrationBurst } from '../../../components/CelebrationBurst';
import { CreateFab } from '../../../components/CreateFab';
import { PredictionCard } from '../../../components/PredictionCard';
import { PredictWord } from '../../../components/PredictWord';
import { WelcomeOnboarding } from '../../../components/WelcomeOnboarding';
import { useAuth } from '../../../lib/auth';
import { fetchFriendships } from '../../../lib/friends';
import { fetchNotifications, markNotificationRead } from '../../../lib/notifications';
import {
  buildMentionLabel,
  deletePrediction,
  feedErrorMessage,
  fetchPredictionsFeed,
  setPredictionUserState,
  type PredictionFeedItem,
} from '../../../lib/predictions';
import { supabase } from '../../../lib/supabase';
import { colors, fonts, radius, spacing } from '../../../lib/theme';

/**
 * Période de rafraîchissement des comptes à rebours.
 *
 * Sans ce tic, « dans 2 min » reste affiché indéfiniment et une prédiction ne
 * bascule jamais visuellement sur « Révélée » sans quitter l'écran.
 */
const TICK_MS = 30_000;

type AuthorInfo = { username: string; avatar_url: string | null };
type AuthorMap = Record<string, AuthorInfo>;
/** `feed` : les Predicts des autres (amis, groupes — et de futures
 * suggestions). `mine` : uniquement les siens. Révélés ou non des deux
 * côtés désormais : ce qui distingue les deux onglets, c'est qui a écrit
 * la prédiction, plus son statut de révélation. */
type Tab = 'feed' | 'mine';
type SortOrder = 'recent' | 'oldest';
type SortKey = 'default' | 'seal' | 'reveal';
type MenuView = 'main' | 'author';

/** Fil d'actualité — Archives a été fusionné ici, sous forme de deux onglets. */
export default function HomeScreen() {
  const { username, session, onboarded, markOnboarded } = useAuth();
  const router = useRouter();

  const [feed, setFeed] = useState<PredictionFeedItem[] | null>(null);
  const [authors, setAuthors] = useState<AuthorMap>({});
  const [votedIds, setVotedIds] = useState<Set<string>>(new Set());
  // Amis acceptés du viewer — sert uniquement à choisir, parmi plusieurs
  // personnes citées dans un teaser, un nom que le viewer reconnaîtra.
  const [friendIds, setFriendIds] = useState<Set<string>>(new Set());
  const [celebration, setCelebration] = useState<{ visible: boolean; message: ReactNode }>({
    visible: false,
    message: '',
  });
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [now, setNow] = useState(() => new Date());
  // Le Fil par défaut, à gauche — c'est ce qu'on veut voir en premier en
  // ouvrant l'app : ce que prédit son Cercle, pas son propre journal.
  const [tab, setTab] = useState<Tab>('feed');
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuView, setMenuView] = useState<MenuView>('main');
  const [authorFilter, setAuthorFilter] = useState<string | null>(null);
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  // `'default'` : l'ordre de chaque onglet reste celui déjà établi (À venir
  // par publication, Passées par date de révélation) — un tri par date de
  // scellé ou de révélation est une bascule optionnelle, pas un nouveau défaut.
  const [sortKey, setSortKey] = useState<SortKey>('default');
  const [sortOrder, setSortOrder] = useState<SortOrder>('recent');
  const [showHidden, setShowHidden] = useState(false);

  function toggleSortKey(key: 'seal' | 'reveal') {
    if (sortKey === key) {
      setSortOrder((o) => (o === 'recent' ? 'oldest' : 'recent'));
    } else {
      setSortKey(key);
      setSortOrder('recent');
    }
  }

  // `showHidden` n'est pas compté : c'est un « afficher plus », pas un filtre
  // qui cache du contenu — sa propre ligne dans le menu se désactive déjà
  // d'elle-même en la retapant.
  const hasActiveFilters = authorFilter !== null || favoritesOnly || sortKey !== 'default';

  function resetFilters() {
    setAuthorFilter(null);
    setFavoritesOnly(false);
    setSortKey('default');
    setSortOrder('recent');
  }

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
    // de l'avatar affiché dans l'en-tête, à côté de « Predict ». Les ids
    // mentionnés (« @pseudo ») s'y ajoutent, pour résoudre leur pseudo sans
    // requête séparée — même Map que les auteurs.
    const authorIds = Array.from(
      new Set([...items.map((item) => item.author_id), ...items.flatMap((item) => item.mentioned_user_ids), userId])
    );
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

    const { data: friendships } = await fetchFriendships(userId);
    const accepted = (friendships ?? []).filter((f) => f.status === 'accepted');
    setFriendIds(
      new Set(accepted.map((f) => (f.requester_id === userId ? f.addressee_id : f.requester_id)))
    );

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
        message: approval.prediction ? (
          `« ${approval.prediction.teaser} » approuvé par vos pairs !`
        ) : (
          <>
            <PredictWord /> approuvé par vos pairs !
          </>
        ),
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

  // Posé à l'ouverture de la carte — c'est ce qui fait baisser le compteur du
  // badge d'onglet et retire le surlignage « non lue ».
  function handleMarkSeen(predictionId: string) {
    setFeed((prev) =>
      (prev ?? []).map((item) => (item.id === predictionId ? { ...item, is_seen: true } : item))
    );
    if (userId) setPredictionUserState(predictionId, userId, { seen: true });
  }

  const byTab = (feed ?? []).filter((item) =>
    tab === 'mine' ? item.author_id === userId : item.author_id !== userId
  );
  const hiddenCount = byTab.filter((item) => item.is_hidden).length;

  // Comptés indépendamment de l'onglet actif : le badge de « Mes Predicts »
  // doit rester juste même quand on regarde « Fil », et inversement.
  const unreadMine = (feed ?? []).filter((item) => item.author_id === userId && !item.is_seen).length;
  const unreadFeed = (feed ?? []).filter((item) => item.author_id !== userId && !item.is_seen).length;

  const authorEntries = Array.from(new Set(byTab.map((item) => item.author_id))).map((id) => ({
    id,
    username: authors[id]?.username ?? '…',
  }));

  const filtered = byTab
    .filter((item) => showHidden || !item.is_hidden)
    .filter((item) => !authorFilter || item.author_id === authorFilter)
    .filter((item) => !favoritesOnly || item.is_favorite);

  const shown = [...filtered].sort((a, b) => {
    if (sortKey === 'seal') {
      const diff = new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      return sortOrder === 'recent' ? diff : -diff;
    }
    if (sortKey === 'reveal') {
      const diff = new Date(b.reveal_at).getTime() - new Date(a.reveal_at).getTime();
      return sortOrder === 'recent' ? -diff : diff;
    }
    // Défaut : ordre de publication, le plus récent en tête — les deux
    // onglets mêlent maintenant révélés et non révélés, l'ordre de scellé
    // reste le seul repère chronologique valable pour les deux à la fois.
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
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
        <Text style={styles.brand}>Predict</Text>
        <View style={styles.headerActions}>
          <Pressable style={styles.userChip} onPress={() => router.push('/profile')} hitSlop={4}>
            <Avatar url={userId ? authors[userId]?.avatar_url ?? null : null} username={username ?? ''} size={32} />
            <Text style={styles.userChipName} numberOfLines={1}>
              {username ?? session?.user.email ?? ''}
            </Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.tabs}>
        <Pressable onPress={() => setTab('feed')} style={[styles.tab, tab === 'feed' && styles.tabActive]}>
          <Text style={[styles.tabText, tab === 'feed' && styles.tabTextActive]}>Fil</Text>
          {unreadFeed > 0 && (
            <View style={styles.tabBadge}>
              <Text style={styles.tabBadgeText}>{unreadFeed > 99 ? '99+' : unreadFeed}</Text>
            </View>
          )}
        </Pressable>
        <Pressable onPress={() => setTab('mine')} style={[styles.tab, tab === 'mine' && styles.tabActive]}>
          <Text style={[styles.tabText, tab === 'mine' && styles.tabTextActive]}>Mes Predicts</Text>
          {unreadMine > 0 && (
            <View style={styles.tabBadge}>
              <Text style={styles.tabBadgeText}>{unreadMine > 99 ? '99+' : unreadMine}</Text>
            </View>
          )}
        </Pressable>
      </View>

      <View style={styles.filtersRow}>
        <Pressable
          onPress={() => {
            setMenuView('main');
            setMenuOpen(true);
          }}
          style={[styles.filtersToggle, hasActiveFilters && styles.filtersToggleActive]}
          hitSlop={4}
        >
          <SlidersHorizontal size={14} color={hasActiveFilters ? colors.text : colors.textFaint} strokeWidth={1.75} />
          <Text style={[styles.filtersToggleText, hasActiveFilters && styles.filtersToggleTextActive]}>
            Filtres
          </Text>
        </Pressable>

        {hasActiveFilters && (
          <Pressable onPress={resetFilters} style={styles.filtersReset} hitSlop={4}>
            <XCircle size={14} color={colors.icon} strokeWidth={1.75} />
            <Text style={styles.filtersResetText}>Réinitialiser</Text>
          </Pressable>
        )}
      </View>

      <Modal
        visible={menuOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setMenuOpen(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setMenuOpen(false)}>
          <Pressable style={styles.menuBox} onPress={() => {}}>
            {menuView === 'main' ? (
              <>
                <Pressable onPress={() => setMenuView('author')} style={styles.menuRow}>
                  <Text style={styles.menuRowText}>Auteur</Text>
                  <View style={styles.menuRowRight}>
                    <Text style={styles.menuRowValue} numberOfLines={1}>
                      {authorFilter ? authors[authorFilter]?.username ?? '…' : 'Tous'}
                    </Text>
                    <ChevronRight size={16} color={colors.icon} strokeWidth={1.75} />
                  </View>
                </Pressable>

                <Pressable onPress={() => toggleSortKey('seal')} style={styles.menuRow}>
                  <Text style={[styles.menuRowText, sortKey === 'seal' && styles.menuRowTextActive]}>
                    Par date de scellé
                  </Text>
                  {sortKey === 'seal' && (
                    <Text style={styles.menuRowValue}>
                      {sortOrder === 'recent' ? 'Plus récent' : 'Plus ancien'}
                    </Text>
                  )}
                </Pressable>

                <Pressable onPress={() => toggleSortKey('reveal')} style={styles.menuRow}>
                  <Text style={[styles.menuRowText, sortKey === 'reveal' && styles.menuRowTextActive]}>
                    Par date de révélation
                  </Text>
                  {sortKey === 'reveal' && (
                    <Text style={styles.menuRowValue}>
                      {sortOrder === 'recent' ? 'Plus récent' : 'Plus ancien'}
                    </Text>
                  )}
                </Pressable>

                <Pressable
                  onPress={() => setFavoritesOnly((o) => !o)}
                  style={hiddenCount === 0 && !hasActiveFilters ? styles.menuRowLast : styles.menuRow}
                >
                  <Text style={[styles.menuRowText, favoritesOnly && styles.menuRowTextActive]}>
                    ★ Favoris uniquement
                  </Text>
                </Pressable>

                {hiddenCount > 0 && (
                  <Pressable
                    onPress={() => setShowHidden((o) => !o)}
                    style={hasActiveFilters ? styles.menuRow : styles.menuRowLast}
                  >
                    <Text style={styles.menuRowText}>
                      {showHidden
                        ? 'Masquer à nouveau les masquées'
                        : `${hiddenCount} masquée${hiddenCount > 1 ? 's' : ''} — afficher`}
                    </Text>
                  </Pressable>
                )}

                {hasActiveFilters && (
                  <Pressable
                    onPress={() => {
                      resetFilters();
                      setMenuOpen(false);
                    }}
                    style={styles.menuRowLast}
                  >
                    <Text style={styles.menuRowTextReset}>Réinitialiser les filtres</Text>
                  </Pressable>
                )}
              </>
            ) : (
              <>
                <Pressable onPress={() => setMenuView('main')} style={styles.menuBack}>
                  <ChevronLeft size={16} color={colors.text} strokeWidth={1.75} />
                  <Text style={styles.menuBackText}>Auteur</Text>
                </Pressable>

                <Pressable
                  onPress={() => {
                    setAuthorFilter(null);
                    setMenuView('main');
                  }}
                  style={styles.menuRow}
                >
                  <Text style={[styles.menuRowText, authorFilter === null && styles.menuRowTextActive]}>
                    Tous
                  </Text>
                </Pressable>
                {authorEntries.map((a, i) => (
                  <Pressable
                    key={a.id}
                    onPress={() => {
                      setAuthorFilter(a.id);
                      setMenuView('main');
                    }}
                    style={i === authorEntries.length - 1 ? styles.menuRowLast : styles.menuRow}
                  >
                    <Text style={[styles.menuRowText, authorFilter === a.id && styles.menuRowTextActive]}>
                      {a.username}
                    </Text>
                  </Pressable>
                ))}
              </>
            )}
          </Pressable>
        </Pressable>
      </Modal>

      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.text} />}
      >
        {error && <Text style={styles.error}>{error}</Text>}

        {feed === null && !error ? (
          <ActivityIndicator style={styles.loader} color={colors.text} />
        ) : shown.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>
              {tab === 'mine' ? (
                <>
                  Aucun <PredictWord /> écrit pour l’instant.
                </>
              ) : (
                'Rien de ton Cercle pour l’instant.'
              )}
            </Text>
            {tab === 'mine' ? (
              <Text style={styles.emptyText}>
                Écris ce que tu vois venir pour quelqu’un de ton cercle, et choisis
                quand ça se dévoile.
              </Text>
            ) : (
              <Text style={styles.emptyText}>
                Les Predicts de tes amis et de tes groupes apparaîtront ici.
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
              mentionLabel={buildMentionLabel(
                item.id,
                item.mentioned_user_ids,
                Object.fromEntries(item.mentioned_user_ids.map((id) => [id, authors[id]?.username])),
                userId!,
                friendIds
              )}
              userId={userId!}
              hasVoted={votedIds.has(item.id)}
              unseen={!item.is_seen}
              onPress={() => {
                handleMarkSeen(item.id);
                router.push(`/prediction/${item.id}`);
              }}
              onDelete={() => handleDeletePrediction(item.id)}
              onFavoriteChange={(isFavorite) => handleFavoriteChange(item.id, isFavorite)}
              onHiddenChange={(isHidden) => handleHiddenChange(item.id, isHidden)}
            />
          ))
        )}
      </ScrollView>

      <CreateFab />
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
  brand: {
    fontFamily: fonts.display,
    fontSize: 24,
    color: colors.text,
    flexShrink: 0,
  },
  // `flexShrink` + `minWidth: 0` en chaîne (plutôt qu'un `maxWidth` en
  // pourcentage sur `userChip`, calculé contre un parent lui-même sans
  // largeur définie) : c'est ce qui permet au pseudo de rétrécir avec
  // ellipse au lieu de s'effondrer à un seul caractère sur certains
  // navigateurs mobiles.
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 14, flexShrink: 1, minWidth: 0 },
  userChip: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1, minWidth: 0 },
  userChipName: { fontSize: 14, fontWeight: '700', color: colors.text, flexShrink: 1, minWidth: 0 },
  // Trait sous le choix plutôt qu'un bouton de couleur — plus sobre, plus
  // « presse ». Le trait actif reprend le jaune de marque, épais pour rester
  // net face à la fine bordure neutre du reste de la barre.
  tabs: {
    flexDirection: 'row',
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    paddingVertical: 12,
    alignItems: 'center',
    gap: 6,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
    marginBottom: -1,
  },
  tabActive: { borderBottomColor: colors.gold },
  // Même principe que le badge de la cloche de notifications — rouge plein,
  // texte blanc, taille fixe pour ne pas déplacer le libellé de l'onglet.
  tabBadge: {
    backgroundColor: colors.notificationBadge,
    borderRadius: radius.pill,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabBadgeText: { fontSize: 10, fontWeight: '700', color: '#FFFFFF' },
  tabText: {
    fontFamily: fonts.bodyEmphasis,
    fontSize: 14,
    color: colors.icon,
  },
  tabTextActive: { color: colors.text },
  filtersRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
  },
  filtersToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 2,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  filtersToggleActive: { borderBottomColor: colors.text },
  filtersToggleText: { fontSize: 12, fontWeight: '700', color: colors.textFaint },
  filtersToggleTextActive: { color: colors.text },
  filtersReset: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  filtersResetText: { fontSize: 12, fontWeight: '600', color: colors.textFaint },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
  },
  menuBox: {
    width: '100%',
    maxWidth: 340,
    borderRadius: 16,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: 10,
  },
  menuRowLast: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingVertical: 14,
    gap: 10,
  },
  menuRowRight: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1, maxWidth: '70%' },
  menuRowText: { fontSize: 14, fontWeight: '600', color: colors.textMuted },
  menuRowTextActive: { color: colors.text, fontWeight: '700' },
  menuRowTextReset: { fontSize: 14, fontWeight: '600', color: colors.danger },
  menuRowValue: { fontSize: 13, color: colors.textFaint, flexShrink: 1 },
  menuBack: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  menuBackText: { fontSize: 13, fontWeight: '700', color: colors.text },
  scroll: { padding: spacing.lg, paddingBottom: 88, flexGrow: 1 },
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
});
