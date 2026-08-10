import { useRouter } from 'expo-router';
import { ChevronRight } from 'lucide-react-native';
import { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text } from '../../../components/Text';

import { LEGAL_DOCS, SETTINGS_SECTIONS } from '../../../lib/settingsSections';
import { fonts, spacing, type Colors } from '../../../lib/theme';
import { useColors } from '../../../lib/themeMode';

/** Liste des sections de Paramètres — chacune ouvre son propre écran sous
 * `app/(app)/settings/<id>.tsx` ; « Informations légales » ouvre sa propre
 * sous-liste (Mentions légales, CGU, Confidentialité), restée en stub. */
export default function SettingsScreen() {
  const router = useRouter();
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <Text style={styles.back}>Retour</Text>
        </Pressable>
        <Text style={styles.headerTitle}>Paramètres</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.group}>
          {SETTINGS_SECTIONS.map((section, i) => (
            <Pressable
              key={section.id}
              onPress={() => router.push(`/settings/${section.id}`)}
              style={[styles.row, i === SETTINGS_SECTIONS.length - 1 && styles.rowLast]}
            >
              <Text style={styles.rowText}>{section.label}</Text>
              <ChevronRight size={16} color={colors.icon} strokeWidth={1.75} />
            </Pressable>
          ))}
        </View>

        <View style={[styles.group, styles.sectionSpacing]}>
          <Pressable
            onPress={() => router.push('/settings/legal')}
            style={[styles.row, styles.rowLast]}
          >
            <View>
              <Text style={styles.rowText}>Informations légales</Text>
              <Text style={styles.rowHint}>
                {LEGAL_DOCS.map((d) => d.label).join(' · ')}
              </Text>
            </View>
            <ChevronRight size={16} color={colors.icon} strokeWidth={1.75} />
          </Pressable>
        </View>
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
  scroll: { padding: spacing.lg, paddingBottom: 48 },
  sectionSpacing: { marginTop: spacing.lg },
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
    gap: 10,
  },
  rowLast: { borderBottomWidth: 0 },
  rowText: { fontSize: 15, fontWeight: '600', color: colors.text },
  rowHint: { fontSize: 12, color: colors.textFaint, marginTop: 2 },
  });
}
