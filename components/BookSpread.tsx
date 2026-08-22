import { useMemo, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

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

      {/* LA COUVERTURE — elle déborde le bloc-papier de trois pixels. */}
      <View style={styles.couverture}>
        <View style={styles.blocPapier}>
          <View style={styles.page}>
            {/* Tranche extérieure : les feuillets empilés qu'on voit par la
                gouttière du côté opposé à la reliure. */}
            <View style={[styles.trancheGauche]} pointerEvents="none" />
            <View style={styles.pageContenu}>{left}</View>
          </View>

          {/* LA RELIURE — deux dégradés symétriques qui creusent le pli, et
              la couture au milieu. */}
          <View style={styles.gouttiere} pointerEvents="none">
            <Ombre inverse />
            <View style={styles.couture} />
            <Ombre />
          </View>

          <View style={styles.page}>
            <View style={styles.pageContenu}>{right}</View>
            <View style={[styles.trancheDroite]} pointerEvents="none" />
          </View>
        </View>
      </View>
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
            style={{ flex: 1, backgroundColor: '#1c2737', opacity: 0.02 + t * t * 0.24 }}
          />
        );
      })}
    </View>
  );
}

function createStyles(colors: Colors) {
  const sombre = colors.background === '#1c2737';
  const papier = sombre ? '#22303f' : '#fbfdfe';
  const couverture = sombre ? '#3f5e6c' : '#3f5e6c';
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
      padding: 3,
      boxShadow: [{ offsetX: 0, offsetY: 6, blurRadius: 16, color: 'rgba(20, 29, 40, 0.32)' }],
    },
    blocPapier: { flexDirection: 'row', backgroundColor: papier, minHeight: 260 },
    page: { flex: 1, flexDirection: 'row' },
    pageContenu: { flex: 1, padding: 14, gap: 8 },
    // Les feuillets vus par la tranche : trois traits, du plus clair au plus
    // marqué, côté opposé à la reliure.
    trancheGauche: { width: 3, backgroundColor: colors.border, opacity: 0.7 },
    trancheDroite: { width: 3, backgroundColor: colors.border, opacity: 0.7 },
    gouttiere: { width: 32, flexDirection: 'row' },
    couture: { width: 1, backgroundColor: '#1c2737', opacity: 0.28 },
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
