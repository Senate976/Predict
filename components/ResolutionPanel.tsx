import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from './Text';

import { formatCountdown } from '../lib/datetime';
import {
  castBadFaithVote,
  castValidation,
  declareAutoVerdict,
  VALIDATION_WINDOW_HOURS,
  type PredictionFeedItem,
} from '../lib/predictions';
import { colors, fonts, radius, spacing } from '../lib/theme';

/**
 * Validation sociale d'une prédiction révélée, tous types confondus :
 * l'auteur déclare lui-même le résultat (Auto-Verdict), les destinataires
 * valident tacitement ou contestent, et une contestation massive (≥ 25%)
 * ouvre un jury à part. A remplacé l'ancien vote de majorité (Réalisée/
 * Manquée, ou Je crois/Je n'y crois pas pour l'immédiat) — le vote de
 * confiance universel (0-100%) ne détermine plus lui-même l'issue, seule
 * cette Auto-Verdict le fait désormais.
 *
 * Cinq statuts (`item.resolution_status`, déjà EFFECTIF — les fenêtres de
 * 24h écoulées sont recalculées côté vue) : voir `PredictionResolutionStatus`.
 */
export function ResolutionPanel({
  item,
  isAuthor,
  onChange,
}: {
  item: PredictionFeedItem;
  isAuthor: boolean;
  /** Recharge la prédiction côté écran appelant après une action réussie. */
  onChange: () => void;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const now = new Date();

  async function run(action: () => Promise<{ error: { message: string } | null }>) {
    setPending(true);
    setError(null);
    try {
      const { error: actionError } = await action();
      if (actionError) {
        setError(`Action impossible : ${actionError.message}`);
        return;
      }
      onChange();
    } finally {
      setPending(false);
    }
  }

  function windowRemainingLabel(startedAt: string | null): string {
    if (!startedAt) return '';
    const deadline = new Date(new Date(startedAt).getTime() + VALIDATION_WINDOW_HOURS * 3_600_000);
    return formatCountdown(deadline, now);
  }

  if (item.resolution_status === 'pending') {
    return (
      <View style={styles.box}>
        <Text style={styles.eyebrow}>Auto-Verdict</Text>
        {isAuthor ? (
          <>
            <Text style={styles.hint}>
              Cette prédiction n’a pas de date de révélation fixe : c’est à toi de déclarer le résultat.
            </Text>
            {error && <Text style={styles.error}>{error}</Text>}
            <View style={styles.row}>
              <Pressable
                onPress={() => run(() => declareAutoVerdict(item.id, true))}
                disabled={pending}
                style={styles.pillOutline}
              >
                <Text style={styles.pillOutlineText}>🟢 Réussie</Text>
              </Pressable>
              <Pressable
                onPress={() => run(() => declareAutoVerdict(item.id, false))}
                disabled={pending}
                style={styles.pillOutline}
              >
                <Text style={styles.pillOutlineText}>❌ Manquée</Text>
              </Pressable>
            </View>
          </>
        ) : (
          <Text style={styles.hint}>En attente du verdict de l’auteur.</Text>
        )}
      </View>
    );
  }

  if (item.resolution_status === 'pending_validation') {
    const responded = item.my_validation_response !== null;
    return (
      <View style={styles.box}>
        <Text style={styles.eyebrow}>En attente de validation</Text>
        <Text style={styles.hint}>
          L’auteur affirme avoir réussi cette prédiction. Sans assez de contestations,
          elle sera validée automatiquement {windowRemainingLabel(item.auto_verdict_declared_at)}.
        </Text>
        <Text style={styles.progress}>
          {item.validation_contest_count} contestation
          {item.validation_contest_count > 1 ? 's' : ''} sur {item.validation_eligible_count} destinataire
          {item.validation_eligible_count > 1 ? 's' : ''} (25% ouvre un jury)
        </Text>
        {error && <Text style={styles.error}>{error}</Text>}
        {!isAuthor && (
          responded ? (
            <Text style={styles.locked}>
              Tu as {item.my_validation_response === 'validate' ? 'validé' : 'contesté'}.
            </Text>
          ) : (
            <View style={styles.row}>
              <Pressable
                onPress={() => run(() => castValidation(item.id, 'validate'))}
                disabled={pending}
                style={styles.pillOutline}
              >
                <Text style={styles.pillOutlineText}>🟢 Valider</Text>
              </Pressable>
              <Pressable
                onPress={() => run(() => castValidation(item.id, 'contest'))}
                disabled={pending}
                style={styles.pillOutline}
              >
                <Text style={styles.pillOutlineText}>🚩 Mauvaise foi</Text>
              </Pressable>
            </View>
          )
        )}
      </View>
    );
  }

  if (item.resolution_status === 'mauvaise_foi') {
    const responded = item.my_bad_faith_vote !== null;
    return (
      <View style={[styles.box, styles.boxAlert]}>
        <Text style={styles.badFaithTitle}>🚩 MAUVAISE FOI</Text>
        <Text style={styles.hint}>
          La contestation a dépassé 25% des destinataires. Le Cercle tranche{' '}
          {windowRemainingLabel(item.bad_faith_vote_started_at)} : s’agit-il vraiment de mauvaise foi ?
        </Text>
        <Text style={styles.progress}>
          {item.bad_faith_yes_count} Oui · {item.bad_faith_no_count} Non
        </Text>
        {error && <Text style={styles.error}>{error}</Text>}
        {isAuthor ? (
          <Text style={styles.locked}>Tu ne participes pas à ce vote.</Text>
        ) : responded ? (
          <Text style={styles.locked}>Tu as voté {item.my_bad_faith_vote === 'yes' ? 'Oui' : 'Non'}.</Text>
        ) : (
          <View style={styles.row}>
            <Pressable
              onPress={() => run(() => castBadFaithVote(item.id, 'yes'))}
              disabled={pending}
              style={styles.pillOutline}
            >
              <Text style={styles.pillOutlineText}>Oui</Text>
            </Pressable>
            <Pressable
              onPress={() => run(() => castBadFaithVote(item.id, 'no'))}
              disabled={pending}
              style={styles.pillOutline}
            >
              <Text style={styles.pillOutlineText}>Non</Text>
            </Pressable>
          </View>
        )}
      </View>
    );
  }

  // resolved_success / resolved_failed.
  const success = item.resolution_status === 'resolved_success';
  return (
    <View
      style={[styles.box, success ? styles.boxRealized : styles.boxMissed]}
    >
      <Text style={styles.eyebrow}>Issue</Text>
      <Text style={styles.verdictText}>
        {success ? 'Réussie' : item.bad_faith_confirmed ? 'Manquée — mauvaise foi confirmée' : 'Manquée'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    marginTop: spacing.xl,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  // Liseré gauche assorti au sens de l'issue — même principe que le badge de
  // verdict des cartes, juste assez marqué pour se lire d'un coup d'œil.
  boxRealized: { borderLeftWidth: 4, borderLeftColor: colors.verdictRealized },
  boxMissed: { borderLeftWidth: 4, borderLeftColor: colors.verdictMissed },
  // Contestation en cours : le seul endroit de cet écran où l'alerte doit
  // vraiment sortir du lot, d'où le fond teinté (pas juste un liseré).
  boxAlert: { backgroundColor: colors.dangerSoft, borderColor: colors.danger },
  eyebrow: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    color: colors.textFaint,
    marginBottom: 6,
  },
  badFaithTitle: {
    fontFamily: fonts.sansBold,
    fontSize: 17,
    color: colors.danger,
    marginBottom: 6,
  },
  hint: { fontSize: 14, color: colors.textMuted, lineHeight: 20 },
  progress: { fontSize: 12, color: colors.textFaint, marginTop: 8 },
  verdictText: { fontFamily: fonts.sansBold, fontSize: 18, color: colors.text },
  row: { flexDirection: 'row', gap: 8, marginTop: 12 },
  pillOutline: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.text,
    borderRadius: radius.pill,
    paddingVertical: 10,
    alignItems: 'center',
    backgroundColor: colors.surface,
  },
  pillOutlineText: { fontSize: 13, fontWeight: '700', color: colors.text },
  locked: { fontSize: 13, fontWeight: '600', color: colors.textMuted, marginTop: 10, fontStyle: 'italic' },
  error: { fontSize: 12, color: colors.danger, marginTop: 8 },
});
