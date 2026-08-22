import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from './Text';

import { Avatar } from './Avatar';
import { Degrade, melange } from './Degrade';
import { fonts, type Colors } from '../lib/theme';

/* ===========================================================================
 * LA TRANCHE DE LIVRE
 *
 * On remplace l'enveloppe par un livre rangé dans une bibliothèque : de face,
 * on n'en voit que la tranche, avec le nom de son auteur écrit de bas en haut.
 *
 * Tout ce qui varie d'un livre à l'autre — largeur, hauteur, couleur, dessin
 * des caissons — est TIRÉ DE SON IDENTIFIANT, jamais au hasard. Deux raisons :
 * une étagère de livres tous identiques ne ressemble à rien, et un livre qui
 * changerait d'aspect à chaque rendu (ou d'un écran à l'autre) cesserait d'être
 * reconnaissable. Le même Predict a donc toujours exactement le même dos.
 *
 * La palette est celle de la charte, sans une couleur de plus : encre, bleu
 * moyen, bleu clair, or. Les cinq dos ci-dessous en sont des combinaisons.
 * ========================================================================= */

/** Hauteur de référence d'une tranche. Les variations jouent autour. */
export const SPINE_HEIGHT = 172;
/** Largeur de référence. Un dos de livre est BEAUCOUP plus haut que large :
 *  en dessous de ce rapport (environ 1 pour 4), on lit une tuile, pas une
 *  tranche. */
const SPINE_MIN_WIDTH = 32;
const SPINE_MAX_WIDTH = 48;

/** Empreinte stable et bornée, tirée de l'identifiant. */
function hash(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return h;
}

type SpineSkin = {
  /** Fond de la tranche. */
  cloth: string;
  /** Caissons en tête et en pied — la bande sombre des vraies reliures. */
  band: string;
  /** Filets dorés qui encadrent les caissons. */
  rule: string;
  /** Couleur du titre, choisie pour rester lisible sur `cloth`. */
  ink: string;
};

/** Les cinq reliures. Chacune est une combinaison de la charte, et chacune
 *  porte son propre contraste de titre — jamais deviné à l'exécution. */
function skins(colors: Colors): SpineSkin[] {
  const gold = '#eca835';
  return [
    { cloth: '#1c2737', band: '#0f1721', rule: gold, ink: '#f9fcfe' },
    { cloth: '#426170', band: '#2b4450', rule: gold, ink: '#f9fcfe' },
    { cloth: '#7ab8c2', band: '#5d9aa5', rule: '#1c2737', ink: '#1c2737' },
    { cloth: gold, band: '#c98d24', rule: '#1c2737', ink: '#1c2737' },
    { cloth: '#31495a', band: '#1f3242', rule: gold, ink: '#f9fcfe' },
  ];
}

export type BookSpineProps = {
  /** Sert d'empreinte : c'est lui qui fixe l'aspect du dos, pour toujours. */
  id: string;
  /** Écrit de bas en haut sur la tranche, comme un titre de vrai livre. */
  authorName: string;
  authorAvatarUrl?: string | null;
  /** Le livre demande un geste : un liseré doré et un dos plus haut le
   *  détachent de la rangée sans changer la nature de l'objet. */
  highlighted?: boolean;
  /** Jamais lu : une pastille dorée en tête de tranche. */
  unread?: boolean;
  /** Hauteur de référence, imposée par la niche qui les accueille. La
   *  variation propre à chaque livre se prend autour de cette valeur. Sans
   *  elle, des tranches de taille fixe laisseraient un vide au-dessus d'elles
   *  dans un meuble qui, lui, s'adapte à l'écran. */
  baseHeight?: number;
  colors: Colors;
};

export function BookSpine({
  id,
  authorName,
  authorAvatarUrl,
  highlighted = false,
  unread = false,
  baseHeight = SPINE_HEIGHT,
  colors,
}: BookSpineProps) {
  const styles = useMemo(() => createStyles(colors), [colors]);

  const h = hash(id);
  const palette = skins(colors);
  const skin = palette[h % palette.length];
  const width = SPINE_MIN_WIDTH + (h % (SPINE_MAX_WIDTH - SPINE_MIN_WIDTH + 1));
  // Les livres n'ont pas tous la même taille, mais ils reposent tous sur la
  // même étagère : la variation se prend EN HAUT, jamais en bas.
  // La variation reste proportionnelle : un livre est plus court d'un
  // douzième environ, pas de 22 pixels — sinon la rangée se tasse dès que la
  // niche grandit.
  const height =
    baseHeight - ((h >> 3) % Math.max(8, Math.round(baseHeight / 8))) + (highlighted ? 10 : 0);
  /* Les caissons de tête et de pied suivent la taille du livre : figés, ils
     devenaient des liserés ridicules sur une grande tranche et mangeaient
     tout sur une petite. Un tiers de la largeur pour la tête, un peu plus
     pour le pied, qui porte l'avatar. */
  const bandeTete = Math.round(Math.max(14, Math.min(26, height * 0.09)));
  const bandePied = Math.round(Math.max(24, Math.min(40, height * 0.15)));

  return (
    <View
      style={[
        styles.spine,
        {
          width,
          height,
          borderColor: highlighted ? '#eca835' : 'transparent',
          borderWidth: highlighted ? 2 : 0,
        },
      ]}
    >
      {/* LE BOMBÉ DU DOS, et c'est tout ce qui séparait un livre d'une case.
          Un dos de livre est une surface CYLINDRIQUE : la lumière vient de la
          gauche, frappe l'arête, glisse en une bande claire un peu avant le
          milieu, puis s'éteint jusqu'au bord droit où le voisin fait de
          l'ombre. Cinq étapes suffisent à décrire cette courbe ; un aplat
          n'en décrit aucune. */}
      <Degrade
        sens="h"
        bandes={16}
        etapes={[
          { couleur: melange(skin.cloth, '#000000', 0.34), a: 0 },
          { couleur: melange(skin.cloth, '#ffffff', 0.16), a: 0.16 },
          { couleur: skin.cloth, a: 0.46 },
          { couleur: melange(skin.cloth, '#000000', 0.18), a: 0.78 },
          { couleur: melange(skin.cloth, '#000000', 0.42), a: 1 },
        ]}
      />
      {/* Caisson de tête : bande sombre + filet doré, la signature d'une
          reliure. Le même en pied, pour que la tranche ait deux bouts. */}
      <View style={[styles.band, { height: bandeTete }]}>
        <Degrade
          sens="h"
          bandes={12}
          etapes={[
            { couleur: melange(skin.band, '#000000', 0.3), a: 0 },
            { couleur: melange(skin.band, '#ffffff', 0.12), a: 0.18 },
            { couleur: skin.band, a: 0.5 },
            { couleur: melange(skin.band, '#000000', 0.38), a: 1 },
          ]}
        />
        {unread && <View style={styles.unreadDot} />}
      </View>
      <View style={[styles.rule, { backgroundColor: skin.rule }]} />

      {/* LE TITRE, de bas en haut. `rotate: -90deg` sur un bloc dont on a fixé
          la largeur à la hauteur disponible : c'est ce qui permet au texte de
          courir sur toute la tranche au lieu d'être coupé à sa largeur. */}
      <View style={styles.titleZone}>
        <View style={[styles.titleRotor, { width: Math.max(40, height - bandeTete - bandePied - 16) }]}>
          <Text style={[styles.title, { color: skin.ink }]} numberOfLines={1}>
            {authorName}
          </Text>
        </View>
      </View>

      <View style={[styles.rule, { backgroundColor: skin.rule }]} />
      <View style={[styles.band, { height: bandePied }]}>
        <Degrade
          sens="h"
          bandes={12}
          etapes={[
            { couleur: melange(skin.band, '#000000', 0.3), a: 0 },
            { couleur: melange(skin.band, '#ffffff', 0.12), a: 0.18 },
            { couleur: skin.band, a: 0.5 },
            { couleur: melange(skin.band, '#000000', 0.38), a: 1 },
          ]}
        />
        <Avatar
          url={authorAvatarUrl ?? null}
          username={authorName}
          size={Math.min(width - 12, bandePied - 8)}
        />
      </View>

      {/* La coiffe : le tout petit renflement de cuir en haut et en bas d'un
          dos relié. Deux traits, mais ce sont eux qui ferment l'objet. */}
      <View style={styles.coiffe} pointerEvents="none" />
      <View style={styles.coiffeBas} pointerEvents="none" />
    </View>
  );
}

function createStyles(colors: Colors) {
  return StyleSheet.create({
    spine: {
      borderRadius: 3,
      overflow: 'hidden',
      alignItems: 'center',
      justifyContent: 'space-between',
      // Le livre pose son ombre sur l'étagère, pas dans le vide.
      // Le livre projette son ombre sur son voisin de droite et sur la
      // tablette : c'est ce décalage qui les décolle les uns des autres.
      boxShadow: [{ offsetX: 3, offsetY: 3, blurRadius: 7, color: 'rgba(8, 13, 20, 0.55)' }],
    },
    // Caissons volontairement fins : ce sont des filets de reliure, pas des
    // bandeaux. Épais, ils mangeaient la tranche et écrasaient le titre.
    band: { width: '100%', alignItems: 'center', justifyContent: 'center' },
    rule: { width: '100%', height: 1.5, opacity: 0.9 },
    titleZone: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    // Tourné d'un quart de tour vers la gauche : le texte se lit du bas vers
    // le haut, comme sur les reliures françaises.
    titleRotor: { transform: [{ rotate: '-90deg' }], alignItems: 'center' },
    title: {
      fontFamily: fonts.display,
      fontSize: 13,
      letterSpacing: 0.4,
      textAlign: 'center',
    },
    unreadDot: {
      width: 6,
      height: 6,
      borderRadius: 3,
      backgroundColor: '#eca835',
    },
    coiffe: {
      position: 'absolute',
      left: 0,
      right: 0,
      top: 0,
      height: 1.5,
      backgroundColor: 'rgba(249, 252, 254, 0.30)',
    },
    coiffeBas: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      height: 2,
      backgroundColor: 'rgba(10, 16, 24, 0.45)',
    },
  });
}
