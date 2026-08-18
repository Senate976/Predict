import { useMemo, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import {
  MAX_REPORT_DETAILS,
  REPORT_REASONS,
  reportContent,
  type ReportReason,
  type ReportTarget,
} from '../lib/moderation';
import { fonts, radius, spacing, type Colors } from '../lib/theme';
import { useColors } from '../lib/themeMode';
import { Text } from './Text';
import { TextInput } from './TextInput';

/**
 * Fenêtre de signalement, commune aux prédictions, aux commentaires et aux
 * profils. Un motif obligatoire (liste fermée, alignée sur la contrainte de la
 * base) et une précision facultative.
 *
 * Signaler deux fois le même contenu n'est pas présenté comme une erreur : du
 * point de vue de la personne, son signalement est bien parti — c'est la base
 * qui refuse le doublon, et ça ne la regarde pas.
 */
export function ReportDialog({
  visible,
  target,
  reporterId,
  onClose,
}: {
  visible: boolean;
  target: ReportTarget | null;
  reporterId: string;
  onClose: () => void;
}) {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [details, setDetails] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function close() {
    setReason(null);
    setDetails('');
    setSent(false);
    setError(null);
    onClose();
  }

  async function submit() {
    if (!reason || !target) return;
    setSubmitting(true);
    const { error: reportError } = await reportContent(reporterId, target, reason, details);
    setSubmitting(false);
    if (reportError) {
      setError(reportError);
      return;
    }
    setSent(true);
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={close}>
      <Pressable style={styles.backdrop} onPress={close}>
        {/* `onPress` vide : empêche un appui dans la boîte de refermer la
            fenêtre par le fond, sans rien faire d'autre. */}
        <Pressable style={styles.box} onPress={() => {}}>
          <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
            {sent ? (
              <>
                <Text style={styles.title}>Signalement envoyé</Text>
                <Text style={styles.lead}>
                  Merci. Ce contenu va être examiné. Si cette personne te dérange, tu peux
                  aussi la bloquer depuis son profil : elle ne verra plus rien de toi, et
                  réciproquement.
                </Text>
                <Pressable onPress={close} style={styles.primary}>
                  <Text style={styles.primaryText}>Fermer</Text>
                </Pressable>
              </>
            ) : (
              <>
                <Text style={styles.title}>Signaler</Text>
                <Text style={styles.lead}>Que se passe-t-il ?</Text>

                {REPORT_REASONS.map((r) => (
                  <Pressable
                    key={r.id}
                    onPress={() => setReason(r.id)}
                    style={[styles.reason, reason === r.id && styles.reasonActive]}
                  >
                    <View style={[styles.radio, reason === r.id && styles.radioActive]} />
                    <Text style={[styles.reasonText, reason === r.id && styles.reasonTextActive]}>
                      {r.label}
                    </Text>
                  </Pressable>
                ))}

                <Text style={styles.label}>Précisions (facultatif)</Text>
                <TextInput
                  value={details}
                  onChangeText={setDetails}
                  placeholder="Ce qui s’est passé"
                  placeholderTextColor={colors.textFaint}
                  multiline
                  maxLength={MAX_REPORT_DETAILS}
                  editable={!submitting}
                  style={styles.input}
                />

                {error && <Text style={styles.error}>{error}</Text>}

                <Pressable
                  onPress={submit}
                  disabled={!reason || submitting}
                  style={[styles.primary, (!reason || submitting) && styles.primaryDisabled]}
                >
                  {submitting ? (
                    <ActivityIndicator color={colors.textOnAccent} />
                  ) : (
                    <Text style={styles.primaryText}>Envoyer le signalement</Text>
                  )}
                </Pressable>

                <Pressable onPress={close} disabled={submitting} style={styles.secondary}>
                  <Text style={styles.secondaryText}>Annuler</Text>
                </Pressable>
              </>
            )}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function createStyles(colors: Colors) {
  return StyleSheet.create({
    backdrop: {
      flex: 1,
      backgroundColor: 'rgba(28, 39, 55, 0.55)',
      justifyContent: 'center',
      padding: spacing.lg,
    },
    box: {
      maxHeight: '88%',
      width: '100%',
      maxWidth: 420,
      alignSelf: 'center',
      backgroundColor: colors.background,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.border,
    },
    scroll: { padding: spacing.lg },
    title: { fontFamily: fonts.display, fontSize: 24, color: colors.text, marginBottom: 8 },
    lead: { fontSize: 15, color: colors.textMuted, lineHeight: 22, marginBottom: spacing.md },
    reason: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingVertical: 11,
    },
    reasonActive: {},
    radio: {
      width: 20,
      height: 20,
      borderRadius: 10,
      borderWidth: 1.5,
      borderColor: colors.border,
    },
    radioActive: { borderColor: colors.accent, borderWidth: 6 },
    reasonText: { flex: 1, fontSize: 15, color: colors.textMuted },
    reasonTextActive: { color: colors.text, fontFamily: fonts.bodyEmphasis },
    label: {
      fontFamily: fonts.label,
      fontSize: 12,
      letterSpacing: 0.5,
      textTransform: 'uppercase',
      color: colors.textFaint,
      marginTop: spacing.md,
      marginBottom: 6,
    },
    input: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.sm,
      paddingHorizontal: 12,
      paddingVertical: 10,
      minHeight: 76,
      textAlignVertical: 'top',
      fontSize: 15,
      color: colors.text,
      backgroundColor: colors.surface,
    },
    error: {
      color: colors.danger,
      backgroundColor: colors.dangerSoft,
      borderRadius: radius.sm,
      padding: 10,
      fontSize: 14,
      marginTop: spacing.sm,
    },
    primary: {
      backgroundColor: colors.accent,
      borderRadius: radius.pill,
      paddingVertical: 14,
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: 50,
      marginTop: spacing.md,
    },
    primaryDisabled: { opacity: 0.5 },
    primaryText: {
      fontFamily: fonts.sansBold,
      color: colors.textOnAccent,
      fontSize: 15,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    secondary: { marginTop: 14, alignItems: 'center' },
    secondaryText: { fontSize: 15, color: colors.textMuted },
  });
}
