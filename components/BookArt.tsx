import { useMemo } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { Text } from './Text';

import { Degrade, melange } from './Degrade';
import { fonts, type Colors } from '../lib/theme';

/* ===========================================================================
 * LA TRANCHE DE LIVRE
 *
 * L'ANATOMIE, et c'est elle qui sépare un livre d'un rectangle de couleur.
 * De haut en bas, un dos relié c'est :
 *
 *   1. LA TRANCHE DE TÊTE — le bloc de papier vu du dessus, en retrait des
 *      plats. C'est LE détail qui dit « c'est une pile de feuilles » : sans
 *      lui, on regarde un carré de cuir, pas un livre.
 *   2. LA COIFFE — le cuir qui se replie sur le bloc, un bourrelet sombre.
 *   3. LES NERFS — les nervures en travers du dos. Chacune est une arête
 *      éclairée par-dessus et une ombre par-dessous. Elles sont la signature
 *      d'une reliure ; deux bandes plates n'en sont que la caricature.
 *   4. LES CAISSONS — les compartiments entre les nerfs. Le titre vit dans
 *      l'un d'eux, jamais à cheval.
 *   5. LES CHASSES — les plats débordent du bloc de papier, sur les deux
 *      bords. Un liseré sombre de chaque côté, et le dos cesse d'être à ras.
 *
 * L'OR EST UN ACCENT, PAS UNE COULEUR DE FOND. Il ne sert qu'aux filets qui
 * encadrent le titre et à la pastille du non-lu. Étalé partout, il jaunit
 * l'étagère entière et ne signale plus rien.
 *
 * TOUS LES LIVRES ONT LA MÊME HAUTEUR. Ce qui varie — épaisseur, cuir — est
 * TIRÉ DE L'IDENTIFIANT, jamais au hasard : le même Predict a toujours
 * exactement le même dos.
 * ========================================================================= */

/** Hauteur de référence d'une tranche, quand la niche n'en impose pas. */
export const SPINE_HEIGHT = 172;
/** Un dos est BEAUCOUP plus haut que large : sous un rapport d'environ
 *  1 pour 4, on lit une tuile, pas une tranche. */
const SPINE_MIN_WIDTH = 32;
const SPINE_MAX_WIDTH = 48;

/** Empreinte stable et bornée, tirée de l'identifiant. */
function hash(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return h;
}

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

type SpineSkin = {
  /** Le cuir du dos. */
  cuir: string;
  /** La tranche du bloc de papier, vue de tête. Jamais blanche : un papier
   *  vieilli est ivoire, et un papier blanc pur fait du néon sur l'étagère. */
  papier: string;
  /** Couleur du titre, choisie pour rester lisible sur `cuir`. */
  encre: string;
};

/**
 * Six cuirs, et ce qui compte est qu'ils soient ÉCARTÉS ET ÉTEINTS.
 *
 * Écartés : un oxblood, un bleu, un fauve, un bleu-vert, une encre, un vélin.
 * Trois bruns voisins font une rangée de cartons.
 *
 * Éteints : aucun n'est saturé. Une reliure ancienne est passée — c'est la
 * lumière de la niche qui la réveille, pas le pigment. Des cuirs vifs sur un
 * bois vif donnent une vitrine de bonbons.
 */
function skins(): SpineSkin[] {
  return [
    { cuir: '#6b3330', papier: '#d8cdb4', encre: '#e8dcc4' }, // oxblood
    { cuir: '#3a5261', papier: '#d5cfc0', encre: '#eef3f6' }, // bleu charte éteint
    { cuir: '#7a6242', papier: '#ddd3ba', encre: '#f6efdf' }, // fauve
    { cuir: '#2f4a52', papier: '#d3cfc2', encre: '#e9f1f2' }, // bleu-vert
    { cuir: '#1c2737', papier: '#cec9bc', encre: '#f9fcfe' }, // encre charte
    { cuir: '#b3a689', papier: '#e3dcc8', encre: '#2c2418' }, // vélin
  ];
}

export type BookSpineProps = {
  /** Sert d'empreinte : c'est lui qui fixe l'aspect du dos, pour toujours. */
  id: string;
  /** Écrit de bas en haut sur la tranche, comme un titre de vrai livre. */
  authorName: string;
  authorAvatarUrl?: string | null;
  /** Le livre demande un geste : un liseré doré le détache de la rangée.
   *  PAS une hauteur différente — les livres sont tous à la même hauteur. */
  highlighted?: boolean;
  /** Jamais lu : un clou doré dans le caisson de tête. */
  unread?: boolean;
  /** Hauteur imposée par la niche. Elle vaut pour TOUS les livres. */
  baseHeight?: number;
  colors: Colors;
};

const OR = '#c9a24a';

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

  const caissonTete = Math.round(Math.max(10, Math.min(20, height * 0.07)));
  const caissonPied = Math.round(Math.max(28, Math.min(42, height * 0.17)));
  const medaillon = Math.max(15, Math.min(width - 13, caissonPied - 15));

  return (
    <View style={[styles.enveloppe, { width, height }]}>
      {/* LA TRANCHE DE TÊTE — le bloc de papier, en retrait des plats. Elle
          est posée AU-DESSUS du dos, pas dedans : c'est ce décalage qui fait
          qu'on regarde le livre légèrement de haut, et donc qu'on voit un
          volume plutôt qu'une façade. */}
      <View style={styles.tranche}>
        <Degrade
          sens="h"
          bandes={10}
          etapes={[
            { couleur: melange(skin.papier, '#000000', 0.34), a: 0 },
            { couleur: skin.papier, a: 0.3 },
            { couleur: melange(skin.papier, '#000000', 0.22), a: 1 },
          ]}
        />
      </View>

      <View
        style={[
          styles.dos,
          {
            borderColor: highlighted ? OR : 'transparent',
            borderWidth: highlighted ? 1.5 : 0,
          },
        ]}
      >
        {/* LE BOMBÉ DU DOS. Un dos de livre est CYLINDRIQUE : la lumière vient
            de la gauche, frappe l'arête, glisse en une bande claire un peu
            avant le milieu, puis s'éteint vers le bord droit où le voisin
            fait de l'ombre. Un aplat ne décrit aucune de ces étapes. */}
        <Degrade
          sens="h"
          bandes={18}
          etapes={[
            { couleur: melange(skin.cuir, '#000000', 0.46), a: 0 },
            { couleur: melange(skin.cuir, '#ffe9c9', 0.2), a: 0.18 },
            { couleur: skin.cuir, a: 0.48 },
            { couleur: melange(skin.cuir, '#000000', 0.24), a: 0.78 },
            { couleur: melange(skin.cuir, '#000000', 0.52), a: 1 },
          ]}
        />
        <Grain hauteur={height} />

        {/* LA COIFFE : le cuir qui se replie sur le bloc de papier. */}
        <View style={styles.coiffe} pointerEvents="none" />

        <View style={[styles.caisson, { height: caissonTete }]}>
          {unread && <View style={styles.clou} />}
        </View>

        <Nerf cuir={skin.cuir} />

        {/* LE CAISSON DU TITRE, encadré de ses deux filets d'or — le seul or
            de tout l'objet. `rotate: -90deg` sur un bloc dont on fixe la
            largeur à la hauteur disponible : c'est ce qui permet au texte de
            courir sur toute la tranche au lieu d'être coupé à sa largeur. */}
        <View style={styles.filet} />
        <View style={styles.titreCaisson}>
          <View style={[styles.rotor, { width: Math.max(40, height - caissonTete - caissonPied - 40) }]}>
            <Text style={[styles.titre, { color: skin.encre }]} numberOfLines={1}>
              {authorName}
            </Text>
          </View>
        </View>
        <View style={styles.filet} />

        <Nerf cuir={skin.cuir} />

        <View style={[styles.caisson, { height: caissonPied }]}>
          <Medaillon url={authorAvatarUrl} nom={authorName} taille={medaillon} styles={styles} />
        </View>

        {/* LA COIFFE DE PIED, et les CHASSES : les plats débordent du bloc,
            sur les deux bords. Sans elles le dos est à ras et se lit comme
            une bande découpée. */}
        <View style={styles.coiffeBas} pointerEvents="none" />
        <View style={styles.chasseGauche} pointerEvents="none" />
        <View style={styles.chasseDroite} pointerEvents="none" />
      </View>
    </View>
  );
}

/**
 * UN NERF : la nervure en travers du dos.
 *
 * Trois traits, et l'ordre compte : une arête claire dessus, le renflement du
 * cuir, une ombre dessous. C'est le relief qui vient de la lumière, pas d'une
 * bordure — une simple ligne sombre ne ferait qu'une rayure.
 */
function Nerf({ cuir }: { cuir: string }) {
  return (
    <View style={{ width: '100%' }} pointerEvents="none">
      <View style={{ height: 1, backgroundColor: melange(cuir, '#000000', 0.4) }} />
      <View style={{ height: 1.5, backgroundColor: melange(cuir, '#ffe9c9', 0.34) }} />
      <View style={{ height: 3, backgroundColor: melange(cuir, '#ffe9c9', 0.12) }} />
      <View style={{ height: 2, backgroundColor: melange(cuir, '#000000', 0.34) }} />
    </View>
  );
}

/**
 * LE MÉDAILLON : le portrait de l'auteur au pied du dos.
 *
 * Il ne réutilise pas `<Avatar>` : le repli de celui-ci pose l'initiale sur un
 * fond très pâle, invisible au fond d'une niche sombre. Le jonc est sombre et
 * non doré — un cercle d'or à chaque pied faisait six taches jaunes par
 * étagère, et l'or ne signalait plus rien.
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
  const jonc = taille + 3;
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
 *  d'une graine fixe pour ne pas danser d'un rendu à l'autre. Un cuir
 *  parfaitement lisse est du plastique. */
function Grain({ hauteur }: { hauteur: number }) {
  const filets = useMemo(() => {
    const n = Math.max(6, Math.round(hauteur / 16));
    return Array.from({ length: n }, (_, i) => {
      const x = Math.sin((i + 1) * 91.7) * 43758.5453;
      const r = x - Math.floor(x);
      return { top: `${(i / n) * 100 + r * 3}%`, opacity: 0.03 + r * 0.04, sombre: r > 0.5 };
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
            backgroundColor: f.sombre ? '#000000' : '#ffe9c9',
            opacity: f.opacity,
          }}
        />
      ))}
    </View>
  );
}

function createStyles(colors: Colors) {
  return StyleSheet.create({
    // L'enveloppe porte l'ombre ; le dos porte le cuir. Les séparer permet à
    // la tranche de papier de dépasser en tête sans sortir du cadre coupé.
    enveloppe: {
      boxShadow: [{ offsetX: 2, offsetY: 3, blurRadius: 8, color: 'rgba(10, 7, 5, 0.6)' }],
    },
    tranche: { height: 4, marginHorizontal: 2, overflow: 'hidden' },
    dos: {
      flex: 1,
      overflow: 'hidden',
      alignItems: 'center',
      justifyContent: 'space-between',
      borderTopLeftRadius: 2,
      borderTopRightRadius: 2,
    },

    caisson: { width: '100%', alignItems: 'center', justifyContent: 'center' },
    // Les filets d'or : fins, discrets, et les SEULS de tout l'objet.
    filet: { width: '100%', height: 1, backgroundColor: OR, opacity: 0.55 },
    titreCaisson: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    // Tourné d'un quart de tour vers la gauche : le texte se lit du bas vers
    // le haut, comme sur les reliures françaises.
    rotor: { transform: [{ rotate: '-90deg' }], alignItems: 'center' },
    titre: {
      fontFamily: fonts.display,
      fontSize: 12.5,
      letterSpacing: 0.5,
      textAlign: 'center',
    },

    // Le non-lu : un clou doré planté dans le caisson de tête. Petit, mais
    // c'est le seul point de lumière franche du dos — donc on ne voit que lui.
    clou: {
      width: 5,
      height: 5,
      borderRadius: 2.5,
      backgroundColor: OR,
      boxShadow: [{ offsetX: 0, offsetY: 0, blurRadius: 4, color: 'rgba(201, 162, 74, 0.9)' }],
    },

    jonc: {
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'rgba(10, 7, 5, 0.55)',
    },
    portrait: { backgroundColor: '#2a211b' },
    initialeFond: { backgroundColor: '#cabca0', alignItems: 'center', justifyContent: 'center' },
    initiale: { color: '#2c2418', fontWeight: '800', fontFamily: fonts.display },

    coiffe: {
      position: 'absolute',
      left: 0,
      right: 0,
      top: 0,
      height: 2,
      backgroundColor: 'rgba(10, 7, 5, 0.5)',
    },
    coiffeBas: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      height: 2,
      backgroundColor: 'rgba(10, 7, 5, 0.5)',
    },
    chasseGauche: {
      position: 'absolute',
      top: 0,
      bottom: 0,
      left: 0,
      width: 1,
      backgroundColor: 'rgba(255, 233, 201, 0.16)',
    },
    chasseDroite: {
      position: 'absolute',
      top: 0,
      bottom: 0,
      right: 0,
      width: 1.5,
      backgroundColor: 'rgba(10, 7, 5, 0.5)',
    },
  });
}
