import { useFocusEffect, useRouter } from 'expo-router';
import { Settings } from 'lucide-react-native';
import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { Text } from '../../../components/Text';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Avatar } from '../../../components/Avatar';
import { PredictWord } from '../../../components/PredictWord';
import { PrediscoreGauge } from '../../../components/PrediscoreGauge';
import { pickAvatarImage, removeAvatar, uploadAvatar } from '../../../lib/avatar';
import { useAuth } from '../../../lib/auth';
import { formatRevealAt, formatSealedFor } from '../../../lib/datetime';
import { fetchProfileById } from '../../../lib/friends';
import {
  fetchPredictionOutcomes,
  fetchPrediscore,
  isMissingSchema,
  type PredictionOutcome,
  type PredictionOutcomeStatus,
} from '../../../lib/predictions';
import { eyebrow, fonts, radius, spacing, type Colors } from '../../../lib/theme';
import { useColors } from '../../../lib/themeMode';

type Filter = 'total' | 'realized' | 'missed' | 'pending';

const FILTER_LABEL: Record<Filter, string> = {
  total: 'Predict',
  realized: 'Réalisés',
  missed: 'Manqués',
  pending: 'En attente',
};

function statusLabel(status: PredictionOutcomeStatus, isRevealed: boolean): string {
  if (!isRevealed) return 'En cours';
  if (status === 'realized') return 'Réalisée';
  if (status === 'missed') return 'Manquée';
  return 'En attente du verdict';
}

export default function ProfileScreen() {
  const { username, session, signOut } = useAuth();
  const router = useRouter();
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const userId = session?.user.id;

  const [outcomes, setOutcomes] = useState<PredictionOutcome[] | null>(null);
  const [prediscore, setPrediscore] = useState<number | null>(null);
  const [prediscoreLoaded, setPrediscoreLoaded] = useState(false);
  const [prediscoreError, setPrediscoreError] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const [avatarMenuOpen, setAvatarMenuOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('total');

  const load = useCallback(async () => {
    if (!userId) return;

    // Les trois chargements sont indépendants : l'échec de l'un ne doit pas
    // laisser les autres bloqués indéfiniment.
    const { data, error: fetchError } = await fetchPredictionOutcomes(userId);
    if (fetchError) {
      setError(`Chargement impossible : ${fetchError.message}`);
    } else {
      setError(null);
      setOutcomes(data ?? []);
    }

    const { data: prediscoreData, error: prediscoreFetchError } = await fetchPrediscore(userId);
    setPrediscore(prediscoreData.score);
    setPrediscoreError(
      prediscoreFetchError
        ? isMissingSchema(prediscoreFetchError)
          ? 'Prediscore indisponible : exécute le dernier supabase/schema.sql dans le SQL Editor.'
          : `Prediscore indisponible : ${prediscoreFetchError.message}`
        : null
    );
    setPrediscoreLoaded(true);

    const { data: profile } = await fetchProfileById(userId);
    setAvatarUrl(profile?.avatar_url ?? null);
  }, [userId]);

  async function handlePickAvatar() {
    if (!userId) return;
    setAvatarError(null);
    const { uri, error: pickError } = await pickAvatarImage();
    if (pickError) {
      setAvatarError(pickError.message);
      return;
    }
    if (!uri) return;

    setUploadingAvatar(true);
    try {
      const { url, error: uploadError } = await uploadAvatar(userId, uri);
      if (uploadError) {
        setAvatarError(`Envoi impossible : ${uploadError.message}`);
        return;
      }
      setAvatarUrl(url);
    } finally {
      setUploadingAvatar(false);
    }
  }

  async function handleRemoveAvatar() {
    if (!userId) return;
    setAvatarError(null);
    setUploadingAvatar(true);
    try {
      const { error: removeError } = await removeAvatar(userId);
      if (removeError) {
        setAvatarError(`Suppression impossible : ${removeError.message}`);
        return;
      }
      setAvatarUrl(null);
    } finally {
      setUploadingAvatar(false);
    }
  }

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const realized = (outcomes ?? []).filter((o) => o.final_status === 'realized');
  const missed = (outcomes ?? []).filter((o) => o.final_status === 'missed');
  const pending = (outcomes ?? []).filter((o) => o.final_status === 'pending');
  const total = outcomes ?? [];
  /* « Sans verdict » et « encore scellée » ne sont pas la même chose : une
     prédiction ouverte dont l'auteur n'a pas encore dit si elle s'est réalisée
     est en attente, mais elle n'est plus scellée. La quatrième carte porte
     donc « En attente », qui est ce qu'elle compte réellement, et le nombre
     d'enveloppes encore fermées se lit à part — c'est un chiffre d'ambiance
     (« je garde quatre secrets »), pas un filtre de plus. */
  const stillSealed = (outcomes ?? []).filter((o) => !o.is_revealed).length;
  const sealedLabel =
    stillSealed === 0
      ? null
      : stillSealed === 1
        ? '1 enveloppe encore scellée'
        : `${stillSealed} enveloppes encore scellées`;

  const filtered =
    filter === 'realized' ? realized : filter === 'missed' ? missed : filter === 'pending' ? pending : total;

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Text style={styles.brand}>Profil</Text>
        <Pressable onPress={() => router.push('/settings')} hitSlop={8}>
          <Settings size={22} color={colors.icon} strokeWidth={1.75} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.identityCard}>
          <Pressable onPress={() => setAvatarMenuOpen(true)} disabled={uploadingAvatar} style={styles.avatarWrap}>
            <Avatar url={avatarUrl} username={username} size={84} />
            {uploadingAvatar ? (
              <ActivityIndicator size="small" color={colors.text} style={styles.avatarEditLoader} />
            ) : (
              <Text style={styles.avatarEditText}>Modifier</Text>
            )}
          </Pressable>
          {avatarError && <Text style={styles.error}>{avatarError}</Text>}

          <Text style={[styles.eyebrow, styles.sectionSpacing]}>Nom d’utilisateur</Text>
          <Text style={styles.username}>{username ?? '…'}</Text>
          <Text style={styles.email}>{session?.user.email ?? ''}</Text>
        </View>

        <Modal
          visible={avatarMenuOpen}
          transparent
          animationType="fade"
          onRequestClose={() => setAvatarMenuOpen(false)}
        >
          <Pressable style={styles.modalOverlay} onPress={() => setAvatarMenuOpen(false)}>
            <View style={styles.avatarMenu}>
              <Pressable
                onPress={() => {
                  setAvatarMenuOpen(false);
                  handlePickAvatar();
                }}
                style={styles.avatarMenuItem}
              >
                <Text style={styles.avatarMenuItemText}>Choisir une nouvelle photo</Text>
              </Pressable>
              {avatarUrl && (
                <Pressable
                  onPress={() => {
                    setAvatarMenuOpen(false);
                    handleRemoveAvatar();
                  }}
                  style={styles.avatarMenuItem}
                >
                  <Text style={[styles.avatarMenuItemText, styles.avatarMenuItemDanger]}>
                    Supprimer la photo
                  </Text>
                </Pressable>
              )}
              <Pressable onPress={() => setAvatarMenuOpen(false)} style={styles.avatarMenuItemLast}>
                <Text style={styles.avatarMenuItemText}>Annuler</Text>
              </Pressable>
            </View>
          </Pressable>
        </Modal>

        {/* La barre de Prediscore vient directement sous les infos du profil,
            à 50% de la largeur — plus de carte séparée autour, elle fait
            partie du bloc d'identité. */}
        <View style={[styles.prediscoreWrap, styles.sectionSpacing]}>
          {!prediscoreLoaded ? (
            <ActivityIndicator color={colors.text} style={styles.loader} />
          ) : prediscoreError ? (
            <Text style={styles.error}>{prediscoreError}</Text>
          ) : (
            <PrediscoreGauge score={prediscore} />
          )}
          {sealedLabel && <Text style={styles.sealedCount}>{sealedLabel}</Text>}
        </View>

        {error && <Text style={styles.error}>{error}</Text>}

        {outcomes === null && !error ? (
          <ActivityIndicator color={colors.text} style={styles.loader} />
        ) : (
          <>
            <View style={styles.statsRow}>
              <Pressable
                onPress={() => setFilter('total')}
                style={[styles.statCard, filter === 'total' && styles.statCardActive]}
              >
                <Text style={styles.statValue}>{total.length}</Text>
                <Text style={styles.statLabel}>
                  <PredictWord />
                </Text>
              </Pressable>
              <Pressable
                onPress={() => setFilter('realized')}
                style={[styles.statCard, filter === 'realized' && styles.statCardActive]}
              >
                <Text style={styles.statValue}>{realized.length}</Text>
                <Text style={styles.statLabel}>Réalisés</Text>
              </Pressable>
              <Pressable
                onPress={() => setFilter('missed')}
                style={[styles.statCard, filter === 'missed' && styles.statCardActive]}
              >
                <Text style={styles.statValue}>{missed.length}</Text>
                <Text style={styles.statLabel}>Manqués</Text>
              </Pressable>
              <Pressable
                onPress={() => setFilter('pending')}
                style={[styles.statCard, filter === 'pending' && styles.statCardActive]}
              >
                <Text style={styles.statValue}>{pending.length}</Text>
                <Text style={styles.statLabel}>En attente</Text>
              </Pressable>
            </View>

            <Pressable onPress={signOut} style={styles.signOut}>
              <Text style={styles.signOutText}>Se déconnecter</Text>
            </Pressable>

            <Text style={[styles.eyebrow, styles.sectionSpacing]}>
              {filter === 'total' ? <PredictWord /> : FILTER_LABEL[filter]}
            </Text>
            {filtered.length === 0 ? (
              <Text style={styles.hint}>Rien ici pour l’instant.</Text>
            ) : (
              filtered.map((item) => (
                <Pressable
                  key={item.prediction_id}
                  onPress={() => router.push(`/prediction/${item.prediction_id}`)}
                  style={styles.historyRow}
                >
                  <Text style={styles.historyTeaser} numberOfLines={2}>
                    {item.teaser}
                  </Text>
                  {/* La date n'est affichée QUE si la prédiction est ouverte :
                      tant qu'elle est scellée, `reveal_at` ne porte que le
                      repère technique lointain, et on lirait « le 19 août
                      2031 ». On donne son âge à la place. */}
                  <Text style={styles.historyMeta}>
                    {statusLabel(item.final_status, item.is_revealed)} ·{' '}
                    {item.is_revealed
                      ? formatRevealAt(new Date(item.reveal_at))
                      : `scellé depuis ${formatSealedFor(item.created_at, new Date())}`}
                  </Text>
                </Pressable>
              ))
            )}
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
    paddingTop: 14,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  scroll: { padding: spacing.lg, paddingBottom: 40 },
  eyebrow: { ...eyebrow(colors) },
  sectionSpacing: { marginTop: spacing.xl },
  brand: {
    fontFamily: fonts.display,
    fontSize: 24,
    color: colors.text,
  },
  identityCard: {
    marginTop: spacing.lg,
    padding: 18,
    borderRadius: radius.xl,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
  avatarWrap: { alignItems: 'center' },
  avatarEditLoader: { marginTop: 8 },
  avatarEditText: {
    fontFamily: fonts.sansBold,
    color: colors.text,
    fontSize: 14,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginTop: 8,
  },
  username: { fontFamily: fonts.bodyEmphasis, fontSize: 26, color: colors.text, marginTop: 6 },
  email: { fontSize: 16, color: colors.textFaint, marginTop: 4 },
  loader: { marginTop: 24 },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
  },
  avatarMenu: {
    width: '100%',
    maxWidth: 320,
    borderRadius: radius.xl,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  avatarMenuItem: {
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    alignItems: 'center',
  },
  avatarMenuItemLast: { paddingVertical: 16, paddingHorizontal: 20, alignItems: 'center' },
  avatarMenuItemText: { fontSize: 15, fontWeight: '600', color: colors.text },
  avatarMenuItemDanger: { color: colors.danger },
  prediscoreWrap: { width: '50%', minWidth: 180, alignSelf: 'center' },
  sealedCount: { fontSize: 14, color: colors.textMuted, textAlign: 'center', marginTop: 8 },
  statsRow: { flexDirection: 'row', gap: 8, marginTop: spacing.lg },
  statCard: {
    flex: 1,
    paddingVertical: 16,
    borderRadius: radius.xl,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
  // Filtre actif : trait noir plus marqué sous la carte, pas de couleur.
  statCardActive: { borderBottomWidth: 3, borderBottomColor: colors.text },
  // Pas de code couleur réalisé/manqué : seul le libellé sous le nombre
  // porte le sens, conformément à la palette stricte noir/blanc/jaune.
  statValue: { fontFamily: fonts.body, fontSize: 32, color: colors.text },
  statLabel: {
    fontSize: 14,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: colors.textFaint,
    marginTop: 4,
  },
  signOut: {
    marginTop: spacing.lg,
    paddingVertical: 15,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
  signOutText: { fontSize: 14, fontWeight: '600', color: colors.textMuted },
  hint: { fontSize: 14, color: colors.textFaint, marginTop: 8 },
  historyRow: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  historyTeaser: { fontFamily: fonts.body, fontSize: 19, color: colors.text },
  historyMeta: { fontSize: 15, color: colors.textFaint, marginTop: 4 },
  error: {
    color: colors.danger,
    backgroundColor: colors.dangerSoft,
    borderRadius: radius.sm,
    padding: 12,
    fontSize: 14,
    marginTop: spacing.md,
  },
  });
}
