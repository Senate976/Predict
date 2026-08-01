import type { PostgrestError } from '@supabase/supabase-js';
import { useFocusEffect, useRouter } from 'expo-router';
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

import { Avatar } from '../../../components/Avatar';
import { PrestigeBadge } from '../../../components/PrestigeBadge';
import { QuickCreateButton } from '../../../components/QuickCreateButton';
import { useAuth } from '../../../lib/auth';
import { fetchRealizedCount30d } from '../../../lib/badges';
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
import {
  addGroupMember,
  createGroup,
  deleteGroup,
  fetchGroupMembers,
  fetchGroups,
  groupErrorMessage,
  removeGroupMember,
  MAX_GROUP_NAME_LENGTH,
  type FriendGroup,
  type GroupMember,
} from '../../../lib/groups';
import { colors, eyebrow, fonts, radius, spacing } from '../../../lib/theme';

type Relation =
  | { kind: 'none' }
  | { kind: 'accepted'; friendshipId: string }
  | { kind: 'incoming'; friendshipId: string }
  | { kind: 'outgoing'; friendshipId: string };

export default function CircleScreen() {
  const { session } = useAuth();
  const router = useRouter();
  const userId = session?.user.id;

  const [friendships, setFriendships] = useState<Friendship[] | null>(null);
  const [friendBadges, setFriendBadges] = useState<Record<string, number>>({});
  const [loadError, setLoadError] = useState<string | null>(null);

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<FriendProfile[] | null>(null);
  const [searching, setSearching] = useState(false);

  const [pendingActionId, setPendingActionId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const [groups, setGroups] = useState<FriendGroup[] | null>(null);
  const [newGroupName, setNewGroupName] = useState('');
  const [creatingGroup, setCreatingGroup] = useState(false);
  const [groupError, setGroupError] = useState<string | null>(null);
  const [expandedGroupId, setExpandedGroupId] = useState<string | null>(null);
  const [groupMembers, setGroupMembers] = useState<Record<string, GroupMember[]>>({});
  const [pendingGroupActionId, setPendingGroupActionId] = useState<string | null>(null);

  const loadGroups = useCallback(async () => {
    if (!userId) return;
    const { data } = await fetchGroups(userId);
    setGroups(data ?? []);
  }, [userId]);

  async function loadGroupMembers(groupId: string) {
    const { data } = await fetchGroupMembers(groupId);
    setGroupMembers((prev) => ({ ...prev, [groupId]: data ?? [] }));
  }

  async function handleToggleExpand(groupId: string) {
    const next = expandedGroupId === groupId ? null : groupId;
    setExpandedGroupId(next);
    if (next && !groupMembers[next]) {
      await loadGroupMembers(next);
    }
  }

  async function handleCreateGroup() {
    if (!userId) return;
    const trimmed = newGroupName.trim();
    if (!trimmed) return;
    setGroupError(null);
    setCreatingGroup(true);
    try {
      const { data, error } = await createGroup(userId, trimmed);
      if (error) {
        setGroupError(groupErrorMessage(error));
        return;
      }
      if (data) setGroups((prev) => [...(prev ?? []), data]);
      setNewGroupName('');
    } finally {
      setCreatingGroup(false);
    }
  }

  async function handleDeleteGroup(groupId: string) {
    setGroupError(null);
    setPendingGroupActionId(groupId);
    try {
      const { error } = await deleteGroup(groupId);
      if (error) {
        setGroupError(groupErrorMessage(error));
        return;
      }
      setGroups((prev) => (prev ?? []).filter((g) => g.id !== groupId));
      if (expandedGroupId === groupId) setExpandedGroupId(null);
    } finally {
      setPendingGroupActionId(null);
    }
  }

  async function handleToggleMember(groupId: string, friendId: string, isMember: boolean) {
    setGroupError(null);
    setPendingGroupActionId(`${groupId}:${friendId}`);
    try {
      const { error } = isMember
        ? await removeGroupMember(groupId, friendId)
        : await addGroupMember(groupId, friendId);
      if (error) {
        setGroupError(groupErrorMessage(error));
        return;
      }
      await loadGroupMembers(groupId);
    } finally {
      setPendingGroupActionId(null);
    }
  }

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
    const list = data ?? [];
    setFriendships(list);

    const acceptedIds = list
      .filter((f) => f.status === 'accepted')
      .map((f) => otherProfile(f, userId).id);
    const entries = await Promise.all(
      acceptedIds.map(async (id) => {
        const { data: count } = await fetchRealizedCount30d(id);
        return [id, typeof count === 'number' ? count : 0] as const;
      })
    );
    setFriendBadges(Object.fromEntries(entries));
  }, [userId]);

  useFocusEffect(
    useCallback(() => {
      load();
      loadGroups();
    }, [load, loadGroups])
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
        <Text style={styles.headerTitle}>Le Cercle</Text>
        <QuickCreateButton />
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
                <Pressable
                  onPress={() => router.push(`/profile/${profile.id}`)}
                  style={styles.usernameRow}
                >
                  <Avatar url={profile.avatar_url} username={profile.username} size={28} />
                  <PrestigeBadge count={friendBadges[profile.id] ?? 0} size="small" />
                  <Text style={styles.username}>{profile.username}</Text>
                </Pressable>
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

        <Text style={[styles.eyebrow, styles.sectionLabel]}>
          Mes groupes {groups && groups.length > 0 ? `(${groups.length})` : ''}
        </Text>
        <Text style={styles.muted}>
          Regroupe certains amis sous un nom (« Les Intimes »…) pour les cibler
          d’un coup à la création d’une prédiction.
        </Text>

        <View style={styles.newGroupRow}>
          <TextInput
            value={newGroupName}
            onChangeText={setNewGroupName}
            placeholder="Nom du groupe"
            maxLength={MAX_GROUP_NAME_LENGTH}
            editable={!creatingGroup}
            style={[styles.input, styles.newGroupInput]}
          />
          <Pressable
            onPress={handleCreateGroup}
            disabled={creatingGroup || !newGroupName.trim()}
            style={styles.pillGold}
          >
            <Text style={styles.pillGoldText}>{creatingGroup ? '…' : 'Créer'}</Text>
          </Pressable>
        </View>

        {groupError && <Text style={styles.error}>{groupError}</Text>}

        {groups === null ? (
          <ActivityIndicator style={styles.searchLoader} color={colors.gold} />
        ) : groups.length === 0 ? (
          <Text style={styles.muted}>Aucun groupe pour l’instant.</Text>
        ) : (
          groups.map((group) => {
            const expanded = expandedGroupId === group.id;
            const members = groupMembers[group.id];
            const memberIds = new Set((members ?? []).map((m) => m.friend_id));
            return (
              <View key={group.id} style={styles.groupBox}>
                <Pressable onPress={() => handleToggleExpand(group.id)} style={styles.groupHeader}>
                  <Text style={styles.username}>
                    {group.name} {members ? `(${members.length})` : ''}
                  </Text>
                  <Text style={styles.groupChevron}>{expanded ? '▲' : '▼'}</Text>
                </Pressable>

                {expanded && (
                  <View style={styles.groupBody}>
                    {accepted.length === 0 ? (
                      <Text style={styles.muted}>
                        Pas encore d’ami accepté à ajouter à ce groupe.
                      </Text>
                    ) : (
                      accepted.map((f) => {
                        const profile = otherProfile(f, userId!);
                        const isMember = memberIds.has(profile.id);
                        const pending = pendingGroupActionId === `${group.id}:${profile.id}`;
                        return (
                          <View key={profile.id} style={styles.row}>
                            <Text style={styles.username}>{profile.username}</Text>
                            <Pressable
                              onPress={() => handleToggleMember(group.id, profile.id, isMember)}
                              disabled={pending}
                              style={isMember ? styles.pillGold : styles.pillOutline}
                            >
                              <Text style={isMember ? styles.pillGoldText : styles.pillOutlineText}>
                                {pending ? '…' : isMember ? 'Dans le groupe' : 'Ajouter'}
                              </Text>
                            </Pressable>
                          </View>
                        );
                      })
                    )}
                    <Pressable
                      onPress={() => handleDeleteGroup(group.id)}
                      disabled={pendingGroupActionId === group.id}
                      style={styles.deleteGroup}
                    >
                      <Text style={styles.deleteGroupText}>Supprimer ce groupe</Text>
                    </Pressable>
                  </View>
                )}
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
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
  usernameRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
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
  newGroupRow: { flexDirection: 'row', gap: 8, marginTop: spacing.md },
  newGroupInput: { flex: 1 },
  groupBox: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    marginTop: spacing.sm,
    overflow: 'hidden',
  },
  groupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  groupChevron: { fontSize: 11, color: colors.textFaint },
  groupBody: {
    paddingHorizontal: 14,
    paddingBottom: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  deleteGroup: { marginTop: 10, alignSelf: 'flex-start' },
  deleteGroupText: { fontSize: 12, color: colors.danger, fontWeight: '600' },
});
