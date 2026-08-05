import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
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
import { CreateFab } from '../../../components/CreateFab';
import { PredictWord } from '../../../components/PredictWord';
import { PrediscoreGauge } from '../../../components/PrediscoreGauge';
import { pickAvatarImage, removeAvatar, uploadAvatar } from '../../../lib/avatar';
import { useAuth } from '../../../lib/auth';
import { formatRevealAt } from '../../../lib/datetime';
import { fetchProfileById } from '../../../lib/friends';
import {
  fetchPredictionOutcomes,
  fetchPrediscore,
  isMissingSchema,
  type PredictionOutcome,
  type PredictionOutcomeStatus,
} from '../../../lib/predictions';
import { colors, eyebrow, fonts, radius, spacing } from '../../../lib/theme';

type Filter = 'total' | 'realized' | 'missed' | 'pending';

const FILTER_LABEL: Record<Filter, string> = {
  total: 'Predict',
  realized: 'Réalisés',
  missed: 'Manqués',
  pending: 'En cours',
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

  const filtered =
    filter === 'realized' ? realized : filter === 'missed' ? missed : filter === 'pending' ? pending : total;

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Text style={styles.brand}>Profil</Text>
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

        <View style={[styles.prediscoreCard, styles.sectionSpacing]}>
          {!prediscoreLoaded ? (
            <ActivityIndicator color={colors.text} style={styles.loader} />
          ) : prediscoreError ? (
            <Text style={styles.error}>{prediscoreError}</Text>
          ) : (
            <PrediscoreGauge score={prediscore} />
          )}
        </View>

        <Text style={[styles.eyebrow, styles.sectionSpacing]}>
          <PredictWord />
        </Text>

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
                <Text style={styles.statLabel}>En cours</Text>
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
                  <Text style={styles.historyMeta}>
                    {statusLabel(item.final_status, item.is_revealed)} ·{' '}
                    {formatRevealAt(new Date(item.reveal_at))}
                  </Text>
                </Pressable>
              ))
            )}
          </>
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
    paddingTop: 14,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  scroll: { padding: spacing.lg, paddingBottom: 40 },
  eyebrow: { ...eyebrow },
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
    color: colors.text,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    textDecorationLine: 'underline',
    marginTop: 8,
  },
  username: { fontFamily: fonts.serifItalic, fontSize: 22, color: colors.text, marginTop: 6 },
  email: { fontSize: 13, color: colors.textFaint, marginTop: 4 },
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
  prediscoreCard: {
    paddingVertical: 24,
    borderRadius: radius.xl,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
  statsRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
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
  statValue: { fontFamily: fonts.display, fontSize: 26, color: colors.text },
  statLabel: {
    fontSize: 10,
    fontWeight: '700',
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
  historyTeaser: { fontFamily: fonts.sansBold, fontSize: 17, color: colors.text },
  historyMeta: { fontSize: 12, color: colors.textFaint, marginTop: 4 },
  error: {
    color: colors.danger,
    backgroundColor: colors.dangerSoft,
    borderRadius: radius.sm,
    padding: 12,
    fontSize: 14,
    marginTop: spacing.md,
  },
});
