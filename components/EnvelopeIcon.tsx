import Svg, { Circle, Polygon, Rect } from 'react-native-svg';

import type { NotificationType } from '../lib/notifications';
import { useColors } from '../lib/themeMode';
import { BADGE_INK, ENVELOPE_RATIO, FLAP_DEPTH, LETTER_WIDTH, letterPaper, WASH } from './EnvelopeArt';

export type EnvelopeIconVariant = 'sealed' | 'revealed' | 'question' | 'awaiting' | 'multi';

/* La même enveloppe que les cartes du Fil, réduite à une icône : mêmes
 * proportions (`ENVELOPE_RATIO`), même rabat (`FLAP_DEPTH`), même lavis bleu.
 * Le `viewBox` fait 100 de large, tout le reste s'en déduit — les cotes
 * restent donc littéralement celles relevées sur les maquettes. */
const VB_W = 100;
const VB_H = VB_W / ENVELOPE_RATIO; // 50.58
const FLAP_H = VB_H * FLAP_DEPTH; // 28.18
/** Badge un peu plus gros que sur la maquette (11 % de la largeur) : à cette
 * taille d'icône, le diamètre exact ne serait qu'un point illisible. */
const BADGE_R = 9;
const LETTER_W = VB_W * LETTER_WIDTH;

/**
 * Icône d'enveloppe constante à gauche d'une notification — sa forme seule dit
 * l'état, sans dépendre de la couleur ni du texte. `sealed` : enveloppe
 * fermée, badge doré plein. `revealed` : enveloppe ouverte, la lettre dépasse.
 * `question` : fermée, badge cerclé (un Sondage). `awaiting` : fermée, badge
 * en anneau seul (réponse attendue). `multi` : ouverte, deux lettres.
 */
export function EnvelopeIcon({ variant, size = 26 }: { variant: EnvelopeIconVariant; size?: number }) {
  const colors = useColors();
  const closed = variant === 'sealed' || variant === 'question' || variant === 'awaiting';

  // Une enveloppe ouverte est plus haute qu'une fermée : le rabat retourné et
  // la lettre dépassent par le haut, exactement comme sur `predict révélée`.
  const top = closed ? 0 : -FLAP_H;
  const height = VB_H - top;

  return (
    <Svg width={size} height={(size * height) / VB_W} viewBox={`0 ${top} ${VB_W} ${height}`}>
      {closed ? (
        <>
          <Rect x={0} y={0} width={VB_W} height={VB_H} fill={WASH.sealedBody} />
          <Polygon points={`0,0 ${VB_W},0 ${VB_W / 2},${FLAP_H}`} fill={WASH.sealedFlap} />
          <Circle
            cx={VB_W / 2}
            cy={VB_H * 0.5343}
            r={BADGE_R}
            fill={variant === 'awaiting' ? 'none' : colors.accent}
            stroke={variant === 'sealed' ? 'none' : variant === 'awaiting' ? colors.accent : BADGE_INK}
            strokeWidth={variant === 'sealed' ? 0 : 1.6}
          />
        </>
      ) : (
        <>
          {/* Rabat ouvert, pointe en haut — dessiné avant le corps et la
              lettre : ses bords obliques restent visibles de part et d'autre. */}
          <Polygon points={`${VB_W / 2},${-FLAP_H} ${VB_W},0 0,0`} fill={WASH.openFlap} />
          <Rect x={0} y={0} width={VB_W} height={VB_H} fill={WASH.openBody} />
          {variant === 'multi' && (
            <Rect
              x={(VB_W - LETTER_W) / 2 + 6}
              y={-FLAP_H + 4}
              width={LETTER_W}
              height={VB_H}
              rx={3}
              fill={letterPaper(colors.surface)}
              stroke={colors.accent}
              strokeWidth={1.6}
            />
          )}
          <Rect
            x={(VB_W - LETTER_W) / 2}
            y={-FLAP_H}
            width={LETTER_W}
            height={VB_H}
            rx={3}
            fill={letterPaper(colors.surface)}
            stroke={colors.accent}
            strokeWidth={1.6}
          />
        </>
      )}
    </Svg>
  );
}

/** Fait le lien entre un type de notification et la variante d'icône à
 * afficher — voir `EnvelopeIcon`. Le détail Question vs Déclaration n'est pas
 * exposé par `Notification.prediction` (juste teaser + auteur), donc pas de
 * variante `question` ici : elle reste réservée à un usage futur, une fois
 * cette distinction disponible côté notifications. */
export function envelopeVariantForNotificationType(type: NotificationType): EnvelopeIconVariant {
  switch (type) {
    case 'prediction_revealed':
    case 'prediction_realized':
    case 'prediction_missed':
    case 'question_answered':
    case 'new_comment':
      return 'revealed';
    case 'reveal_reminder':
      return 'awaiting';
    case 'group_invite':
      return 'multi';
    default:
      return 'sealed';
  }
}
