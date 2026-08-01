import type { PostgrestError } from '@supabase/supabase-js';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '../../../lib/auth';
import {
  acceptFriendRequest,
  fetchFriendships,
  friendshipErrorMessage,
  isMissingTable,
  otherProfile,
  removeFriendship,
  searchProfilesByUsername,
  sendFriendRequest,
  type Friendship,
  type FriendProfile,
} from '../../../lib/friends';
import { colors, eyebrow, fonts, radius, spacing } from '../../../lib/theme';

type Relation =
  | { kind: 'none' }
  | { kind: 'accepted'; friendshipId: string }
  | { kind: 'incoming'; friendshipId: string }
  | { kind: 'outgoing'; friendshipId: string };

export default function CircleScreen() {
  const { session } = useAuth();
  const userId = session?.user.id;

  const [friendships, setFriendships] = useState<Friendship[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<FriendProfile[] | null>(null);
  const [searching, setSearching] = useState(false);

  const [pendingActionId, setPendingActionId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!userId) return;
    const { data, error } = await fetchFriendships(userId);
    if (error) {
      setLoadError(
        isMissingTable(error)
          ? 'Table `friendships` introuvable. Exécute supabase/schema.sql dans le SQL Editor.'
          : friendshipErrorMessage(error)
      );
      return;
    }
    setLoadError(null);
    setFriendships(data ?? []);
  }, [userId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  // Recherche différée : on évite un aller-retour réseau à chaque frappe.
  useEffect(() => {
    if (!userId) return;
    const trimmed = query.trim();
    if (!trimmed) {
      setResults(null);
      return;
    }
    setSearching(true);
    const timer = setTimeout(async () => {
      const { data } = await searchProfilesByUsername(trimmed, userId);
      setResults(data ?? []);
      setSearching(false);
    }, 300);
    return () => clearTimeout(timer);
  }, [query, userId]);

  const accepted = (friendships ?? []).filter((f) => f.status === 'accepted');
  const incoming = (friendships ?? []).filter(
    (f) => f.status === 'pending' && f.addressee_id === userId
  );
  const outgoing = (friendships ?? []).filter(
    (f) => f.status === 'pending' && f.requester_id === userId
  );

  function relationFor(profileId: string): Relation {
    const match = (friendships ?? []).find(
      (f) => f.requester_id === profileId || f.addressee_id === profileId
    );
    if (!match) return { kind: 'none' };
    if (match.status === 'accepted') return { kind: 'accepted', friendshipId: match.id };
    if (match.addressee_id === userId) return { kind: 'incoming', friendshipId: match.id };
    return { kind: 'outgoing', friendshipId: match.id };
  }

  async function runAction(
    id: string,
    action: () => Promise<{ error: PostgrestError | null }>
  ) {
    setActionError(null);
    setPendingActionId(id);
    try {
      const { error } = await action();
      if (error) {
        setActionError(friendshipErrorMessage(error));
        return;
      }
      await load();
    } finally {
      setPendingActionId(null);
    }
  }

  async function handleAdd(profileId: string) {
    if (!userId) return;
    await runAction(profileId, () => sendFriendRequest(userId, profileId));
  }

  async function handleAccept(friendshipId: string) {
    await runAction(friendshipId, () => acceptFriendRequest(friendshipId));
  }

  async function handleRemove(friendshipId: string) {
    await runAction(friendshipId, () => removeFriendship(friendshipId));
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Text style={styles.eyebrow}>Cercle</Text>
        <Text style={styles.headerTitle}>Le Cercle</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <Text style={styles.eyebrow}>Ajouter quelqu’un</Text>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Chercher un pseudo"
          autoCapitalize="none"
          autoCorrect={false}
          style={styles.input}
        />

        {searching && <ActivityIndicator style={styles.searchLoader} color={colors.gold} />}

        {results && results.length === 0 && !searching && (
          <Text style={styles.muted}>Aucun pseudo ne correspond.</Text>
        )}

        {results && results.length > 0 && (
          <View style={styles.resultsBox}>
            {results.map((profile) => {
              const relation = relationFor(profile.id);
              return (
                <View key={profile.id} style={styles.row}>
                  <Text style={styles.username}>{profile.username}</Text>
                  {relation.kind === 'none' && (
                    <Pressable
                      onPress={() => handleAdd(profile.id)}
                      disabled={pendingActionId === profile.id}
                      style={styles.pillGold}
                    >
                      <Text style={styles.pillGoldText}>
                        {pendingActionId === profile.id ? '…' : 'Ajouter'}
                      </Text>
                    </Pressable>
                  )}
                  {relation.kind === 'accepted' && <Text style={styles.muted}>Déjà ami</Text>}
                  {relation.kind === 'outgoing' && <Text style={styles.muted}>Demande envoyée</Text>}
                  {relation.kind === 'incoming' && <Text style={styles.muted}>T’a demandé</Text>}
                </View>
              );
            })}
          </View>
        )}

        {actionError && <Text style={styles.error}>{actionError}</Text>}
        {loadError && <Text style={styles.error}>{loadError}</Text>}

        {incoming.length > 0 && (
          <>
            <Text style={[styles.eyebrow, styles.sectionLabel]}>Demandes reçues</Text>
            {incoming.map((f) => {
              const profile = otherProfile(f, userId!);
              return (
                <View key={f.id} style={styles.row}>
                  <Text style={styles.username}>{profile.username}</Text>
                  <View style={styles.actions}>
                    <Pressable
                      onPress={() => handleAccept(f.id)}
                      disabled={pendingActionId === f.id}
                      style={styles.pillGold}
                    >
                      <Text style={styles.pillGoldText}>Accepter</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => handleRemove(f.id)}
                      disabled={pendingActionId === f.id}
                      style={styles.pillOutline}
                    >
                      <Text style={styles.pillOutlineText}>Refuser</Text>
                    </Pressable>
                  </View>
                </View>
              );
            })}
          </>
        )}

        {outgoing.length > 0 && (
          <>
            <Text style={[styles.eyebrow, styles.sectionLabel]}>Demandes envoyées</Text>
            {outgoing.map((f) => {
              const profile = otherProfile(f, userId!);
              return (
                <View key={f.id} style={styles.row}>
                  <Text style={styles.username}>{profile.username}</Text>
                  <Pressable
                    onPress={() => handleRemove(f.id)}
                    disabled={pendingActionId === f.id}
                    style={styles.pillOutline}
                  >
                    <Text style={styles.pillOutlineText}>Annuler</Text>
                  </Pressable>
                </View>
              );
            })}
          </>
        )}

        <Text style={[styles.eyebrow, styles.sectionLabel]}>
          Mes amis {accepted.length > 0 ? `(${accepted.length})` : ''}
        </Text>
        {friendships === null && !loadError ? (
          <ActivityIndicator style={styles.searchLoader} color={colors.gold} />
        ) : accepted.length === 0 ? (
          <Text style={styles.muted}>
            Pas encore d’ami. Cherche un pseudo ci-dessus pour envoyer une demande.
          </Text>
        ) : (
          accepted.map((f) => {
            const profile = otherProfile(f, userId!);
            return (
              <View key={f.id} style={styles.row}>
                <Text style={styles.username}>{profile.username}</Text>
                <Pressable
                  onPress={() => handleRemove(f.id)}
                  disabled={pendingActionId === f.id}
                  style={styles.pillOutline}
                >
                  <Text style={styles.pillOutlineText}>Retirer</Text>
                </Pressable>
              </View>
            );
          })
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
  headerTitle: { fontFamily: fonts.serifItalic, fontSize: 26, color: colors.text },
  scroll: { padding: spacing.lg, paddingBottom: 48 },
  sectionLabel: { marginTop: spacing.lg, marginBottom: 8 },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: colors.text,
    backgroundColor: colors.surface,
  },
  searchLoader: { marginTop: spacing.md },
  muted: { fontSize: 14, color: colors.textFaint, marginTop: spacing.sm, lineHeight: 20 },
  resultsBox: { marginTop: spacing.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  username: { fontSize: 15, color: colors.text, fontWeight: '600' },
  actions: { flexDirection: 'row', gap: 8 },
  pillGold: {
    backgroundColor: colors.gold,
    borderRadius: radius.pill,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  pillGoldText: { color: colors.text, fontSize: 13, fontWeight: '700' },
  pillOutline: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  pillOutlineText: { color: colors.textMuted, fontSize: 13, fontWeight: '600' },
  error: {
    color: colors.danger,
    backgroundColor: colors.dangerSoft,
    borderRadius: radius.sm,
    padding: 12,
    fontSize: 14,
    marginTop: spacing.md,
  },
});
