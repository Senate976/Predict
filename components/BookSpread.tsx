import { useMemo, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { Degrade, melange } from './Degrade';
import { fonts, type Colors } from '../lib/theme';
import { useColors } from '../lib/themeMode';

/* ===========================================================================
 * LE LIVRE OUVERT
 *
 * Une double page : à gauche qui parle, à droite ce qui est dit. Entre les
 * deux, la reliure — et c'est elle qui fait l'objet. Deux rectangles côte à
 * côte donnent deux cartes ; ce qui les transforme en livre, c'est :
 *
 *   1. LA GOUTTIÈRE. Au centre, le papier s'enfonce vers la couture : une
 *      ombre qui s'assombrit en approchant du pli, symétrique de part et
 *      d'autre. C'est le seul endroit d'un livre ouvert qu'on ne voit jamais
 *      à plat.
 *   2. LA TRANCHE DES PAGES. Sur les bords extérieurs, les feuillets empilés
 *      dessous dépassent en fins traits clairs : le livre a une épaisseur.
 *   3. LA COUVERTURE qui dépasse du bloc-papier, tout autour, comme une
 *      reliure déborde toujours ses pages.
 *
 * La couleur du papier vient de la charte (le fond clair), la couverture du
 * bleu ardoise du meuble : le livre sort de la bibliothèque, il en a le bois.
 * ========================================================================= */

export function BookSpread({
  left,
  right,
  /** Feuillets glissés dessous, qui dépassent en éventail — les photos. */
  underPages = 0,
}: {
  left: ReactNode;
  right: ReactNode;
  underPages?: number;
}) {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={styles.livre}>
      {/* Les feuillets dessous, décalés : ils disent qu'il reste des pages. */}
      {Array.from({ length: Math.min(underPages, 3) }, (_, i) => (
        <View
          key={i}
          style={[
            styles.feuillet,
            { top: 6 + i * 5, bottom: -(6 + i * 5), left: 6 + i * 5, right: 6 + i * 5 },
          ]}
          pointerEvents="none"
        />
      ))}

      {/* LA COUVERTURE — galbée elle aussi : le cuir accroche la lumière au
          bord et s'assombrit vers la reliure, des deux côtés. */}
      <View style={styles.couverture}>
        <Degrade
          sens="h"
          bandes={20}
          etapes={[
            { couleur: melange(COUV, '#ffffff', 0.14), a: 0 },
            { couleur: COUV, a: 0.2 },
            { couleur: melange(COUV, '#000000', 0.3), a: 0.5 },
            { couleur: COUV, a: 0.8 },
            { couleur: melange(COUV, '#ffffff', 0.14), a: 1 },
          ]}
        />

        <View style={styles.blocPapier}>
          <Tranche cote="gauche" styles={styles} />

          <View style={styles.page}>
            {/* Le papier n'est pas blanc partout : il s'éteint vers la
                reliure, où la page plonge. */}
            <Degrade
              sens="h"
              bandes={16}
              etapes={[
                { couleur: PAPIER, a: 0 },
                { couleur: PAPIER, a: 0.55 },
                { couleur: melange(PAPIER, '#3a2413', 0.12), a: 1 },
              ]}
            />
            <View style={styles.pageContenu}>{left}</View>
          </View>

          {/* LA RELIURE — deux creux symétriques et la couture. */}
          <View style={styles.gouttiere} pointerEvents="none">
            <Ombre inverse />
            <View style={styles.couture} />
            <Ombre />
          </View>

          <View style={styles.page}>
            <Degrade
              sens="h"
              bandes={16}
              etapes={[
                { couleur: melange(PAPIER, '#3a2413', 0.12), a: 0 },
                { couleur: PAPIER, a: 0.45 },
                { couleur: PAPIER, a: 1 },
              ]}
            />
            <View style={styles.pageContenu}>{right}</View>
          </View>

          <Tranche cote="droite" styles={styles} />
        </View>
      </View>
    </View>
  );
}

/**
 * La tranche du bloc-papier : les feuillets empilés, vus par le côté.
 *
 * Un trait unique donnait un liseré. Ce sont des dizaines de feuilles : des
 * traits alternés, clairs et sombres, d'épaisseurs inégales. C'est ce qui
 * fait qu'un livre a une ÉPAISSEUR et non un contour.
 */
function Tranche({ cote, styles }: { cote: 'gauche' | 'droite'; styles: ReturnType<typeof createStyles> }) {
  const feuilles = [0.55, 0.15, 0.4, 0.1, 0.5, 0.2, 0.35];
  const ordre = cote === 'gauche' ? feuilles : [...feuilles].reverse();
  return (
    <View style={styles.tranche} pointerEvents="none">
      {ordre.map((o, i) => (
        <View key={i} style={{ flex: 1, backgroundColor: '#3a2413', opacity: o * 0.35 }} />
      ))}
    </View>
  );
}

/** Le creux du papier près du pli : six bandes dont l'opacité monte. */
function Ombre({ inverse = false }: { inverse?: boolean }) {
  const bandes = 7;
  return (
    <View style={{ flexDirection: 'row', flex: 1 }} pointerEvents="none">
      {Array.from({ length: bandes }, (_, i) => {
        const t = inverse ? (i + 1) / bandes : (bandes - i) / bandes;
        return (
          <View
            key={i}
            style={{ flex: 1, backgroundColor: '#3a2413', opacity: 0.02 + t * t * 0.24 }}
          />
        );
      })}
    </View>
  );
}

/** Le papier et le cuir. Fixes : un livre garde sa matière quel que soit le
 *  thème — c'est un objet, pas une surface d'interface. */
const PAPIER = '#fbf7ee';
const COUV = '#5c2d2b';

function createStyles(colors: Colors) {
  const papier = PAPIER;
  const couverture = COUV;
  return StyleSheet.create({
    livre: { width: '100%' },
    feuillet: {
      position: 'absolute',
      backgroundColor: papier,
      borderWidth: 1,
      borderColor: colors.border,
      opacity: 0.55,
    },
    couverture: {
      backgroundColor: couverture,
      padding: 5,
      boxShadow: [{ offsetX: 0, offsetY: 6, blurRadius: 16, color: 'rgba(20, 29, 40, 0.32)' }],
    },
    blocPapier: { flexDirection: 'row', backgroundColor: papier, minHeight: 260 },
    page: { flex: 1, flexDirection: 'row' },
    pageContenu: { flex: 1, padding: 14, gap: 8 },
    tranche: { width: 7, flexDirection: 'row' },
    gouttiere: { width: 32, flexDirection: 'row' },
    couture: { width: 1, backgroundColor: '#3a2413', opacity: 0.28 },
  });
}

/** Le filet doré et les petites capitales des intitulés d'une page. */
export function pageStyles(colors: Colors) {
  return StyleSheet.create({
    eyebrow: {
      fontFamily: fonts.label,
      fontSize: 10,
      letterSpacing: 1.4,
      color: colors.textFaint,
      textTransform: 'uppercase',
    },
    filet: { height: 1, backgroundColor: colors.accent, opacity: 0.5, marginVertical: 6 },
  });
}
