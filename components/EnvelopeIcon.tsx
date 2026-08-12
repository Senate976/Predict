import Svg, { Circle, Path, Rect } from 'react-native-svg';

import type { NotificationType } from '../lib/notifications';
import { useColors } from '../lib/themeMode';

export type EnvelopeIconVariant = 'sealed' | 'revealed' | 'question' | 'awaiting' | 'multi';

/**
 * Icône d'enveloppe constante à gauche d'une notification — sa forme seule
 * dit l'état (fermée, ouverte, à plusieurs mains, en attente de réponse),
 * sans dépendre de la couleur ni du texte : reconnaissable d'un coup d'œil,
 * même noyée dans dix notifications différentes (design « Le pli », section
 * 02). `sealed` : enveloppe fermée, cachet plein. `revealed` : enveloppe
 * ouverte, la lettre dépasse. `question` : fermée, deux petites lettres qui
 * dépassent (question posée à plusieurs). `awaiting` : fermée, cachet en
 * anneau avec un « ? » (réponse attendue de ce destinataire-ci). `multi` :
 * ouverte + coche (plusieurs réponses viennent d'être révélées).
 */
export function EnvelopeIcon({ variant, size = 26 }: { variant: EnvelopeIconVariant; size?: number }) {
  const colors = useColors();
  const paper = colors.surfaceRaised;
  const ink = colors.text;

  return (
    <Svg width={size} height={(size * 24) / 30} viewBox="0 0 30 24">
      {variant === 'sealed' && (
        <>
          <Rect x={1} y={1} width={28} height={22} rx={2} fill={paper} stroke={ink} strokeWidth={1.4} />
          <Path d="M1 1 L15 14 L29 1" fill="none" stroke={ink} strokeWidth={1.4} />
          <Circle cx={15} cy={9} r={4.5} fill={colors.accent} />
        </>
      )}
      {variant === 'revealed' && (
        <>
          <Rect x={1} y={8} width={28} height={15} rx={2} fill={paper} stroke={ink} strokeWidth={1.4} />
          <Rect x={7} y={0} width={16} height={13} rx={1} fill={paper} stroke={ink} strokeWidth={1.2} />
          <Path d="M1 8 L15 17 L29 8" fill="none" stroke={ink} strokeWidth={1.4} />
        </>
      )}
      {variant === 'question' && (
        <>
          <Rect x={1} y={1} width={28} height={22} rx={2} fill={paper} stroke={ink} strokeWidth={1.4} />
          <Path d="M1 1 L15 14 L29 1" fill="none" stroke={ink} strokeWidth={1.4} />
          <Rect
            x={10}
            y={-2}
            width={5}
            height={9}
            rx={1}
            fill={paper}
            stroke={ink}
            strokeWidth={1}
            transform="rotate(-10 12 3)"
          />
          <Rect
            x={15}
            y={-2}
            width={5}
            height={9}
            rx={1}
            fill={paper}
            stroke={ink}
            strokeWidth={1}
            transform="rotate(10 18 3)"
          />
        </>
      )}
      {variant === 'awaiting' && (
        <>
          <Rect x={1} y={1} width={28} height={22} rx={2} fill={paper} stroke={ink} strokeWidth={1.4} />
          <Path d="M1 1 L15 14 L29 1" fill="none" stroke={ink} strokeWidth={1.4} />
          <Circle cx={15} cy={9} r={4.5} fill="none" stroke={ink} strokeWidth={1.3} />
          <Path d="M15 6.5v3M15 11.5h.01" stroke={ink} strokeWidth={1.3} strokeLinecap="round" />
        </>
      )}
      {variant === 'multi' && (
        <>
          <Rect x={1} y={8} width={28} height={15} rx={2} fill={paper} stroke={ink} strokeWidth={1.4} />
          <Rect x={7} y={0} width={16} height={13} rx={1} fill={paper} stroke={ink} strokeWidth={1.2} />
          <Path d="M1 8 L15 17 L29 8" fill="none" stroke={ink} strokeWidth={1.4} />
          <Path
            d="M11 6.5l3 3 5-5"
            fill="none"
            stroke={colors.textMuted}
            strokeWidth={1.3}
            strokeLinecap="round"
            strokeLinejoin="round"
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
