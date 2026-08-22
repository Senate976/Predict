import { useFocusEffect, useRouter } from 'expo-router';
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  SlidersHorizontal,
  User,
  XCircle,
} from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
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
import type { ShelfBook } from '../../../components/Bookshelf';
import { Library } from '../../../components/Library';
import { CelebrationBurst } from '../../../components/CelebrationBurst';
import { PredictWord } from '../../../components/PredictWord';
import { WelcomeOnboarding } from '../../../components/WelcomeOnboarding';
import { useAuth } from '../../../lib/auth';
import { fetchNotifications, markNotificationRead } from '../../../lib/notifications';
import {
  feedErrorMessage,
  fetchPredictionsFeed,
  isRevealed,
  setPredictionUserState,
  type PredictionFeedItem,
} from '../../../lib/predictions';
import { supabase } from '../../../lib/supabase';
import { fonts, radius, spacing, type Colors } from '../../../lib/theme';
import { useColors } from '../../../lib/themeMode';

/**
 * Période de rafraîchissement des comptes à rebours.
 *
 * Sans ce tic, « dans 2 min » reste affiché indéfiniment et une prédiction ne
 * bascule jamais visuellement sur « Révélée » sans quitter l'écran.
 */
const TICK_MS = 30_000;


type AuthorInfo = { username: string; avatar_url: string | null };
type AuthorMap = Record<string, AuthorInfo>;
/* Plus d'onglets. Le Fil est UNE liste, coupée en deux zones qu'on fait
   défiler l'une après l'autre : « Predict » (ce qui n'est pas encore ouvert —
   Scellées et Sondages en cours) puis « Ouverts » (ce qui l'est déjà).

   Deux onglets obligeaient à choisir un camp avant d'avoir rien vu, et
   cachaient la moitié du Fil derrière un geste que personne ne faisait : on
   arrivait sur « Predict », on ne voyait jamais ce qui s'était ouvert. Une
   seule liste montre les deux, dans l'ordre où ça compte — ce qui attend
   d'abord, ce qui est joué ensuite. Les siennes et celles reçues restent
   mélangées : ce qui sépare les deux zones est le statut d'ouverture, jamais
   qui a écrit la prédiction. */
type SortOrder = 'recent' | 'oldest';
// Plus de tri « par date de révélation » : une prédiction scellée n'a plus de
// date annoncée, ce tri classait donc tout le monde sur le même repère
// technique lointain — un ordre qui n'avait aucun sens pour qui le lisait.
type SortKey = 'default' | 'seal';
type MenuView = 'main' | 'author';

/** Fil d'actualité — une seule liste, coupée en deux zones (voir plus haut). */
export default function HomeScreen() {
  const { username, session, onboarded, markOnboarded, reduceMotion } = useAuth();
  const router = useRouter();
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [feed, setFeed] = useState<PredictionFeedItem[] | null>(null);
  const [authors, setAuthors] = useState<AuthorMap>({});
  // Amis acceptés du viewer — sert uniquement à choisir, parmi plusieurs
  // personnes citées dans un teaser, un nom que le viewer reconnaîtra.
  const [celebration, setCelebration] = useState<{ visible: boolean; message: ReactNode }>({
    visible: false,
    message: '',
  });
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [now, setNow] = useState(() => new Date());
  // « Predict » par défaut, à gauche — c'est ce qu'on veut voir en premier en
  // ouvrant l'app : ce qui reste à découvrir, pas ce qui est déjà joué.

  const [menuOpen, setMenuOpen] = useState(false);
  const [menuView, setMenuView] = useState<MenuView>('main');
  const [authorFilter, setAuthorFilter] = useState<string | null>(null);
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  // Raccourci posé à côté de « Tri » plutôt que dans le menu : retrouver ses
  // propres Predicts scellés est le geste le plus fréquent, il ne mérite pas
  // deux taps de plus.
  const [mineOnly, setMineOnly] = useState(false);
  // Ne garder que ce qui se révèle d'ici sept jours — repérer d'un coup ce qui
  // arrive bientôt, sans avoir à lire chaque compte à rebours.
  // `load` est mémoïsé sur `userId` : lire `feed` dedans y figerait sa valeur
  // du premier rendu. Cette ref dit simplement si le fil a déjà été affiché
  // au moins une fois, ce qui suffit à décider si un échec mérite un message.
  const hasLoadedRef = useRef(false);
  // `'default'` : l'ordre de chaque onglet reste celui déjà établi (À venir
  // par publication, Passées par date de révélation) — un tri par date de
  // scellé ou de révélation est une bascule optionnelle, pas un nouveau défaut.
  const [sortKey, setSortKey] = useState<SortKey>('default');
  const [sortOrder, setSortOrder] = useState<SortOrder>('recent');

  function toggleSortKey(key: 'seal') {
    if (sortKey === key) {
      setSortOrder((o) => (o === 'recent' ? 'oldest' : 'recent'));
    } else {
      setSortKey(key);
      setSortOrder('recent');
    }
  }

  const hasActiveFilters =
    authorFilter !== null || favoritesOnly || mineOnly || sortKey !== 'default';

  function resetFilters() {
    setAuthorFilter(null);
    setFavoritesOnly(false);
    setMineOnly(false);
    setSortKey('default');
    setSortOrder('recent');
  }

  const userId = session?.user.id;

  const load = useCallback(async () => {
    if (!userId) return;

    // Rattrape les notifications de révélation en retard avant de lire le
    // fil — sans ça, une prédiction tout juste révélée pourrait ne pas
    // encore avoir sa notification au premier chargement. Même principe pour
    // les rappels avant révélation (réglage Gestion du temps) : aucun
    // déclencheur ne se lève seul quand l'échéance approche, il faut qu'une
    // requête vienne le constater.
    await Promise.all([
      supabase.rpc('generate_reveal_notifications'),
      supabase.rpc('generate_reveal_reminders'),
      // Et le rappel hebdomadaire adressé à l'auteur d'une prédiction
      // « Libre » toujours scellée : sans date, personne ne l'ouvrira à sa
      // place et rien ne la ferait remonter d'elle-même.
      supabase.rpc('generate_open_reminders'),
    ]);

    const { data, error: fetchError } = await fetchPredictionsFeed();

    if (fetchError) {
      // Un rechargement qui échoue alors que le fil est déjà affiché ne dit
      // rien sur ce qu'on vient de faire : après la création d'un Predict, on
      // revient sur le Fil et il se recharge, et un simple hoquet réseau
      // affichait « Chargement impossible… » juste après un enregistrement
      // pourtant réussi. On ne signale donc l'échec que quand il n'y a
      // vraiment rien à montrer ; sinon on garde le fil précédent à l'écran,
      // le prochain rafraîchissement le remettra à jour.
      if (!hasLoadedRef.current) setError(feedErrorMessage(fetchError));
      return;
    }

    setError(null);
    const items = data ?? [];
    setFeed(items);
    hasLoadedRef.current = true;

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


  // Tient `feed` à jour immédiatement quand une carte bascule favori/masqué —
  // sans ça, les filtres de cet écran resteraient basés sur l'état chargé au
  // départ jusqu'au prochain rafraîchissement complet.


  /** « X masquées — afficher » ne rouvre pas une simple vue temporaire : les
   * démasquer les rend à nouveau visibles pour de bon, comme si on avait
   * retapé l'œil de chacune une par une depuis sa carte. */
  async function handleUnhideAll() {
    if (!userId) return;
    // Tout le Fil, et non plus le seul onglet courant : il n'y a plus
    // d'onglet, et « X masquées » compte désormais les deux zones.
    const hiddenItems = (feed ?? []).filter((item) => item.is_hidden);
    if (hiddenItems.length === 0) return;
    const hiddenIds = new Set(hiddenItems.map((item) => item.id));
    setFeed((prev) => (prev ?? []).map((item) => (hiddenIds.has(item.id) ? { ...item, is_hidden: false } : item)));
    await Promise.all(hiddenItems.map((item) => setPredictionUserState(item.id, userId, { hidden: false })));
  }

  // Une fois l'auteur affirme le verdict de l'une de ses cartes : même
  // synchronisation immédiate que favori/masqué, pour que l'onglet « Mes
  // Predicts » reflète tout de suite le nouveau statut.

  // Posé à l'ouverture de la carte — c'est ce qui fait baisser le compteur du
  // badge d'onglet et retire le surlignage « non lue ».
  function handleMarkSeen(predictionId: string) {
    setFeed((prev) =>
      (prev ?? []).map((item) => (item.id === predictionId ? { ...item, is_seen: true } : item))
    );
    if (userId) setPredictionUserState(predictionId, userId, { seen: true });
  }

  // Les filtres portent sur tout le Fil : ils ne dépendent plus d'un onglet
  // actif, puisqu'il n'y en a plus. Le découpage en zones se fait juste avant
  // l'affichage, une fois filtré et trié.
  const all = feed ?? [];
  const hiddenCount = all.filter((item) => item.is_hidden).length;

  const authorEntries = Array.from(new Set(all.map((item) => item.author_id))).map((id) => ({
    id,
    username: authors[id]?.username ?? '…',
  }));

  const filtered = all
    .filter((item) => !item.is_hidden)
    .filter((item) => !authorFilter || item.author_id === authorFilter)
    .filter((item) => !favoritesOnly || item.is_favorite)
    // Plus de filtre « révélations cette semaine » : aucune prédiction n'a
    // désormais de date annoncée, il n'y a donc rien à prévoir pour la semaine.
    .filter((item) => !mineOnly || item.author_id === userId);

  const shown = [...filtered].sort((a, b) => {
    if (sortKey === 'seal') {
      const diff = new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      return sortOrder === 'recent' ? diff : -diff;
    }
    // Défaut : ordre de publication, le plus récent en tête.
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });

  /* LES QUATRE COMPARTIMENTS DE LA BIBLIOTHÈQUE.

     Le tri et les filtres n'ont pas bougé : c'est le même `shown`, réparti en
     quatre caissons au lieu de deux zones qui défilaient. Les conditions sont
     exclusives et couvrent tout — aucun livre ne peut se retrouver nulle part.

     La séparation est celle de la vie d'une prédiction, pas d'un statut
     technique : ce que les autres gardent au chaud, ce que je garde moi, ce
     qui est sorti, et les questions. */
  const estQuestion = (item: PredictionFeedItem) => item.type === 'question';
  const estDeMoi = (item: PredictionFeedItem) => item.author_id === userId;

  const rayonScellees = shown.filter(
    (item) => !estQuestion(item) && !estDeMoi(item) && !isRevealed(item, now)
  );
  const rayonMiennes = shown.filter(
    (item) => !estQuestion(item) && estDeMoi(item) && !isRevealed(item, now)
  );
  const rayonRevelees = shown.filter((item) => !estQuestion(item) && isRevealed(item, now));
  const rayonSondages = shown.filter(estQuestion);

  /* « Non lu » ne s'applique jamais à ce qu'on a écrit soi-même : on ne
     découvre pas sa propre prédiction, et elle ne notifie que ses
     destinataires — la pastille annoncerait sinon des nouveautés sans rien en
     face dans la liste des notifications. */
  const nonLu = (item: PredictionFeedItem) => !item.is_seen && !estDeMoi(item);
  const nouveautes = shown.filter(nonLu).length;

  /* Une révélation qu'on n'a pas encore décachetée : le seul livre qui réclame
     un geste, et le seul à porter le liseré doré. Condition reprise mot pour
     mot de `cardState.kind === 'to_open'` (PredictionCard) — toute divergence
     donnerait un livre mis en avant qui ne propose rien à faire. */
  const aOuvrir = (item: PredictionFeedItem) =>
    !estQuestion(item) && !estDeMoi(item) && isRevealed(item, now) && !item.is_opened;

  const enLivre = (item: PredictionFeedItem): ShelfBook => ({
    id: item.id,
    authorName: authors[item.author_id]?.username ?? '…',
    authorAvatarUrl: authors[item.author_id]?.avatar_url,
    highlighted: aOuvrir(item),
    unread: nonLu(item),
  });

  function ouvrirLivre(id: string) {
    handleMarkSeen(id);
    router.push(`/prediction/${id}`);
  }

  return (
    <SafeAreaView style={styles.safe}>
      <WelcomeOnboarding visible={onboarded === false} onStart={handleStartFirstPrediction} />

      {/* Réglage Accessibilité « Réduire les animations » : la pluie d'or
          est purement décorative, jamais porteuse d'une information qu'on
          perdrait à la sauter. */}
      <CelebrationBurst
        visible={celebration.visible && !reduceMotion}
        message={celebration.message}
        onFinish={() => setCelebration((c) => ({ ...c, visible: false }))}
      />

      <View style={styles.header}>
        <View style={styles.brandRow}>
          <Text style={styles.brand}>Predict</Text>
          {/* Ce qui est arrivé depuis la dernière visite : les enveloppes
              qu'on n'a pas encore vues, scellées comme à ouvrir. Même pastille
              dorée que la cloche des notifications — c'est le même message,
              « il s'est passé quelque chose », et il n'y a aucune raison qu'il
              se dise de deux façons dans la même app. */}
          {nouveautes > 0 && (
            <View
              style={styles.brandBadge}
              accessibilityLabel={`${nouveautes} nouveauté${nouveautes > 1 ? 's' : ''}`}
            >
              <Text style={styles.brandBadgeText}>{nouveautes > 99 ? '99+' : nouveautes}</Text>
            </View>
          )}
        </View>
        <View style={styles.headerActions}>
          <Pressable style={styles.userChip} onPress={() => router.push('/profile')} hitSlop={4}>
            <Avatar url={userId ? authors[userId]?.avatar_url ?? null : null} username={username ?? ''} size={32} />
            <Text style={styles.userChipName} numberOfLines={1}>
              {username ?? session?.user.email ?? ''}
            </Text>
          </Pressable>
        </View>
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
          <SlidersHorizontal size={17} color={hasActiveFilters ? colors.text : colors.textFaint} strokeWidth={1.75} />
          <Text style={[styles.filtersToggleText, hasActiveFilters && styles.filtersToggleTextActive]}>
            Tri
          </Text>
        </Pressable>

        <Pressable
          onPress={() => setMineOnly((o) => !o)}
          style={[styles.filtersToggle, mineOnly && styles.filtersToggleActive]}
          hitSlop={4}
        >
          <User size={17} color={mineOnly ? colors.text : colors.textFaint} strokeWidth={1.75} />
          <Text style={[styles.filtersToggleText, mineOnly && styles.filtersToggleTextActive]}>
            Mes predicts
          </Text>
        </Pressable>

        {hasActiveFilters && (
          <Pressable onPress={resetFilters} style={styles.filtersReset} hitSlop={4}>
            <XCircle size={17} color={colors.icon} strokeWidth={1.75} />
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
                    <ChevronRight size={19} color={colors.icon} strokeWidth={1.75} />
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
                    onPress={handleUnhideAll}
                    style={hasActiveFilters ? styles.menuRow : styles.menuRowLast}
                  >
                    <Text style={styles.menuRowText}>
                      {`${hiddenCount} masquée${hiddenCount > 1 ? 's' : ''} — afficher`}
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
                  <ChevronLeft size={19} color={colors.text} strokeWidth={1.75} />
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
        ) : (
          <>
            {/* UN SEUL MEUBLE, pas quatre boîtes. La corniche, les montants,
                les tablettes et la plinthe sont dessinés dans `Library` : ce
                sont eux qui font la bibliothèque, pas les caissons.

                Les quatre rayons gardent leur place même vides — une
                bibliothèque dont les étagères se déplacent selon ce qu'on y
                range ne se mémorise pas, et c'est la mémoire du meuble qui
                fait qu'on sait où aller sans lire les plaques. */}
            <Library
              onPressBook={ouvrirLivre}
              bays={[
                {
                  key: 'scellees',
                  label: 'Scellées',
                  books: rayonScellees.map(enLivre),
                  emptyLabel: 'Aucun secret en attente.',
                  onPressMore: () => router.push('/rayon/scellees'),
                },
                {
                  key: 'miennes',
                  label: 'Les miennes',
                  books: rayonMiennes.map(enLivre),
                  emptyLabel: 'Tu ne gardes aucun secret.',
                  onPressMore: () => router.push('/rayon/miennes'),
                },
                {
                  key: 'revelees',
                  label: 'Révélées',
                  books: rayonRevelees.map(enLivre),
                  emptyLabel: "Rien n'est encore sorti.",
                  onPressMore: () => router.push('/rayon/revelees'),
                },
                {
                  key: 'sondages',
                  label: 'Sondages',
                  books: rayonSondages.map(enLivre),
                  emptyLabel: 'Aucune question posée.',
                  onPressMore: () => router.push('/rayon/sondages'),
                },
              ]}
            />
          </>
        )}
      </ScrollView>
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
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 0 },
  brand: {
    fontFamily: fonts.display,
    fontSize: 24,
    color: colors.text,
    flexShrink: 0,
  },
  // Repris trait pour trait de la pastille de la cloche (`standaloneBadge`
  // dans `BottomNavBar`) : même fond, même diamètre, même texte blanc. Deux
  // pastilles qui disent la même chose ne doivent pas se ressembler « à peu
  // près ».
  brandBadge: {
    backgroundColor: colors.notificationBadge,
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandBadgeText: { fontSize: 12, fontWeight: '700', color: '#FFFFFF' },
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
  // Intitulé de zone : discret, aligné à gauche au-dessus des cartes qu'il
  // annonce. Un trait au-dessus le sépare de la zone précédente sans faire
  // barre pleine largeur — ce n'est pas un onglet, il ne se touche pas.
  zoneTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  zoneTitle: { fontFamily: fonts.sansBold, fontSize: 17, color: colors.text },
  zoneCount: { fontFamily: fonts.label, fontSize: 15, color: colors.textFaint },
  // Même badge que la cloche de notifications — rouge plein, texte blanc,
  // taille fixe pour ne pas déplacer l'intitulé.
  zoneBadge: {
    backgroundColor: colors.notificationBadge,
    borderRadius: radius.pill,
    minWidth: 20,
    height: 20,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  zoneBadgeText: { fontSize: 12, fontWeight: '700', color: '#FFFFFF' },
  // Centré sous les cartes de sa zone : c'est la suite de la liste, pas une
  // action de la barre d'outils.
  zoneMore: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
  },
  zoneMoreText: { fontFamily: fonts.sansBold, fontSize: 15, color: colors.text },
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
  filtersToggleText: { fontSize: 15, fontWeight: '700', color: colors.textFaint },
  filtersToggleTextActive: { color: colors.text },
  filtersReset: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  filtersResetText: { fontSize: 15, fontWeight: '600', color: colors.textFaint },
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
  menuRowText: { fontSize: 17, fontWeight: '600', color: colors.textMuted },
  menuRowTextActive: { color: colors.text, fontWeight: '700' },
  menuRowTextReset: { fontSize: 16, fontWeight: '600', color: colors.danger },
  menuRowValue: { fontSize: 14, color: colors.textFaint, flexShrink: 1 },
  menuBack: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  menuBackText: { fontSize: 14, fontWeight: '700', color: colors.text },
  // Marge latérale resserrée : le meuble occupe la pièce, il ne flotte pas au
  // milieu d'une page.
  scroll: { paddingHorizontal: spacing.md, paddingTop: spacing.md, paddingBottom: 88, flexGrow: 1 },
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
}
