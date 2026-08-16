import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Path, Polygon } from 'react-native-svg';
import { Text } from './Text';

import { fonts } from '../lib/theme';

/* ===========================================================================
 * GÉOMÉTRIE — relevée au pixel près sur les maquettes de référence
 * (`predict scellé.png`, `predict révélée.png`, `precit sondage.png`).
 *
 * Tout est exprimé en FRACTION du corps de l'enveloppe (le rectangle), jamais
 * en pixels : la carte s'adapte à la largeur de l'écran, les proportions non.
 * Chaque constante garde la division d'origine en commentaire, pour qu'on
 * puisse re-vérifier la valeur contre la maquette sans recalculer.
 *
 * Les deux maquettes décrivent LA MÊME enveloppe : corps 864 × 437 px dans le
 * scellé, 863 × 437 px dans la révélée. Le rabat est le même triangle, pointe
 * en bas quand c'est scellé, pointe en haut (ouvert) quand c'est révélé.
 * ========================================================================= */

/** Corps de l'enveloppe : 864 × 437 px, coins strictement droits. */
export const ENVELOPE_RATIO = 864 / 437; // 1.9771

/** Rabat : triangle dont la base est tout le bord (coin à coin) et la pointe
 * à 55,72 % de la hauteur du corps. Centré horizontalement (les maquettes ont
 * ~2 % d'asymétrie, corrigée ici). */
export const FLAP_DEPTH = 0.5572;

/** Badge : 95 px de diamètre pour 864 px de large. */
export const BADGE_SIZE = 95 / 864; // 0.10995
/** Centre du badge à 53,43 % de la hauteur — soit 2,3 % au-dessus de la
 * pointe du rabat, qui disparaît donc derrière lui. */
export const BADGE_CENTER = 0.5343;

/** Lettre révélée : 684 × 456 px, soit 79,17 % de la largeur du corps. */
export const LETTER_WIDTH = 684 / 864; // 0.7917
/** Hauteur de la lettre : 456 px pour un corps de 437 — elle est plus haute
 * que le corps, c'est ce qui la fait dépasser par le haut. */
export const LETTER_HEIGHT = 456 / 437; // 1.0435
/** Le haut de la lettre est 209 px au-dessus du haut du corps. */
export const LETTER_RISE = 209 / 437; // 0.4783
/** Rayon des coins de la lettre : 17 px pour 684 px de large. */
export const LETTER_RADIUS = 17 / 684; // 0.02485
/** Épaisseur du liseré de la lettre : 2 px pour 684 px de large. */
export const LETTER_BORDER = 2 / 684; // 0.00292

/* ===========================================================================
 * COULEURS — relevées elles aussi sur les maquettes.
 *
 * Ce sont des objets de marque, pas des tokens de thème : le lavis bleu et le
 * badge doré sont les mêmes en clair et en sombre, ils se composent simplement
 * sur le fond actif (d'où des `rgba`, jamais des aplats opaques).
 * ========================================================================= */

const BRAND_BLUE = '122, 184, 194'; // #7ab8c2
const BRAND_YELLOW = '236, 168, 53'; // #eca835
/** Bleu foncé de la charte — anneaux et glyphe du badge. La maquette utilise
 * #3f506a, écart imperceptible avec le bleu foncé officiel. */
export const BADGE_INK = '#426170';

export const WASH = {
  /** Scellé : corps à 29,8 % sur la maquette. */
  sealedBody: `rgba(${BRAND_BLUE}, 0.298)`,
  /** Scellé : le rabat vaut 36,9 % sur la maquette, mais il est peint PAR-DESSUS
   * le corps — les deux opacités se cumulent. On pose donc ici le résiduel,
   * 1 − (1 − 0,369) / (1 − 0,298) = 0,1011, qui recompose exactement 36,9 %
   * une fois superposé. Sans ça le rabat sort nettement trop foncé. */
  sealedFlap: `rgba(${BRAND_BLUE}, 0.1011)`,
  /** Révélé : corps à 20 %, rabat ouvert à 30,2 %. Ces deux-là ne se
   * chevauchent pas (le rabat s'arrête où le corps commence), donc les valeurs
   * de la maquette s'utilisent telles quelles. */
  openBody: `rgba(${BRAND_BLUE}, 0.2)`,
  openFlap: `rgba(${BRAND_BLUE}, 0.302)`,
} as const;

/** Opacité du papier de la lettre — voir `letterPaper()`. */
const LETTER_TINT = 0.26;

/**
 * Papier de la lettre : le crème #f5e6c9 de la maquette est exactement le
 * jaune de marque à 26 % posé sur le fond clair #f9fcfe (écart ≤ 1/255 sur les
 * trois canaux). On le compose donc ici plutôt que d'utiliser un `rgba` :
 * il faut une couleur OPAQUE, sinon le rabat qui passe derrière la lettre
 * transparaît au travers — alors que sur la maquette la lettre le couvre
 * complètement. Le calcul reste fait à partir de la surface du thème actif,
 * donc le mode sombre suit tout seul.
 */
export function letterPaper(surface: string): string {
  const base = channels(surface);
  // `BRAND_YELLOW` est une liste décimale (« 236, 168, 53 »), pas de l'hexa :
  // elle se parse avec `split`, surtout pas avec `channels()`.
  const tint = BRAND_YELLOW.split(',').map((n) => Number(n.trim()));
  const mixed = base.map((c, i) => Math.round(c + (tint[i] - c) * LETTER_TINT));
  return `rgb(${mixed.join(', ')})`;
}

/**
 * Encre à poser SUR le papier de la lettre. Le papier suit la surface du thème
 * (crème en clair, brun sombre en sombre) : l'encre doit donc basculer avec
 * lui, sinon le texte tombe à 4,0:1 en mode sombre — sous le seuil de
 * lisibilité. Bleu foncé de la charte sur papier clair, fond clair de la
 * charte sur papier sombre ; `soft` est la même encre atténuée, pour les
 * petites métadonnées.
 */
export function letterInk(surface: string): { strong: string; soft: string } {
  const [r, g, b] = channels(surface);
  const paperIsLight = (r * 299 + g * 587 + b * 114) / 1000 > 140;
  return paperIsLight
    ? { strong: '#1c2737', soft: 'rgba(66, 97, 112, 0.75)' }
    : { strong: '#f9fcfe', soft: 'rgba(249, 252, 254, 0.72)' };
}

function channels(color: string): number[] {
  const hex = color.replace('#', '');
  return [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16));
}

/* ===========================================================================
 * LE BADGE
 * ========================================================================= */

/** Bord dentelé façon timbre : 53 dents, creux à 93,3 % du rayon extérieur. */
const TEETH = 53;
const TROUGH = 0.933;
/** Deux anneaux fins concentriques, à 80 % et 87,4 % du rayon. */
const RING_INNER = 38 / 47.5; // 0.800
const RING_OUTER = 41.5 / 47.5; // 0.8737
/** Trait des anneaux : ~1,4 px pour 95 px de diamètre. */
const RING_STROKE = 1.4 / 95;
/** Hauteur de capitale du glyphe : 33 px pour 95 px de diamètre. Rapportée à
 * la hauteur de capitale de Roboto Bold (0,711 em) pour obtenir le corps. */
const GLYPH_SIZE = 33 / 95 / 0.711; // 0.4886

function scallopPath(size: number): string {
  const c = size / 2;
  const points: string[] = [];
  for (let i = 0; i < TEETH * 2; i += 1) {
    const angle = (i * Math.PI) / TEETH;
    const r = i % 2 === 0 ? c : c * TROUGH;
    points.push(`${(c + r * Math.cos(angle)).toFixed(2)},${(c + r * Math.sin(angle)).toFixed(2)}`);
  }
  return `M${points.join('L')}Z`;
}

/**
 * Le badge doré de la charte — disque jaune à bord dentelé, deux anneaux fins
 * et un glyphe centré. « P » pour un Predict scellé, « ? » pour un Sondage
 * (seule différence entre `predict scellé.png` et `precit sondage.png` :
 * 508 pixels, tous dans le glyphe).
 *
 * Couleurs fixes (pas de `useColors()`) : c'est un objet de marque, identique
 * en mode clair et en mode sombre.
 */
export function PredictBadge({ glyph = 'P', size = 64 }: { glyph?: 'P' | '?'; size?: number }) {
  const d = useMemo(() => scallopPath(size), [size]);
  const c = size / 2;
  const stroke = size * RING_STROKE;

  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size}>
        <Path d={d} fill={`rgb(${BRAND_YELLOW})`} />
        <Circle cx={c} cy={c} r={c * RING_OUTER} fill="none" stroke={BADGE_INK} strokeWidth={stroke} />
        <Circle cx={c} cy={c} r={c * RING_INNER} fill="none" stroke={BADGE_INK} strokeWidth={stroke} />
      </Svg>
      <View style={styles.glyphSlot} pointerEvents="none">
        <Text style={[styles.glyph, { fontSize: size * GLYPH_SIZE }]}>{glyph}</Text>
      </View>
    </View>
  );
}

/* ===========================================================================
 * LES DEUX RABATS
 * ========================================================================= */

/** Rabat fermé — pointe vers le bas, base sur tout le bord haut du corps.
 * `preserveAspectRatio="none"` : le triangle s'étire à la largeur réelle de la
 * carte sans qu'on ait à mesurer quoi que ce soit. */
export function FlapDown({ height }: { height: number }) {
  return (
    <Svg width="100%" height={height} viewBox="0 0 100 100" preserveAspectRatio="none">
      <Polygon points="0,0 100,0 50,100" fill={WASH.sealedFlap} />
    </Svg>
  );
}

/** Rabat ouvert — le même triangle retourné, pointe vers le haut : c'est lui
 * qui dépasse au-dessus de la lettre, et dont les deux bords obliques restent
 * visibles de part et d'autre. */
export function FlapUp({ height }: { height: number }) {
  return (
    <Svg width="100%" height={height} viewBox="0 0 100 100" preserveAspectRatio="none">
      <Polygon points="50,0 100,100 0,100" fill={WASH.openFlap} />
    </Svg>
  );
}

const styles = StyleSheet.create({
  glyphSlot: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
  glyph: { fontFamily: fonts.display, color: BADGE_INK, includeFontPadding: false },
});
