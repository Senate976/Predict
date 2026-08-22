import { useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from './Text';

import { BookSpine, SPINE_HEIGHT } from './BookArt';
import type { ShelfBook } from './Bookshelf';
import { fonts, type Colors } from '../lib/theme';
import { useColors } from '../lib/themeMode';

/* ===========================================================================
 * LE MEUBLE
 *
 * Quatre caissons juxtaposés ne font pas une bibliothèque : ils font quatre
 * boîtes. Ce qui fait le meuble, c'est ce qu'il y a AUTOUR et ENTRE — une
 * corniche moulurée en tête, deux montants qui descendent d'un seul tenant,
 * un montant central, des tablettes dont on voit le chant et l'épaisseur, une
 * plinthe qui pose l'ensemble au sol. Chacune de ces pièces est dessinée ici.
 *
 * LA MATIÈRE. La charte n'a pas de brun, et on n'en invente pas : le bâti est
 * en bleu ardoise (#426170), laqué sombre, avec des filets de LAITON (#eca835)
 * à la corniche et à la plinthe. C'est un meuble de bibliothèque anglaise, pas
 * une étagère de cuisine — et ça se tient avec la palette existante.
 *
 * LA PROFONDEUR se joue sur trois plans, toujours dans cet ordre :
 *   fond (le plus sombre, on ne le touche jamais)
 *   → livres
 *   → bois (le plus clair, ce qui prend la lumière).
 * Une pièce de bois qui passerait derrière un livre casserait l'illusion.
 *
 * LES MOULURES. Une corniche n'est pas une barre : c'est un empilement de
 * bandes de hauteurs et de tons différents, dont l'œil lit le relief. Les cinq
 * bandes ci-dessous sont ce profil, de la lumière du dessus jusqu'à l'ombre
 * portée en dessous.
 * ========================================================================= */

/** Les bois, du plus éclairé au plus sombre. */
function bois(colors: Colors) {
  const sombre = colors.background === '#1c2737';
  return {
    lumiere: sombre ? '#6e93a1' : '#5f8593',
    clair: sombre ? '#537888' : '#4d6f7d',
    corps: sombre ? '#456876' : '#426170',
    ombre: sombre ? '#2c4652' : '#2b4450',
    nuit: '#1c2737',
    laiton: '#eca835',
  };
}

export type LibraryBay = {
  key: string;
  /** Gravé sur la plaque de laiton, au chant de la tablette. */
  label: string;
  books: ShelfBook[];
  emptyLabel: string;
  onPressMore: () => void;
};

export function Library({
  bays,
  onPressBook,
  maxVisible = 4,
}: {
  /** Quatre, dans l'ordre de lecture : haut-gauche, haut-droite, bas-gauche,
   *  bas-droite. */
  bays: LibraryBay[];
  onPressBook: (id: string) => void;
  maxVisible?: number;
}) {
  const colors = useColors();
  const b = useMemo(() => bois(colors), [colors]);
  const styles = useMemo(() => createStyles(colors, b), [colors, b]);

  const rangee = (gauche: LibraryBay, droite: LibraryBay) => (
    <View style={styles.rangee}>
      <Bay bay={gauche} styles={styles} colors={colors} onPressBook={onPressBook} maxVisible={maxVisible} />
      {/* Le montant central : une vraie pièce de bois, avec son arête
          éclairée à gauche et son ombre à droite. Un simple trait ne
          soutiendrait rien. */}
      <View style={styles.montant}>
        <View style={styles.montantLumiere} />
        <View style={styles.montantOmbre} />
      </View>
      <Bay bay={droite} styles={styles} colors={colors} onPressBook={onPressBook} maxVisible={maxVisible} />
    </View>
  );

  /** La tablette : chant clair dessus (elle prend la lumière), corps épais,
   *  ombre portée dessous. C'est l'épaisseur qui la fait exister. */
  const tablette = (gauche: string, droite: string) => (
    <View style={styles.tablette}>
      <View style={styles.tabletteChant} />
      <View style={styles.tabletteCorps}>
        {/* Les deux plaques de laiton, gravées, chacune centrée sur son
            caisson — c'est là qu'on lit ce que le rayon contient, comme dans
            une vraie bibliothèque. */}
        <View style={styles.plaqueZone}>
          <Plaque texte={gauche} styles={styles} />
        </View>
        <View style={styles.plaqueZoneMilieu} />
        <View style={styles.plaqueZone}>
          <Plaque texte={droite} styles={styles} />
        </View>
      </View>
      <View style={styles.tabletteOmbre} />
    </View>
  );

  return (
    <View style={styles.meuble}>
      {/* LA CORNICHE — cinq bandes, de la lumière du dessus à l'ombre portée. */}
      <View style={styles.corniche}>
        <View style={styles.cornicheArete} />
        <View style={styles.cornicheCouronne} />
        <View style={styles.cornicheDoucine} />
        <View style={styles.filet} />
        <View style={styles.cornicheGorge} />
        <View style={styles.cornicheAstragale} />
        <View style={styles.filetFin} />
      </View>

      {/* LE CORPS — les montants latéraux sont le fond de ce bloc, que le
          contenu ne recouvre pas grâce au retrait horizontal. */}
      <View style={styles.corps}>
        <View style={[styles.montantBord, { left: 9 }]} pointerEvents="none" />
        <View style={[styles.montantBord, { right: 9 }]} pointerEvents="none" />
        {bays.length >= 2 && rangee(bays[0], bays[1])}
        {bays.length >= 2 && tablette(bays[0].label, bays[1].label)}
        {bays.length >= 4 && rangee(bays[2], bays[3])}
        {bays.length >= 4 && tablette(bays[2].label, bays[3].label)}
      </View>

      {/* LA PLINTHE — le meuble pose au sol ; sans elle il flotte. */}
      <View style={styles.plinthe}>
        <View style={styles.filet} />
        <View style={styles.plintheHaut} />
        <View style={styles.plintheBas} />
      </View>
    </View>
  );
}

/** Un caisson : le fond sombre, l'ombre que la tablette du dessus y jette,
 *  et les livres posés au fond de la niche. */
function Bay({
  bay,
  styles,
  colors,
  onPressBook,
  maxVisible,
}: {
  bay: LibraryBay;
  styles: ReturnType<typeof createStyles>;
  colors: Colors;
  onPressBook: (id: string) => void;
  maxVisible: number;
}) {
  const visibles = bay.books.slice(0, maxVisible);
  const reste = bay.books.length - visibles.length;

  return (
    <View style={styles.caisson}>
      <View style={styles.fond} pointerEvents="none" />
      {/* L'ombre portée de la tablette du dessus, sur le fond : c'est elle
          qui creuse la niche. Sans elle, le fond est un aplat. */}
      <View style={styles.fondOmbre} pointerEvents="none" />
      {/* Le plateau vu DANS la niche : un filet clair au ras du fond, sur
          lequel les livres reposent. Sans lui ils flottent devant un mur. */}
      <View style={styles.plateau} pointerEvents="none" />

      {bay.books.length === 0 ? (
        <View style={styles.vide}>
          <Text style={styles.videTexte} numberOfLines={2}>
            {bay.emptyLabel}
          </Text>
        </View>
      ) : (
        <View style={styles.rangeeLivres}>
          {visibles.map((book) => (
            <Pressable
              key={book.id}
              onPress={() => onPressBook(book.id)}
              accessibilityRole="button"
              accessibilityLabel={`Ouvrir le livre de ${book.authorName}`}
            >
              <BookSpine
                id={book.id}
                authorName={book.authorName}
                authorAvatarUrl={book.authorAvatarUrl}
                highlighted={book.highlighted}
                unread={book.unread}
                colors={colors}
              />
            </Pressable>
          ))}

          {reste > 0 && (
            <Pressable
              onPress={bay.onPressMore}
              style={styles.serreLivres}
              accessibilityRole="button"
              accessibilityLabel={`Voir les ${reste} autres`}
            >
              <Text style={styles.serreSigne}>+</Text>
              <Text style={styles.serreCompte}>{reste}</Text>
            </Pressable>
          )}
        </View>
      )}
    </View>
  );
}

/** La plaque de laiton gravée, vissée au chant de la tablette. */
function Plaque({ texte, styles }: { texte: string; styles: ReturnType<typeof createStyles> }) {
  return (
    <View style={styles.plaque}>
      <Text style={styles.plaqueTexte} numberOfLines={1}>
        {texte.toUpperCase()}
      </Text>
    </View>
  );
}

function createStyles(colors: Colors, b: ReturnType<typeof bois>) {
  return StyleSheet.create({
    meuble: {
      borderRadius: 6,
      overflow: 'hidden',
      backgroundColor: b.corps,
      boxShadow: [{ offsetX: 0, offsetY: 8, blurRadius: 18, color: 'rgba(28, 39, 55, 0.30)' }],
    },

    /* --- corniche ------------------------------------------------------ */
    corniche: { width: '100%' },
    // Le profil, du haut vers le bas : arête éclairée, couronne, doucine plus
    // sombre, filet de laiton, gorge en pleine ombre, astragale qui rattrape
    // la lumière, filet fin. Sept bandes — c'est le nombre qu'il faut pour
    // qu'une corniche cesse de se lire comme une barre.
    cornicheArete: { height: 4, backgroundColor: b.lumiere },
    cornicheCouronne: { height: 11, backgroundColor: b.corps },
    cornicheDoucine: { height: 5, backgroundColor: b.clair, opacity: 0.55 },
    filet: { height: 2, backgroundColor: b.laiton, opacity: 0.85 },
    filetFin: { height: 1, backgroundColor: b.laiton, opacity: 0.4 },
    cornicheGorge: { height: 8, backgroundColor: b.ombre },
    cornicheAstragale: { height: 5, backgroundColor: b.clair },

    /* --- corps : le retrait horizontal EST le montant latéral ---------- */
    corps: { paddingHorizontal: 11, position: 'relative' },
    // L'arête intérieure de chaque montant latéral : deux filets clairs qui
    // longent le meuble sur toute sa hauteur. C'est ce qui fait lire deux
    // pièces de bois debout, et non une marge.
    montantBord: { position: 'absolute', top: 0, bottom: 0, width: 2, backgroundColor: b.lumiere, opacity: 0.4 },

    rangee: { flexDirection: 'row', alignItems: 'stretch' },

    montant: { width: 10, flexDirection: 'row', backgroundColor: b.corps },
    montantLumiere: { width: 2, backgroundColor: b.lumiere, opacity: 0.5 },
    montantOmbre: { flex: 1, backgroundColor: b.ombre, opacity: 0.55 },

    /* --- un caisson ---------------------------------------------------- */
    caisson: {
      flex: 1,
      minHeight: SPINE_HEIGHT + 24,
      justifyContent: 'flex-end',
      paddingTop: 12,
      paddingHorizontal: 6,
      paddingBottom: 3,
    },
    fond: {
      position: 'absolute',
      left: 0,
      right: 0,
      top: 0,
      bottom: 0,
      backgroundColor: b.nuit,
      opacity: 0.92,
    },
    fondOmbre: {
      position: 'absolute',
      left: 0,
      right: 0,
      top: 0,
      height: 26,
      backgroundColor: '#000',
      opacity: 0.35,
    },
    plateau: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      height: 3,
      backgroundColor: b.clair,
      opacity: 0.75,
    },
    rangeeLivres: { flexDirection: 'row', alignItems: 'flex-end', gap: 3 },
    vide: { minHeight: SPINE_HEIGHT, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 },
    videTexte: {
      fontFamily: fonts.label,
      fontSize: 12,
      color: 'rgba(122, 184, 194, 0.55)',
      textAlign: 'center',
    },

    serreLivres: {
      width: 32,
      height: SPINE_HEIGHT - 34,
      borderRadius: 3,
      borderWidth: 1.5,
      borderStyle: 'dashed',
      borderColor: b.laiton,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 2,
      opacity: 0.9,
    },
    serreSigne: { fontFamily: fonts.display, fontSize: 19, color: b.laiton, lineHeight: 21 },
    serreCompte: { fontFamily: fonts.label, fontSize: 11, color: b.laiton },

    /* --- tablette ------------------------------------------------------ */
    tablette: { width: '100%' },
    tabletteChant: { height: 2, backgroundColor: b.lumiere },
    tabletteCorps: {
      height: 22,
      backgroundColor: b.corps,
      flexDirection: 'row',
      alignItems: 'center',
    },
    tabletteOmbre: { height: 3, backgroundColor: b.ombre },
    plaqueZone: { flex: 1, alignItems: 'center' },
    plaqueZoneMilieu: { width: 10 },
    plaque: {
      backgroundColor: b.laiton,
      borderRadius: 2,
      paddingHorizontal: 10,
      paddingVertical: 2,
      borderWidth: 1,
      borderColor: 'rgba(28, 39, 55, 0.35)',
    },
    plaqueTexte: {
      fontFamily: fonts.label,
      fontSize: 10,
      letterSpacing: 1.2,
      color: '#1c2737',
      fontWeight: '700',
    },

    /* --- plinthe ------------------------------------------------------- */
    plinthe: { width: '100%' },
    plintheHaut: { height: 6, backgroundColor: b.clair },
    plintheBas: { height: 14, backgroundColor: b.ombre },
  });
}
