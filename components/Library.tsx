import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from './Text';

import { BookSpine } from './BookArt';
import type { ShelfBook } from './Bookshelf';
import { fonts, type Colors } from '../lib/theme';
import { useColors } from '../lib/themeMode';

/* ===========================================================================
 * LE MEUBLE
 *
 * Un meuble de bibliothèque, pas une étagère : massif, mouluré, posé sur ses
 * pieds. Tout est dessiné en aplats superposés — aucune image, donc rien à
 * charger et rien qui pixellise.
 *
 * CE QUI SÉPARE LE BOIS DU MÉTAL, et c'est tout l'objet de ce fichier :
 *
 * 1. LE NOMBRE DE BANDES. Une moulure n'a pas d'arête franche : c'est une
 *    courbe. On l'obtient en empilant beaucoup de bandes fines dont le ton
 *    glisse progressivement (`moulure` plus bas). Cinq bandes larges donnent
 *    un profilé d'aluminium ; quinze bandes fines donnent une doucine.
 *
 * 2. LE VEINAGE. Du bois n'est jamais d'un ton uniforme. `Veinage` pose des
 *    filets verticaux d'opacité et de largeur irrégulières — irrégulières,
 *    mais TIRÉES D'UNE GRAINE, donc stables d'un rendu à l'autre.
 *
 * 3. LES CANNELURES. Deux pilastres cannelés encadrent le meuble. C'est le
 *    détail qui dit « menuiserie » plus sûrement que n'importe quel autre :
 *    une gorge, c'est une ombre et une lumière côte à côte.
 *
 * 4. LES PIEDS. Un meuble noble ne repose pas sur une planche : il a des
 *    pieds, et une découpe entre eux qui laisse voir le sol.
 *
 * 5. AUCUN ANGLE ARRONDI. Le rayon de bordure est la signature du mobilier
 *    industriel contemporain. Ici tout est d'équerre.
 *
 * LA PROFONDEUR se joue toujours dans cet ordre : fond (le plus sombre, on ne
 * le touche jamais) → livres → bois (le plus clair, ce qui prend la lumière).
 * ========================================================================= */

function bois(colors: Colors) {
  const sombre = colors.background === '#1c2737';
  return {
    vif: sombre ? '#7d9fac' : '#6d919f',
    lumiere: sombre ? '#658c9a' : '#5b8290',
    clair: sombre ? '#4f7482' : '#4a6c7a',
    corps: sombre ? '#436574' : '#3f5e6c',
    creux: sombre ? '#35525f' : '#334d59',
    ombre: sombre ? '#294049' : '#263b45',
    nuit: '#141d28',
    laiton: '#eca835',
    laitonMat: '#b9832a',
  };
}

/** Empreinte stable : le veinage ne doit pas danser d'un rendu à l'autre. */
function grain(i: number, graine: number): number {
  const x = Math.sin((i + 1) * 12.9898 + graine * 78.233) * 43758.5453;
  return x - Math.floor(x);
}

/**
 * Le veinage du bois : des filets verticaux, plus ou moins larges, plus ou
 * moins marqués. C'est ce qui empêche un aplat de se lire comme de la tôle.
 */
function Veinage({ graine, opacite = 1 }: { graine: number; opacite?: number }) {
  const filets = useMemo(
    () =>
      Array.from({ length: 26 }, (_, i) => ({
        left: `${grain(i, graine) * 100}%`,
        width: 0.5 + grain(i + 40, graine) * 2.2,
        opacity: (0.04 + grain(i + 80, graine) * 0.09) * opacite,
        sombre: grain(i + 120, graine) > 0.45,
      })),
    [graine, opacite]
  );
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {filets.map((f, i) => (
        <View
          key={i}
          style={{
            position: 'absolute',
            top: 0,
            bottom: 0,
            left: f.left as `${number}%`,
            width: f.width,
            backgroundColor: f.sombre ? '#0d141c' : '#cfe4ea',
            opacity: f.opacity,
          }}
        />
      ))}
    </View>
  );
}

/** Mélange deux couleurs hexadécimales. */
function melange(a: string, b: string, t: number): string {
  const lire = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const [ar, ag, ab] = lire(a);
  const [br, bg, bb] = lire(b);
  const c = (x: number, y: number) => Math.round(x + (y - x) * t).toString(16).padStart(2, '0');
  return `#${c(ar, br)}${c(ag, bg)}${c(ab, bb)}`;
}

/**
 * Une moulure : `n` bandes fines dont le ton glisse de `de` vers `vers`.
 *
 * Les couleurs sont VRAIMENT interpolées, pas simulées en empilant des
 * opacités : l'empilement laissait voir chaque bande, ce qui striait la
 * corniche au lieu de l'arrondir. Une moulure, c'est une courbe — donc un
 * dégradé continu, et c'est le nombre de bandes qui décide de sa douceur.
 */
function Moulure({
  de,
  vers,
  bandes,
  epaisseur,
}: {
  de: string;
  vers: string;
  bandes: number;
  epaisseur: number;
}) {
  return (
    <View pointerEvents="none">
      {Array.from({ length: bandes }, (_, i) => (
        <View
          key={i}
          style={{ height: epaisseur, backgroundColor: melange(de, vers, i / (bandes - 1 || 1)) }}
        />
      ))}
    </View>
  );
}

/** Un pilastre cannelé : trois gorges, chacune une ombre doublée d'une
 *  lumière. C'est le détail qui dit « menuiserie ». */
function Pilastre({ b, largeur }: { b: ReturnType<typeof bois>; largeur: number }) {
  const gorges = [0.26, 0.5, 0.74];
  return (
    <View style={{ width: largeur, backgroundColor: b.corps }}>
      <Veinage graine={3} />
      {gorges.map((x, i) => (
        <View key={i} style={StyleSheet.absoluteFill} pointerEvents="none">
          <View
            style={{
              position: 'absolute',
              top: 0,
              bottom: 0,
              left: largeur * x - 2,
              width: 2,
              backgroundColor: b.ombre,
              opacity: 0.85,
            }}
          />
          <View
            style={{
              position: 'absolute',
              top: 0,
              bottom: 0,
              left: largeur * x,
              width: 1.5,
              backgroundColor: b.vif,
              opacity: 0.5,
            }}
          />
        </View>
      ))}
    </View>
  );
}

export type LibraryBay = {
  key: string;
  label: string;
  books: ShelfBook[];
  emptyLabel: string;
  onPressMore: () => void;
};

const PILASTRE = 16;
const TABLETTE = 26;
const CORNICHE = 52;
const PIEDS = 34;

export function Library({
  bays,
  onPressBook,
  maxVisible = 4,
}: {
  bays: LibraryBay[];
  onPressBook: (id: string) => void;
  maxVisible?: number;
}) {
  const colors = useColors();
  const b = useMemo(() => bois(colors), [colors]);
  const styles = useMemo(() => createStyles(colors, b), [colors, b]);

  /* Le meuble prend toute la hauteur qu'on lui laisse. Les niches se
     partagent ce qui reste une fois la corniche, les deux tablettes et les
     pieds déduits — et c'est cette hauteur de niche qui fixe la taille des
     livres, sans quoi des tranches figées laisseraient un vide sous le
     plafond sur les grands écrans. */
  const [hauteur, setHauteur] = useState(0);
  const dispo = Math.max(0, hauteur - CORNICHE - 2 * TABLETTE - PIEDS);
  const niche = dispo > 0 ? dispo / 2 : 0;
  /* Bornée par le HAUT : sans plafond, une grande niche étirait les tranches
     en lanières de 1 pour 15. Un livre reste un livre — au-delà d'environ
     1 pour 6, l'œil ne lit plus un dos mais une bande de couleur. Ce qui
     reste au-dessus devient du dégagement, ce qu'une étagère haute a de
     toute façon. */
  const tailleLivre = niche > 0 ? Math.min(236, Math.max(110, Math.round(niche - 40))) : 0;

  const rangee = (gauche: LibraryBay, droite: LibraryBay) => (
    <View style={[styles.rangee, niche > 0 && { height: niche }]}>
      <Bay bay={gauche} styles={styles} colors={colors} b={b}
        onPressBook={onPressBook} maxVisible={maxVisible} tailleLivre={tailleLivre} />
      {/* Le montant central : une vraie pièce debout, cannelée comme les
          pilastres, avec son arête éclairée. */}
      <View style={styles.montant}>
        <Veinage graine={7} />
        <View style={styles.montantArete} pointerEvents="none" />
        <View style={styles.montantOmbre} pointerEvents="none" />
      </View>
      <Bay bay={droite} styles={styles} colors={colors} b={b}
        onPressBook={onPressBook} maxVisible={maxVisible} tailleLivre={tailleLivre} />
    </View>
  );

  /** La tablette, vue de face : un chant mouluré, le corps du bois, et
   *  l'ombre qu'elle jette dans la niche du dessous. */
  const tablette = (gauche: string, droite: string) => (
    <View style={styles.tablette}>
      <View style={styles.tabletteNez} />
      <View style={styles.tabletteCorps}>
        <Veinage graine={11} opacite={0.7} />
        <View style={styles.plaqueZone}>
          <Plaque texte={gauche} styles={styles} />
        </View>
        <View style={{ width: PILASTRE }} />
        <View style={styles.plaqueZone}>
          <Plaque texte={droite} styles={styles} />
        </View>
      </View>
      <Moulure de={b.creux} vers={b.ombre} bandes={4} epaisseur={1} />
    </View>
  );

  return (
    <View style={styles.meuble} onLayout={(e) => setHauteur(e.nativeEvent.layout.height)}>
      {/* LA CORNICHE — quatre moulures enchaînées, deux filets de laiton.
          C'est la pièce qui donne sa noblesse au meuble : on la voit avant
          tout le reste. */}
      <View style={styles.corniche}>
        <Veinage graine={2} opacite={0.8} />
        <Moulure de={b.vif} vers={b.corps} bandes={7} epaisseur={1.5} />
        <View style={styles.filet} />
        <Moulure de={b.clair} vers={b.creux} bandes={8} epaisseur={1.5} />
        <View style={styles.filetFin} />
        <Moulure de={b.ombre} vers={b.clair} bandes={6} epaisseur={1.5} />
        <View style={styles.cornicheAssise} />
      </View>

      <View style={styles.corps}>
        <Pilastre b={b} largeur={PILASTRE} />
        <View style={styles.interieur}>
          {bays.length >= 2 && rangee(bays[0], bays[1])}
          {bays.length >= 2 && tablette(bays[0].label, bays[1].label)}
          {bays.length >= 4 && rangee(bays[2], bays[3])}
          {bays.length >= 4 && tablette(bays[2].label, bays[3].label)}
        </View>
        <Pilastre b={b} largeur={PILASTRE} />
      </View>

      {/* LES PIEDS — une ceinture moulurée, puis deux pieds découpés avec le
          jour entre eux. Sans ce jour, le meuble repose sur une planche ;
          avec, il pose sur le sol. */}
      <View style={styles.ceinture}>
        <Moulure de={b.clair} vers={b.corps} bandes={5} epaisseur={1.4} />
        <View style={styles.ceintureCorps}>
          <Veinage graine={17} opacite={0.6} />
        </View>
      </View>
      <View style={styles.pieds}>
        <View style={styles.pied}>
          <Veinage graine={23} opacite={0.5} />
        </View>
        <View style={styles.jour} />
        <View style={styles.pied}>
          <Veinage graine={29} opacite={0.5} />
        </View>
      </View>
    </View>
  );
}

function Bay({
  bay,
  styles,
  colors,
  b,
  onPressBook,
  maxVisible,
  tailleLivre,
}: {
  bay: LibraryBay;
  styles: ReturnType<typeof createStyles>;
  colors: Colors;
  b: ReturnType<typeof bois>;
  onPressBook: (id: string) => void;
  maxVisible: number;
  tailleLivre: number;
}) {
  const visibles = bay.books.slice(0, maxVisible);
  const reste = bay.books.length - visibles.length;

  return (
    <View style={styles.caisson}>
      <View style={styles.fond} pointerEvents="none" />
      {/* Le fond de niche est en bois lui aussi, mais dans l'ombre : on l'y
          devine, on ne l'y voit pas. */}
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <Veinage graine={5} opacite={0.5} />
      </View>
      <View style={styles.fondOmbre} pointerEvents="none" />
      <View style={styles.plateau} pointerEvents="none" />

      {bay.books.length === 0 ? (
        <View style={styles.vide}>
          <Text style={styles.videTexte} numberOfLines={3}>
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
                baseHeight={tailleLivre || undefined}
                colors={colors}
              />
            </Pressable>
          ))}

          {reste > 0 && (
            <Pressable
              onPress={bay.onPressMore}
              style={[styles.serreLivres, tailleLivre > 0 && { height: Math.round(tailleLivre * 0.55) }]}
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

function Plaque({ texte, styles }: { texte: string; styles: ReturnType<typeof createStyles> }) {
  return (
    <View style={styles.plaque}>
      <View style={styles.plaqueBiseau} pointerEvents="none" />
      <Text style={styles.plaqueTexte} numberOfLines={1}>
        {texte.toUpperCase()}
      </Text>
    </View>
  );
}

function createStyles(colors: Colors, b: ReturnType<typeof bois>) {
  return StyleSheet.create({
    // Aucun angle arrondi : c'est la signature du mobilier industriel récent.
    meuble: {
      flex: 1,
      backgroundColor: 'transparent',
      boxShadow: [{ offsetX: 0, offsetY: 10, blurRadius: 24, color: 'rgba(20, 29, 40, 0.38)' }],
    },

    corniche: { height: CORNICHE, backgroundColor: b.corps, overflow: 'hidden' },
    filet: { height: 2, backgroundColor: b.laiton, opacity: 0.9 },
    filetFin: { height: 1, backgroundColor: b.laitonMat, opacity: 0.75 },
    cornicheAssise: { flex: 1, backgroundColor: b.clair },

    // Le corps se retire de 5 px de chaque côté : c'est ce retrait qui fait
    // SURPLOMBER la corniche, comme sur tout meuble mouluré. Sans lui, la
    // corniche est au nu du bâti et ne se lit plus comme une corniche.
    corps: { flex: 1, flexDirection: 'row', backgroundColor: b.corps, marginHorizontal: 5 },
    interieur: { flex: 1 },

    rangee: { flexDirection: 'row', alignItems: 'stretch' },

    montant: { width: PILASTRE, backgroundColor: b.corps },
    montantArete: { position: 'absolute', top: 0, bottom: 0, left: 0, width: 2, backgroundColor: b.vif, opacity: 0.45 },
    montantOmbre: { position: 'absolute', top: 0, bottom: 0, right: 0, width: 4, backgroundColor: b.ombre, opacity: 0.6 },

    caisson: { flex: 1, justifyContent: 'flex-end', paddingHorizontal: 7, paddingBottom: 4 },
    fond: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: b.nuit },
    fondOmbre: { position: 'absolute', left: 0, right: 0, top: 0, height: 34, backgroundColor: '#000', opacity: 0.42 },
    plateau: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 3, backgroundColor: b.clair, opacity: 0.8 },

    rangeeLivres: { flexDirection: 'row', alignItems: 'flex-end', gap: 3 },
    vide: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10 },
    videTexte: { fontFamily: fonts.label, fontSize: 12, color: 'rgba(122, 184, 194, 0.5)', textAlign: 'center' },

    serreLivres: {
      width: 32,
      borderWidth: 1.5,
      borderStyle: 'dashed',
      borderColor: b.laiton,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 2,
      opacity: 0.85,
    },
    serreSigne: { fontFamily: fonts.display, fontSize: 19, color: b.laiton, lineHeight: 21 },
    serreCompte: { fontFamily: fonts.label, fontSize: 11, color: b.laiton },

    tablette: { width: '100%' },
    tabletteNez: { height: 3, backgroundColor: b.vif },
    tabletteCorps: {
      height: TABLETTE - 7,
      backgroundColor: b.corps,
      flexDirection: 'row',
      alignItems: 'center',
      overflow: 'hidden',
    },
    plaqueZone: { flex: 1, alignItems: 'center' },
    plaque: {
      backgroundColor: b.laiton,
      paddingHorizontal: 12,
      paddingVertical: 2,
      borderWidth: 1,
      borderColor: b.laitonMat,
      overflow: 'hidden',
    },
    // Le biseau de la plaque : une lumière en haut, comme un métal poli.
    plaqueBiseau: { position: 'absolute', left: 0, right: 0, top: 0, height: 2, backgroundColor: '#fbe0a8', opacity: 0.8 },
    plaqueTexte: { fontFamily: fonts.label, fontSize: 10, letterSpacing: 1.4, color: '#241a08', fontWeight: '700' },

    ceinture: { width: '100%', backgroundColor: b.corps, marginHorizontal: 0 },
    ceintureCorps: { height: 10, backgroundColor: b.corps },

    // Le jour entre les pieds laisse voir la page : étroit et bas, il se lit
    // comme une découpe de menuiserie. Large, il faisait un trou de lumière.
    // Une découpe basse et large plutôt qu'un trou : haute, elle laissait
    // passer un rectangle de page en pleine lumière sous le meuble.
    pieds: { height: 8, flexDirection: 'row' },
    pied: { width: '34%', backgroundColor: b.ombre },
    jour: { flex: 1 },
  });
}
