import { useLocalSearchParams, useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text } from '../../../../components/Text';

import { LEGAL_CONTENT } from '../../../../lib/legalContent';
import { LEGAL_DOCS, type LegalDocId } from '../../../../lib/settingsSections';
import { colors, fonts, spacing } from '../../../../lib/theme';

/**
 * Rend le contenu réel de chaque document légal (lib/legalContent.ts) — un
 * premier jet complet, mais pas une version validée par un juriste : les
 * passages entre crochets marquent une information que seul l'exploitant de
 * l'app peut fournir (identité de l'éditeur, hébergeur, contact...).
 */
export default function LegalDocScreen() {
  const { doc } = useLocalSearchParams<{ doc: string }>();
  const router = useRouter();
  const docId = doc as LegalDocId;
  const label = LEGAL_DOCS.find((d) => d.id === docId)?.label ?? 'Informations légales';
  const content = LEGAL_CONTENT[docId];

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <Text style={styles.back}>Retour</Text>
        </Pressable>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {label}
        </Text>
        <View style={styles.headerSpacer} />
      </View>

      {content ? (
        <ScrollView contentContainerStyle={styles.scroll}>
          <Text style={styles.updatedAt}>Dernière mise à jour : {content.updatedAt}</Text>
          {content.intro && <Text style={styles.intro}>{content.intro}</Text>}
          {content.sections.map((section) => (
            <View key={section.heading} style={styles.section}>
              <Text style={styles.heading}>{section.heading}</Text>
              {section.paragraphs.map((paragraph, i) => (
                <Text key={i} style={styles.paragraph}>
                  {paragraph}
                </Text>
              ))}
            </View>
          ))}
        </ScrollView>
      ) : (
        <View style={styles.empty}>
          <Text style={styles.placeholder}>Document introuvable.</Text>
        </View>
      )}
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
  headerTitle: { fontFamily: fonts.display, fontSize: 17, color: colors.text, flexShrink: 1 },
  back: { fontSize: 15, color: colors.text, width: 56 },
  headerSpacer: { width: 56 },
  scroll: { padding: spacing.lg, paddingBottom: 48 },
  updatedAt: { fontSize: 12, color: colors.textFaint, marginBottom: spacing.md },
  intro: { fontSize: 14, color: colors.textMuted, lineHeight: 21, marginBottom: spacing.lg },
  section: { marginBottom: spacing.lg },
  heading: { fontFamily: fonts.sansBold, fontSize: 16, color: colors.text, marginBottom: 8 },
  paragraph: { fontSize: 14, color: colors.textMuted, lineHeight: 21, marginBottom: 8 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  placeholder: { fontSize: 14, color: colors.textFaint },
});
