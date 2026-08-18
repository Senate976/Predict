import { useRouter } from 'expo-router';
import { ChevronRight } from 'lucide-react-native';
import { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text } from '../../../../components/Text';

import { isPublisherIdentityComplete, missingPublisherFields } from '../../../../lib/publisherIdentity';
import { LEGAL_DOCS } from '../../../../lib/settingsSections';
import { fonts, radius, spacing, type Colors } from '../../../../lib/theme';
import { useColors } from '../../../../lib/themeMode';

export default function LegalScreen() {
  const router = useRouter();
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <Text style={styles.back}>Retour</Text>
        </Pressable>
        <Text style={styles.headerTitle}>Informations légales</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        {/* Visible tant que `lib/publisherIdentity.ts` n'est pas rempli. Mieux
            vaut un avertissement gênant en développement qu'une mention légale
            à trous découverte une fois l'app publique. */}
        {!isPublisherIdentityComplete() && (
          <Text style={styles.incomplete}>
            Ces documents sont incomplets : {missingPublisherFields().length} information(s)
            d’identité de l’éditeur restent à renseigner dans{' '}
            <Text style={styles.mono}>lib/publisherIdentity.ts</Text>. Les mentions légales
            sont une obligation avant toute mise en ligne publique.
          </Text>
        )}

        <View style={styles.group}>
          {LEGAL_DOCS.map((doc, i) => (
            <Pressable
              key={doc.id}
              onPress={() => router.push(`/settings/legal/${doc.id}`)}
              style={[styles.row, i === LEGAL_DOCS.length - 1 && styles.rowLast]}
            >
              <Text style={styles.rowText}>{doc.label}</Text>
              <ChevronRight size={19} color={colors.icon} strokeWidth={1.75} />
            </Pressable>
          ))}
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
  incomplete: {
    color: colors.text,
    backgroundColor: colors.dangerSoft,
    borderLeftWidth: 3,
    borderLeftColor: colors.danger,
    borderRadius: radius.sm,
    padding: 14,
    fontSize: 14,
    lineHeight: 21,
    marginBottom: spacing.md,
  },
  mono: { fontFamily: fonts.label },
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
  });
}
