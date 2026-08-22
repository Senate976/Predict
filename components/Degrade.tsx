import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

/* ===========================================================================
 * LE DÉGRADÉ
 *
 * Ce fichier existe parce que tout le reste en dépend. Sans dégradé, chaque
 * pièce est un aplat, et un aplat n'a pas de relief : c'est une case. Une
 * surface réelle prend la lumière d'un côté, la perd de l'autre, et c'est ce
 * glissement — pas une bordure — qui fait qu'on lit un volume.
 *
 * Aucune bibliothèque tierce, aucune image : on empile des bandes dont la
 * couleur est vraiment interpolée. Vingt bandes suffisent à ce qu'aucune
 * marche ne se voie, et ça reste trois fois moins de vues qu'une ombre portée
 * dessinée à la main.
 * ========================================================================= */

export type Etape = { couleur: string; a: number };

/** Mélange deux couleurs hexadécimales (#rrggbb). */
export function melange(a: string, b: string, t: number): string {
  const lire = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const [ar, ag, ab] = lire(a);
  const [br, bg, bb] = lire(b);
  const c = (x: number, y: number) =>
    Math.round(x + (y - x) * t)
      .toString(16)
      .padStart(2, '0');
  return `#${c(ar, br)}${c(ag, bg)}${c(ab, bb)}`;
}

/** La couleur d'un dégradé à la position `t`, en respectant ses étapes. */
function couleurA(etapes: Etape[], t: number): string {
  for (let i = 0; i < etapes.length - 1; i++) {
    const g = etapes[i];
    const d = etapes[i + 1];
    if (t >= g.a && t <= d.a) {
      const local = d.a === g.a ? 0 : (t - g.a) / (d.a - g.a);
      return melange(g.couleur, d.couleur, local);
    }
  }
  return etapes[etapes.length - 1].couleur;
}

/**
 * Un dégradé, horizontal ou vertical, posé en fond de son parent.
 *
 * `bandes` fixe la douceur : au-delà d'une vingtaine, on ne distingue plus
 * les marches à l'œil, en dessous d'une dizaine on les compte.
 */
export function Degrade({
  etapes,
  sens = 'h',
  bandes = 22,
  style,
}: {
  etapes: Etape[];
  sens?: 'h' | 'v';
  bandes?: number;
  style?: object;
}) {
  const couleurs = useMemo(
    () => Array.from({ length: bandes }, (_, i) => couleurA(etapes, i / (bandes - 1))),
    [etapes, bandes]
  );

  return (
    <View
      style={[StyleSheet.absoluteFill, { flexDirection: sens === 'h' ? 'row' : 'column' }, style]}
      pointerEvents="none"
    >
      {couleurs.map((c, i) => (
        <View key={i} style={{ flex: 1, backgroundColor: c }} />
      ))}
    </View>
  );
}
