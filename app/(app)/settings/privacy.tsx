import * as Clipboard from 'expo-clipboard';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, Share, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text } from '../../../components/Text';

import { Avatar } from '../../../components/Avatar';
import { useAuth } from '../../../lib/auth';
import { fetchBlockedUsers, unblockUser } from '../../../lib/moderation';
import { exportOwnData } from '../../../lib/settings';
import type { PredictionScope } from '../../../lib/predictions';
import { eyebrow, fonts, radius, spacing, type Colors } from '../../../lib/theme';
import { useColors } from '../../../lib/themeMode';

/** Les deux mêmes réponses qu'à la création, mot pour mot : le réglage n'a
 * d'intérêt que s'il pré-coche exactement ce qu'on retrouvera là-bas.
 * « Un groupe » n'y figure pas — il désigne un groupe précis, qui se choisit
 * à chaque fois, pas un défaut global. */
const OPTIONS: { value: PredictionScope; label: string; hint: string }[] = [
  { value: 'circle', label: 'Mon Cercle', hint: 'Visible par tous mes amis acceptés.' },
  { value: 'selected', label: 'Je choisis', hint: 'Je désigne un groupe ou des amis à chaque fois.' },
];

export default function PrivacySettingsScreen() {
  const router = useRouter();
  const { defaultScope, setDefaultScope, session } = useAuth();
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const active = defaultScope ?? 'circle';
  const userId = session?.user.id;

  const [blocked, setBlocked] = useState<{ id: string; username: string; avatar_url: string | null }[]>([]);
  const [exporting, setExporting] = useState(false);
  const [exportNotice, setExportNotice] = useState<string | null>(null);

  const loadBlocked = useCallback(async () => {
    if (!userId) return;
    const { data } = await fetchBlockedUsers(userId);
    setBlocked(data);
  }, [userId]);

  useEffect(() => {
    loadBlocked();
  }, [loadBlocked]);

  /**
   * Remet à l'utilisateur toutes ses données, en JSON. Le partage natif sur
   * mobile, le presse-papier sur le web : ni l'un ni l'autre n'a besoin de
   * serveur, et le fichier ne transite par personne.
   */
  async function handleExport() {
    if (!userId) return;
    setExporting(true);
    setExportNotice(null);
    const { data, error } = await exportOwnData();
    setExporting(false);

    if (error || !data) {
      setExportNotice('Export impossible pour le moment. Réessaie dans un instant.');
      return;
    }

    const json = JSON.stringify(data, null, 2);
    if (Platform.OS === 'web') {
      await Clipboard.setStringAsync(json);
      setExportNotice('Tes données ont été copiées dans le presse-papier, au format JSON.');
      return;
    }
    await Share.share({ message: json });
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <Text style={styles.back}>Retour</Text>
        </Pressable>
        <Text style={styles.headerTitle}>Confidentialité</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.eyebrow}>Portée par défaut</Text>
        <Text style={styles.description}>
          La portée pré-sélectionnée quand tu scelles un nouveau Predict — tu peux toujours la changer au cas
          par cas.
        </Text>

        <View style={styles.group}>
          {OPTIONS.map((option, i) => {
            const isActive = active === option.value;
            return (
              <Pressable
                key={option.value}
                onPress={() => setDefaultScope(option.value)}
                style={[styles.row, i === OPTIONS.length - 1 && styles.rowLast]}
              >
                <View style={styles.rowText}>
                  <Text style={styles.rowLabel}>{option.label}</Text>
                  <Text style={styles.rowHint}>{option.hint}</Text>
                </View>
                {isActive && <View style={styles.dot} />}
              </Pressable>
            );
          })}
        </View>

        <Text style={[styles.eyebrow, styles.sectionSpacing]}>Personnes bloquées</Text>
        {blocked.length === 0 ? (
          <Text style={styles.description}>
            Tu n’as bloqué personne. Bloquer se fait depuis le profil de la personne.
          </Text>
        ) : (
          <View style={styles.group}>
            {blocked.map((b, i) => (
              <View key={b.id} style={[styles.row, i === blocked.length - 1 && styles.rowLast]}>
                <View style={styles.blockedIdentity}>
                  <Avatar url={b.avatar_url} username={b.username} size={34} />
                  <Text style={styles.rowLabel}>{b.username}</Text>
                </View>
                <Pressable
                  onPress={async () => {
                    if (!userId) return;
                    await unblockUser(userId, b.id);
                    loadBlocked();
                  }}
                  hitSlop={8}
                >
                  <Text style={styles.unblock}>Débloquer</Text>
                </Pressable>
              </View>
            ))}
          </View>
        )}

        <Text style={[styles.eyebrow, styles.sectionSpacing]}>Mes données</Text>
        <Text style={styles.description}>
          Récupère une copie de tout ce que tu as publié — profil, Predicts, commentaires,
          réponses, réactions et liste d’amis — au format JSON.
        </Text>
        <Pressable onPress={handleExport} disabled={exporting} style={styles.exportButton}>
          {exporting ? (
            <ActivityIndicator color={colors.text} />
          ) : (
            <Text style={styles.exportText}>Exporter mes données</Text>
          )}
        </Pressable>
        {exportNotice && <Text style={styles.exportNotice}>{exportNotice}</Text>}
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
  headerTitle: { fontFamily: fonts.display, fontSize: 17, color: colors.text },
  back: { fontSize: 15, color: colors.text, width: 56 },
  headerSpacer: { width: 56 },
  sectionSpacing: { marginTop: spacing.xl },
  blockedIdentity: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1, minWidth: 0 },
  unblock: { fontFamily: fonts.bodyEmphasis, fontSize: 15, color: colors.accent },
  exportButton: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 50,
    backgroundColor: colors.surface,
  },
  exportText: { fontFamily: fonts.bodyEmphasis, fontSize: 15, color: colors.text },
  exportNotice: {
    fontSize: 14,
    color: colors.textMuted,
    lineHeight: 20,
    marginTop: spacing.sm,
    backgroundColor: colors.accentSoft,
    borderRadius: radius.sm,
    padding: 12,
  },
  scroll: { padding: spacing.lg, paddingBottom: 48 },
  eyebrow: { ...eyebrow(colors), marginBottom: 8 },
  description: { fontSize: 15, color: colors.textMuted, lineHeight: 21, marginBottom: spacing.md },
  group: {
    borderRadius: 16,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: 12,
  },
  rowLast: { borderBottomWidth: 0 },
  rowText: { flex: 1 },
  rowLabel: { fontSize: 15, fontWeight: '600', color: colors.text },
  rowHint: { fontSize: 14, color: colors.textFaint, marginTop: 2 },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.accent },
  });
}
