import { useMemo } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { Text } from './Text';

import { Degrade, melange } from './Degrade';
import { fonts, type Colors } from '../lib/theme';

/* ===========================================================================
 * LA TRANCHE DE LIVRE
 *
 * On remplace l'enveloppe par un livre rangé dans une bibliothèque : de face,
 * on n'en voit que la tranche, avec le nom de son auteur écrit de bas en haut
 * et son portrait en médaillon au pied.
 *
 * DEUX RÈGLES, et elles se contredisent en apparence :
 *
 * 1. TOUS LES LIVRES ONT LA MÊME HAUTEUR. Des dos de tailles inégales font
 *    une pile de brochures ; une reliure d'éditeur, elle, se range à hauteur
 *    constante. C'est cette régularité qui donne le sentiment de rangement —
 *    donc de sécurité — qu'on attend d'une bibliothèque.
 *
 * 2. TOUT LE RESTE VARIE, ET SE TIRE DE L'IDENTIFIANT : l'épaisseur du dos,
 *    le cuir, sa couleur. Jamais au hasard — un livre qui changerait d'aspect
 *    d'un écran à l'autre cesserait d'être reconnaissable. Le même Predict a
 *    donc toujours exactement le même dos.
 *
 * Les cuirs sont la charte prise dans la chaleur : l'or (#eca835) descendu
 * vers le fauve et le tabac, plus les deux bleus de la charte qui font les
 * quelques dos froids d'une vraie étagère. Une rangée uniquement bleue est
 * glaciale ; une rangée uniquement fauve est monotone.
 * ========================================================================= */

/** Hauteur de référence d'une tranche, quand la niche n'en impose pas. */
export const SPINE_HEIGHT = 172;
/** Un dos de livre est BEAUCOUP plus haut que large : en dessous de ce
 *  rapport (environ 1 pour 4), on lit une tuile, pas une tranche. */
const SPINE_MIN_WIDTH = 32;
const SPINE_MAX_WIDTH = 48;

/** Empreinte stable et bornée, tirée de l'identifiant. */
function hash(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return h;
}

type SpineSkin = {
  /** Le cuir du dos. */
  cloth: string;
  /** Caissons en tête et en pied — la bande sombre des vraies reliures. */
  band: string;
  /** Filets dorés qui encadrent les caissons. */
  rule: string;
  /** Couleur du titre, choisie pour rester lisible sur `cloth`. */
  ink: string;
};

/** Six reliures. Quatre cuirs chauds, deux dos froids de la charte — et
 *  chacune porte son propre contraste de titre, jamais deviné à l'exécution. */
function skins(): SpineSkin[] {
  const or = '#eca835';
  /* Six cuirs, et ce qui compte est qu'ils soient ÉCARTÉS. Trois bruns
     voisins font une rangée de cartons ; il faut un clair, un très sombre,
     un rouge et un froid pour qu'une étagère respire. */
  return [
    { cloth: '#8a4f2c', band: '#5a3018', rule: or, ink: '#f7ead2' }, // fauve
    { cloth: '#426170', band: '#2b4450', rule: or, ink: '#f9fcfe' }, // bleu charte
    { cloth: '#b9862f', band: '#7d5619', rule: '#2a1a08', ink: '#241505' }, // or ciré
    { cloth: '#7b2f28', band: '#4a1a16', rule: or, ink: '#f4e2c8' }, // bordeaux
    { cloth: '#1c2737', band: '#0e1620', rule: or, ink: '#f9fcfe' }, // encre charte
    { cloth: '#cbb98d', band: '#94805a', rule: '#4a3a1c', ink: '#2a1a08' }, // vélin
  ];
}

export type BookSpineProps = {
  /** Sert d'empreinte : c'est lui qui fixe l'aspect du dos, pour toujours. */
  id: string;
  /** Écrit de bas en haut sur la tranche, comme un titre de vrai livre. */
  authorName: string;
  authorAvatarUrl?: string | null;
  /** Le livre demande un geste : un liseré doré le détache de la rangée.
   *  PAS une hauteur différente — les livres sont tous à la même hauteur, et
   *  c'est la lumière sur le liseré qui attire l'œil, pas une bosse. */
  highlighted?: boolean;
  /** Jamais lu : une pastille dorée en tête de tranche. */
  unread?: boolean;
  /** Hauteur imposée par la niche qui les accueille. Elle vaut pour TOUS les
   *  livres de la rangée, sans exception. */
  baseHeight?: number;
  colors: Colors;
};

/**
 * L'épaisseur exacte d'un dos, sans avoir à le rendre.
 *
 * La niche doit savoir combien de livres elle peut aligner AVANT de les
 * poser : sinon la rangée déborde et c'est le serre-livres — donc l'accès au
 * reste du rayon — qui passe sous le montant. Comme l'épaisseur est tirée de
 * l'identifiant, elle est connue d'avance : il suffit de la demander.
 */
export function spineWidth(id: string): number {
  return SPINE_MIN_WIDTH + (hash(id) % (SPINE_MAX_WIDTH - SPINE_MIN_WIDTH + 1));
}

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
  const palette = skins();
  const skin = palette[h % palette.length];
  const width = spineWidth(id);
  const height = baseHeight;

  /* Les caissons de tête et de pied suivent la taille du livre : figés, ils
     devenaient des liserés ridicules sur une grande tranche et mangeaient
     tout sur une petite. Le pied est plus haut : c'est lui qui porte le
     portrait. */
  const bandeTete = Math.round(Math.max(14, Math.min(26, height * 0.09)));
  const bandePied = Math.round(Math.max(30, Math.min(46, height * 0.18)));
  const medaillon = Math.max(16, Math.min(width - 10, bandePied - 14));

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
      {/* LE BOMBÉ DU DOS, et c'est tout ce qui sépare un livre d'une case.
          Un dos de livre est une surface CYLINDRIQUE : la lumière vient de la
          gauche, frappe l'arête, glisse en une bande claire un peu avant le
          milieu, puis s'éteint jusqu'au bord droit où le voisin fait de
          l'ombre. Cinq étapes suffisent à décrire cette courbe ; un aplat
          n'en décrit aucune. */}
      <Degrade
        sens="h"
        bandes={18}
        etapes={[
          { couleur: melange(skin.cloth, '#000000', 0.38), a: 0 },
          { couleur: melange(skin.cloth, '#ffe6bd', 0.22), a: 0.16 },
          { couleur: skin.cloth, a: 0.46 },
          { couleur: melange(skin.cloth, '#000000', 0.2), a: 0.78 },
          { couleur: melange(skin.cloth, '#000000', 0.46), a: 1 },
        ]}
      />
      {/* Le grain du cuir : quelques filets horizontaux à peine visibles.
          Un cuir parfaitement lisse est du plastique. */}
      <Grain hauteur={height} />

      {/* Caisson de tête : bande sombre + filet doré, la signature d'une
          reliure. Le même en pied, pour que la tranche ait deux bouts. */}
      <View style={[styles.band, { height: bandeTete }]}>
        <Degrade
          sens="h"
          bandes={12}
          etapes={[
            { couleur: melange(skin.band, '#000000', 0.32), a: 0 },
            { couleur: melange(skin.band, '#ffe6bd', 0.16), a: 0.18 },
            { couleur: skin.band, a: 0.5 },
            { couleur: melange(skin.band, '#000000', 0.4), a: 1 },
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
            { couleur: melange(skin.band, '#000000', 0.32), a: 0 },
            { couleur: melange(skin.band, '#ffe6bd', 0.16), a: 0.18 },
            { couleur: skin.band, a: 0.5 },
            { couleur: melange(skin.band, '#000000', 0.4), a: 1 },
          ]}
        />
        <Medaillon url={authorAvatarUrl} nom={authorName} taille={medaillon} styles={styles} />
      </View>

      {/* La coiffe : le tout petit renflement de cuir en haut et en bas d'un
          dos relié. Deux traits, mais ce sont eux qui ferment l'objet. */}
      <View style={styles.coiffe} pointerEvents="none" />
      <View style={styles.coiffeBas} pointerEvents="none" />
    </View>
  );
}

/**
 * LE MÉDAILLON : le portrait de l'auteur, serti d'un jonc de laiton au pied
 * du dos, comme une pièce rapportée sur une reliure.
 *
 * Il ne réutilise pas `<Avatar>` : le repli de celui-ci pose l'initiale sur
 * un fond très pâle, invisible au fond d'une niche sombre. Ici l'initiale est
 * gravée en sombre sur laiton — le même contraste que les plaques du meuble.
 */
function Medaillon({
  url,
  nom,
  taille,
  styles,
}: {
  url?: string | null;
  nom: string;
  taille: number;
  styles: ReturnType<typeof createStyles>;
}) {
  const rond = { width: taille, height: taille, borderRadius: taille / 2 };
  const jonc = taille + 4;
  return (
    <View style={[styles.jonc, { width: jonc, height: jonc, borderRadius: jonc / 2 }]}>
      {url ? (
        <Image source={{ uri: url }} style={[rond, styles.portrait]} />
      ) : (
        <View style={[rond, styles.initialeFond]}>
          <Text style={[styles.initiale, { fontSize: Math.round(taille * 0.52) }]}>
            {nom.trim().charAt(0).toUpperCase() || '?'}
          </Text>
        </View>
      )}
    </View>
  );
}

/** Le grain du cuir : des filets horizontaux d'opacité irrégulière, tirés
 *  d'une graine fixe pour ne pas danser d'un rendu à l'autre. */
function Grain({ hauteur }: { hauteur: number }) {
  const filets = useMemo(() => {
    const n = Math.max(6, Math.round(hauteur / 14));
    return Array.from({ length: n }, (_, i) => {
      const x = Math.sin((i + 1) * 91.7) * 43758.5453;
      const r = x - Math.floor(x);
      return { top: `${(i / n) * 100 + r * 3}%`, opacity: 0.04 + r * 0.05, sombre: r > 0.5 };
    });
  }, [hauteur]);
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {filets.map((f, i) => (
        <View
          key={i}
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: f.top as `${number}%`,
            height: 1,
            backgroundColor: f.sombre ? '#000000' : '#ffe6bd',
            opacity: f.opacity,
          }}
        />
      ))}
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
      // Le livre projette son ombre sur son voisin de droite et sur la
      // tablette : c'est ce décalage qui les décolle les uns des autres.
      boxShadow: [{ offsetX: 3, offsetY: 3, blurRadius: 7, color: 'rgba(12, 7, 3, 0.6)' }],
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

    jonc: {
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#eca835',
      boxShadow: [{ offsetX: 0, offsetY: 1, blurRadius: 3, color: 'rgba(12, 7, 3, 0.55)' }],
    },
    portrait: { backgroundColor: '#2a1a08' },
    initialeFond: { backgroundColor: '#f4c463', alignItems: 'center', justifyContent: 'center' },
    initiale: { color: '#2a1a08', fontWeight: '800', fontFamily: fonts.display },

    coiffe: {
      position: 'absolute',
      left: 0,
      right: 0,
      top: 0,
      height: 1.5,
      backgroundColor: 'rgba(255, 236, 205, 0.34)',
    },
    coiffeBas: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      height: 2,
      backgroundColor: 'rgba(12, 7, 3, 0.5)',
    },
  });
}
