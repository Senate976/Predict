import type { PostgrestError } from '@supabase/supabase-js';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { Text } from '../../../components/Text';
import { TextInput } from '../../../components/TextInput';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Avatar } from '../../../components/Avatar';
import { CreateFab } from '../../../components/CreateFab';
import { PredictWatermark } from '../../../components/PredictWatermark';
import { useAuth } from '../../../lib/auth';
import {
  acceptFriendRequest,
  fetchFriendships,
  friendshipErrorMessage,
  isMissingTable,
  otherProfile,
  removeFriendship,
  searchProfiles,
  sendFriendRequest,
  type Friendship,
  type FriendProfile,
} from '../../../lib/friends';
import {
  addGroupMember,
  createGroup,
  declineGroupInvite,
  deleteGroup,
  fetchGroupMembers,
  fetchGroupPrediscore,
  fetchGroups,
  groupErrorMessage,
  removeGroupMember,
  MAX_GROUP_NAME_LENGTH,
  type FriendGroup,
  type GroupMember,
  type GroupVisibility,
} from '../../../lib/groups';
import { colors, eyebrow, fonts, radius, spacing } from '../../../lib/theme';

/**
 * `Alert.alert` de React Native Web ne fait rien (implémentation vide) — sans
 * ce repli, le bouton semble ne pas répondre du tout sur le web (déjà
 * rencontré pour la suppression d'une prédiction, cf. PredictionCard.tsx).
 */
function confirmAndRun(title: string, message: string, run: () => void) {
  if (Platform.OS === 'web') {
    if (window.confirm(`${title}\n\n${message}`)) run();
    return;
  }
  Alert.alert(title, message, [
    { text: 'Annuler', style: 'cancel' },
    { text: 'Confirmer', style: 'destructive', onPress: run },
  ]);
}

type Relation =
  | { kind: 'none' }
  | { kind: 'accepted'; friendshipId: string }
  | { kind: 'incoming'; friendshipId: string }
  | { kind: 'outgoing'; friendshipId: string };

type Tab = 'friends' | 'groups';

export default function CircleScreen() {
  const { session } = useAuth();
  const router = useRouter();
  const userId = session?.user.id;

  const [tab, setTab] = useState<Tab>('friends');
  const [friendships, setFriendships] = useState<Friendship[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<FriendProfile[] | null>(null);
  const [searching, setSearching] = useState(false);

  const [pendingActionId, setPendingActionId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const [groups, setGroups] = useState<FriendGroup[] | null>(null);
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupVisibility, setNewGroupVisibility] = useState<GroupVisibility>('private');
  const [creatingGroup, setCreatingGroup] = useState(false);
  const [groupError, setGroupError] = useState<string | null>(null);
  const [expandedGroupId, setExpandedGroupId] = useState<string | null>(null);
  const [groupMembers, setGroupMembers] = useState<Record<string, GroupMember[]>>({});
  // Clé `${groupId}:${friendId}` — Prediscore de ce membre restreint aux
  // prédictions de ce groupe précis (distinct du Prediscore global du profil).
  const [groupPrediscores, setGroupPrediscores] = useState<Record<string, number | null>>({});
  const [pendingGroupActionId, setPendingGroupActionId] = useState<string | null>(null);

  const loadGroups = useCallback(async () => {
    if (!userId) return;
    const { data } = await fetchGroups(userId);
    setGroups(data ?? []);
  }, [userId]);

  async function loadGroupMembers(groupId: string) {
    const { data } = await fetchGroupMembers(groupId);
    const members = data ?? [];
    setGroupMembers((prev) => ({ ...prev, [groupId]: members }));

    // Un Prediscore par membre déjà accepté (en attente, il n'a encore rien
    // pu prédire dans ce groupe) — chargés en parallèle, indépendants les uns
    // des autres.
    const accepted = members.filter((m) => m.status === 'accepted');
    const scores = await Promise.all(
      accepted.map(async (m) => [m.friend_id, (await fetchGroupPrediscore(groupId, m.friend_id)).score] as const)
    );
    setGroupPrediscores((prev) => {
      const next = { ...prev };
      for (const [friendId, score] of scores) {
        next[`${groupId}:${friendId}`] = score;
      }
      return next;
    });
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
      const { data, error } = await createGroup(userId, trimmed, newGroupVisibility);
      if (error) {
        setGroupError(groupErrorMessage(error));
        return;
      }
      if (data) setGroups((prev) => [...(prev ?? []), data]);
      setNewGroupName('');
      setNewGroupVisibility('private');
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

  /** Quitter un groupe rejoint (pas le sien) — supprime sa propre ligne `group_members`. */
  async function handleLeaveGroup(groupId: string) {
    if (!userId) return;
    setGroupError(null);
    setPendingGroupActionId(groupId);
    try {
      const { error } = await declineGroupInvite(groupId, userId);
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

/** `undefined` : pas encore invité — le clic invite. Sinon, le clic retire l'invité ou le membre. */
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
    setFriendships(data ?? []);
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
      const { data } = await searchProfiles(trimmed, userId);
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
      <PredictWatermark opacity={0.05} />

      <View style={styles.header}>
        <Text style={styles.headerTitle}>Cercle</Text>
      </View>

      <View style={styles.tabs}>
        <Pressable
          onPress={() => setTab('friends')}
          style={[styles.tab, tab === 'friends' && styles.tabActive]}
        >
          <Text style={[styles.tabText, tab === 'friends' && styles.tabTextActive]}>Amis</Text>
        </Pressable>
        <Pressable
          onPress={() => setTab('groups')}
          style={[styles.tab, tab === 'groups' && styles.tabActive]}
        >
          <Text style={[styles.tabText, tab === 'groups' && styles.tabTextActive]}>Groupes</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        {actionError && <Text style={styles.error}>{actionError}</Text>}
        {loadError && <Text style={styles.error}>{loadError}</Text>}

        {tab === 'friends' ? (
          <>
            <Text style={styles.eyebrow}>Ajouter quelqu’un</Text>
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Chercher un pseudo"
              placeholderTextColor={colors.textFaint}
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
                  <View key={f.id} style={styles.rowNoBorder}>
                    <Pressable
                      onPress={() => router.push(`/profile/${profile.id}`)}
                      style={styles.usernameRow}
                    >
                      <Avatar url={profile.avatar_url} username={profile.username} size={28} />
                      <Text style={styles.username}>{profile.username}</Text>
                    </Pressable>
                    <Pressable
                      onPress={() =>
                        confirmAndRun(
                          'Retirer cet ami ?',
                          `Vous ne serez plus liés : ${profile.username} devra renvoyer une demande pour redevenir ami.`,
                          () => handleRemove(f.id)
                        )
                      }
                      disabled={pendingActionId === f.id}
                      style={styles.pillOutline}
                    >
                      <Text style={styles.pillOutlineText}>Retirer</Text>
                    </Pressable>
                  </View>
                );
              })
            )}
          </>
        ) : (
          <>
            <Text style={[styles.eyebrow, styles.sectionLabel]}>
              Mes groupes {groups && groups.length > 0 ? `(${groups.length})` : ''}
            </Text>

            <View style={styles.newGroupRow}>
              <TextInput
                value={newGroupName}
                onChangeText={setNewGroupName}
                placeholder="Nouveau groupe"
                placeholderTextColor={colors.textFaint}
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

            <View style={styles.visibilityRow}>
              <Pressable
                onPress={() => setNewGroupVisibility('private')}
                style={[styles.visibilityOption, newGroupVisibility === 'private' && styles.visibilityOptionActive]}
              >
                <Text style={[styles.visibilityText, newGroupVisibility === 'private' && styles.visibilityTextActive]}>
                  Privé
                </Text>
              </Pressable>
              <Pressable
                onPress={() => setNewGroupVisibility('public')}
                style={[styles.visibilityOption, newGroupVisibility === 'public' && styles.visibilityOptionActive]}
              >
                <Text style={[styles.visibilityText, newGroupVisibility === 'public' && styles.visibilityTextActive]}>
                  Public
                </Text>
              </Pressable>
            </View>
            <Text style={styles.visibilityHint}>
              {newGroupVisibility === 'private'
                ? 'Seuls les membres verront ce groupe.'
                : 'Visible par tout ton Cercle.'}
            </Text>

            {groupError && <Text style={styles.error}>{groupError}</Text>}

            {groups === null ? (
              <ActivityIndicator style={styles.searchLoader} color={colors.gold} />
            ) : groups.length === 0 ? (
              <Text style={styles.muted}>Aucun groupe pour l’instant.</Text>
            ) : (
              groups.map((group) => {
                const expanded = expandedGroupId === group.id;
                const isOwner = group.owner_id === userId;
                const members = groupMembers[group.id];
                const memberById = new Map((members ?? []).map((m) => [m.friend_id, m]));
                const acceptedCount = (members ?? []).filter((m) => m.status === 'accepted').length;
                const pendingCount = (members ?? []).filter((m) => m.status === 'pending').length;
                return (
                  <View key={group.id} style={styles.groupBox}>
                    <Pressable onPress={() => handleToggleExpand(group.id)} style={styles.groupHeader}>
                      <View style={styles.flex}>
                        <Text style={styles.username}>{group.name}</Text>
                        <Text style={styles.groupMeta}>
                          {group.visibility === 'public' ? 'Public' : 'Privé'}
                          {members
                            ? ` · ${acceptedCount} membre${acceptedCount > 1 ? 's' : ''}${
                                pendingCount > 0 ? ` · ${pendingCount} en attente` : ''
                              }`
                            : ''}
                        </Text>
                      </View>
                      <Text style={styles.groupChevron}>{expanded ? '▲' : '▼'}</Text>
                    </Pressable>

                    {expanded && (
                      <View style={styles.groupBody}>
                        {/* N'importe quel membre peut inviter depuis son propre Cercle,
                            pas seulement le propriétaire — seul le retrait reste réservé
                            à ce dernier (RLS `group_members_delete_own`). */}
                        {accepted.length === 0 ? (
                          <Text style={styles.muted}>
                            Pas encore d’ami accepté à inviter dans ce groupe.
                          </Text>
                        ) : (
                          accepted.map((f) => {
                            const profile = otherProfile(f, userId!);
                            const member = memberById.get(profile.id);
                            const pending = pendingGroupActionId === `${group.id}:${profile.id}`;
                            const label = pending
                              ? '…'
                              : member?.status === 'accepted'
                                ? 'Membre'
                                : member?.status === 'pending'
                                  ? 'Invitation envoyée'
                                  : 'Inviter';
                            const score = groupPrediscores[`${group.id}:${profile.id}`];
                            // On peut toujours inviter (pas encore membre) ; retirer
                            // quelqu'un de déjà membre ou déjà invité reste réservé au
                            // propriétaire.
                            const canManage = isOwner || !member;
                            return (
                              <View key={profile.id} style={styles.row}>
                                <View style={styles.usernameRow}>
                                  <Avatar url={profile.avatar_url} username={profile.username} size={28} />
                                  <Text style={styles.username}>{profile.username}</Text>
                                  {member?.status === 'accepted' && (
                                    <Text style={styles.groupScore}>
                                      {score === undefined ? '…' : score === null ? '—' : `${score}%`}
                                    </Text>
                                  )}
                                </View>
                                {canManage ? (
                                  <Pressable
                                    onPress={() => handleToggleMember(group.id, profile.id, !!member)}
                                    disabled={pending}
                                    style={member ? styles.pillOutline : styles.pillGold}
                                  >
                                    <Text style={member ? styles.pillOutlineText : styles.pillGoldText}>
                                      {label}
                                    </Text>
                                  </Pressable>
                                ) : (
                                  <Text style={styles.pillOutlineText}>{label}</Text>
                                )}
                              </View>
                            );
                          })
                        )}

                        {/* Membres réels du groupe qui ne font pas partie de mon
                            Cercle (invités par quelqu'un d'autre) — juste pour
                            information, rien à gérer sur eux depuis cet écran. */}
                        {(() => {
                          const myFriendIds = new Set(accepted.map((f) => otherProfile(f, userId!).id));
                          const others = (members ?? []).filter(
                            (m) => m.status === 'accepted' && !myFriendIds.has(m.friend_id)
                          );
                          if (members === undefined) {
                            return <ActivityIndicator style={styles.searchLoader} color={colors.gold} />;
                          }
                          if (others.length === 0) return null;
                          return (
                            <>
                              <Text style={[styles.muted, styles.sectionSpacing]}>Autres membres</Text>
                              {others.map((m) => {
                                const score = groupPrediscores[`${group.id}:${m.friend_id}`];
                                return (
                                  <View key={m.friend_id} style={styles.rowNoBorder}>
                                    <Text style={styles.username}>{m.profile.username}</Text>
                                    <Text style={styles.groupScore}>
                                      {score === undefined ? '…' : score === null ? '—' : `${score}%`}
                                    </Text>
                                  </View>
                                );
                              })}
                            </>
                          );
                        })()}

                        {isOwner ? (
                          <Pressable
                            onPress={() =>
                              confirmAndRun(
                                'Supprimer ce groupe ?',
                                `« ${group.name} » sera définitivement supprimé pour tous ses membres.`,
                                () => handleDeleteGroup(group.id)
                              )
                            }
                            disabled={pendingGroupActionId === group.id}
                            style={styles.deleteGroup}
                          >
                            <Text style={styles.deleteGroupText}>Supprimer ce groupe</Text>
                          </Pressable>
                        ) : (
                          <Pressable
                            onPress={() => handleLeaveGroup(group.id)}
                            disabled={pendingGroupActionId === group.id}
                            style={styles.deleteGroup}
                          >
                            <Text style={styles.deleteGroupText}>Quitter ce groupe</Text>
                          </Pressable>
                        )}
                      </View>
                    )}
                  </View>
                );
              })
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
  eyebrow: { ...eyebrow, marginBottom: 4 },
  headerTitle: {
    fontFamily: fonts.display,
    fontSize: 24,
    color: colors.text,
  },
  tabs: {
    flexDirection: 'row',
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    backgroundColor: 'rgba(30, 30, 36, 0.05)',
    borderRadius: radius.pill,
    padding: 4,
    gap: 4,
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: radius.pill,
  },
  tabActive: { backgroundColor: colors.gold },
  tabText: {
    fontFamily: fonts.display,
    fontSize: 12,
    letterSpacing: 0.5,
    color: colors.textMuted,
    textTransform: 'uppercase',
  },
  tabTextActive: { color: '#FFFFFF' },
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
  sectionSpacing: { marginTop: spacing.md },
  resultsBox: { marginTop: spacing.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  rowNoBorder: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
  },
  username: { fontSize: 15, color: colors.text, fontWeight: '600' },
  usernameRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  groupScore: { fontSize: 13, fontWeight: '700', color: colors.gold },
  actions: { flexDirection: 'row', gap: 8 },
  pillGold: {
    backgroundColor: colors.gold,
    borderRadius: radius.pill,
    paddingHorizontal: 14,
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillGoldText: { color: colors.text, fontSize: 13, fontWeight: '700' },
  pillOutline: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    paddingHorizontal: 14,
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
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
  flex: { flex: 1 },
  visibilityRow: { flexDirection: 'row', gap: 8, marginTop: 10 },
  visibilityOption: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: radius.pill,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  visibilityOptionActive: { borderColor: colors.gold, backgroundColor: colors.goldSoft },
  visibilityText: { fontSize: 12, fontWeight: '700', color: colors.textMuted },
  visibilityTextActive: { color: colors.gold },
  visibilityHint: { fontSize: 12, color: colors.textFaint, marginTop: 6 },
  groupMeta: { fontSize: 11, color: colors.textFaint, marginTop: 2 },
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
