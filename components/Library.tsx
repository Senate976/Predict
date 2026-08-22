import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from './Text';

import { BookSpine, spineWidth } from './BookArt';
import { Degrade, melange as melangeCouleur } from './Degrade';
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

/**
 * LE BOIS.
 *
 * Un meuble où l'on confie des secrets doit être CHAUD : c'est la chaleur qui
 * dit qu'on est à l'abri. Mais chaud ne veut pas dire JAUNE.
 *
 * La rampe précédente était trop claire et trop saturée : elle donnait du pin
 * verni, et surtout elle mettait le meuble sur la même note que l'or de la
 * charte. Tout devenait jaune — le bois, les plaques, le serre-livres, les
 * portraits — et l'or, étalé partout, ne signalait plus rien.
 *
 * Celle-ci est un noyer sombre et ÉTEINT : la même famille chaude, mais
 * désaturée et descendue de plusieurs crans. Le bois se tait pour que la
 * lumière, les cuirs et les rares points d'or puissent parler.
 *
 * Elle ne dépend PAS du thème clair/sombre : un meuble ne change pas
 * d'essence quand on allume la lumière, il change seulement d'éclairage — et
 * c'est le fond des niches qui s'en charge.
 */
function bois() {
  return {
    vif: '#8a7360',     // l'arête qui prend la lumière
    lumiere: '#6e5a49',
    clair: '#57463a',
    corps: '#43352b',   // le ton du meuble
    creux: '#33281f',
    ombre: '#241c16',
    nuit: '#120e0b',    // le fond des niches
    // L'or ne sert plus qu'aux filets. `bronze` remplace le laiton partout
    // où il faisait une surface : plaques, serre-livres.
    or: '#c9a24a',
    bronze: '#2b2119',
    bronzeClair: '#3a2d22',
    bronzeArete: '#8a6f3c',
    ivoire: '#e6dcc4',
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
      Array.from({ length: 16 }, (_, i) => ({
        left: `${grain(i, graine) * 100}%`,
        width: 0.5 + grain(i + 40, graine) * 1.4,
        opacity: (0.02 + grain(i + 80, graine) * 0.05) * opacite,
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
            backgroundColor: f.sombre ? '#140f0a' : '#d9c6ac',
            opacity: f.opacity,
          }}
        />
      ))}
    </View>
  );
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
          style={{ height: epaisseur, backgroundColor: melangeCouleur(de, vers, i / (bandes - 1 || 1)) }}
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
    <View style={{ width: largeur }}>
      {/* Un pilastre est ROND. La lumière frappe son arête gauche, culmine au
          premier tiers puis s'éteint vers le montant — sans ce galbe, on ne
          voit qu'une bande de couleur, et les cannelures se posent sur du
          plat au lieu de creuser un cylindre. */}
      <Degrade
        sens="h"
        bandes={14}
        etapes={[
          { couleur: melangeCouleur(b.corps, '#000000', 0.3), a: 0 },
          { couleur: b.vif, a: 0.22 },
          { couleur: b.corps, a: 0.58 },
          { couleur: melangeCouleur(b.ombre, '#000000', 0.15), a: 1 },
        ]}
      />
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
/** Le jeu entre deux dos, et la largeur du serre-livres de bronze. */
const JEU = 3;
const SERRE = 40;
/** Retrait intérieur de la niche, de chaque côté. */
const RETRAIT = 7;
const TABLETTE = 26;
const CORNICHE = 52;
const PIEDS = 34;

export function Library({
  bays,
  onPressBook,
  /* Trois, et pas quatre. Un livre fait jusqu'à 48 px, le serre-livres 40 :
     à quatre, la rangée dépassait la niche et c'est le serre-livres — donc
     l'accès au reste du rayon — qui se faisait écraser contre le montant. */
  maxVisible = 3,
}: {
  bays: LibraryBay[];
  onPressBook: (id: string) => void;
  maxVisible?: number;
}) {
  const colors = useColors();
  const b = useMemo(() => bois(), []);
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

  /* `titreEnTete` : la plaque est vissée au fond de la niche, au-dessus des
     livres, au lieu d'être gravée sur le chant de la tablette.

     Pourquoi seulement la rangée du haut : une plaque sur un chant désigne
     naturellement les livres POSÉS DESSUS. Pour la rangée du bas, la plaque
     du bas ne peut désigner qu'elle — aucune ambiguïté. Pour la rangée du
     haut, la plaque de la tablette du milieu était prise en tenaille entre
     deux rangées et pouvait se lire dans les deux sens. En la remontant, on
     encadre le meuble : un titre tout en haut, un titre tout en bas, et rien
     d'équivoque au milieu. */
  const rangee = (gauche: LibraryBay, droite: LibraryBay, titreEnTete = false) => (
    <View style={[styles.rangee, niche > 0 && { height: niche }]}>
      <Bay bay={gauche} styles={styles} colors={colors} b={b} titreEnTete={titreEnTete}
        onPressBook={onPressBook} maxVisible={maxVisible} tailleLivre={tailleLivre} />
      {/* Le montant central : une vraie pièce debout, cannelée comme les
          pilastres, avec son arête éclairée. */}
      <View style={styles.montant}>
        <Veinage graine={7} />
        <View style={styles.montantArete} pointerEvents="none" />
        <View style={styles.montantOmbre} pointerEvents="none" />
      </View>
      <Bay bay={droite} styles={styles} colors={colors} b={b} titreEnTete={titreEnTete}
        onPressBook={onPressBook} maxVisible={maxVisible} tailleLivre={tailleLivre} />
    </View>
  );

  /** La tablette, vue de face : un chant mouluré, le corps du bois, et
   *  l'ombre qu'elle jette dans la niche du dessous. */
  const tablette = (gauche?: string, droite?: string) => (
    <View style={styles.tablette}>
      <View style={styles.tabletteNez} />
      <View style={styles.tabletteCorps}>
        {/* Le chant d'une tablette est un bandeau qui reçoit la lumière du
            dessus et la perd vers le bas : c'est ce qui lui donne son
            épaisseur, plus sûrement qu'un trait clair. */}
        <Degrade
          sens="v"
          bandes={12}
          etapes={[
            { couleur: b.vif, a: 0 },
            { couleur: b.corps, a: 0.4 },
            { couleur: b.ombre, a: 1 },
          ]}
        />
        <Veinage graine={11} opacite={0.7} />
        <View style={styles.plaqueZone}>
          {gauche != null && <Plaque texte={gauche} styles={styles} b={b} />}
        </View>
        <View style={{ width: PILASTRE }} />
        <View style={styles.plaqueZone}>
          {droite != null && <Plaque texte={droite} styles={styles} b={b} />}
        </View>
      </View>
      <Moulure de={b.creux} vers={b.ombre} bandes={4} epaisseur={1} />
    </View>
  );

  return (
    <View style={styles.meuble} onLayout={(e) => setHauteur(e.nativeEvent.layout.height)}>
      {/* LA CORNICHE — quatre moulures enchaînées, deux filets d'or fins.
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
          {bays.length >= 2 && rangee(bays[0], bays[1], true)}
          {/* La tablette du milieu ne porte aucune plaque : les titres du haut
              sont remontés dans la niche, au-dessus des livres. */}
          {bays.length >= 2 && tablette()}
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
  titreEnTete = false,
}: {
  bay: LibraryBay;
  styles: ReturnType<typeof createStyles>;
  colors: Colors;
  b: ReturnType<typeof bois>;
  onPressBook: (id: string) => void;
  maxVisible: number;
  tailleLivre: number;
  titreEnTete?: boolean;
}) {
  /* COMBIEN DE LIVRES RENTRENT VRAIMENT.
     `maxVisible` ne suffit pas : trois dos peuvent faire 96 px comme 144, et
     sur un écran étroit une niche n'a que 150 px de large. On empilait alors
     trois livres plus le serre-livres sur 190 px, et c'est le serre-livres —
     donc l'accès au reste du rayon — qui passait sous le montant, coupé.
     On mesure la niche, on additionne les épaisseurs réelles (elles sont
     connues d'avance, tirées des identifiants) et on s'arrête AVANT de
     déborder, en réservant toujours la place du serre-livres tant qu'il reste
     des livres derrière. */
  const [largeur, setLargeur] = useState(0);
  const visibles = useMemo(() => {
    const dispo = largeur - 2 * RETRAIT;
    if (dispo <= 0) return bay.books.slice(0, maxVisible);
    let pris = 0;
    let n = 0;
    for (const livre of bay.books) {
      if (n >= maxVisible) break;
      const largeurLivre = spineWidth(livre.id) + (n > 0 ? JEU : 0);
      // S'il reste des livres derrière celui-ci, il faudra aussi la place du
      // serre-livres : on la réserve dès maintenant.
      const reserve = bay.books.length > n + 1 ? SERRE + JEU : 0;
      if (pris + largeurLivre + reserve > dispo) break;
      pris += largeurLivre;
      n++;
    }
    // Au moins un livre, toujours : une niche pleine mais qui paraît vide
    // serait pire qu'une rangée un peu serrée.
    return bay.books.slice(0, Math.max(1, n));
  }, [bay.books, largeur, maxVisible]);
  const reste = bay.books.length - visibles.length;

  return (
    <View style={styles.caisson} onLayout={(e) => setLargeur(e.nativeEvent.layout.width)}>
      {/* LA LUMIÈRE DE LA NICHE, et c'est elle qui fait toute la différence
          entre un caisson et un refuge.

          Une réglette est cachée sous la tablette du dessus. Sa lumière est
          CHAUDE : elle éclabousse le haut du fond en ambre, retombe vite dans
          l'ombre, puis rebondit faiblement sur la tablette pour éclairer le
          pied des livres. Un fond uniformément noir donnait une découpe de
          papier ; un fond dégradé mais froid donnait une vitrine de magasin.
          C'est le halo tiède qui donne le sentiment d'être à l'abri. */}
      <View style={styles.fond} pointerEvents="none">
        <Degrade
          sens="v"
          bandes={22}
          etapes={[
            { couleur: melangeCouleur(b.nuit, b.or, 0.2), a: 0 },
            { couleur: melangeCouleur(b.nuit, b.or, 0.08), a: 0.14 },
            { couleur: b.nuit, a: 0.52 },
            { couleur: melangeCouleur(b.nuit, '#000000', 0.4), a: 0.86 },
            { couleur: melangeCouleur(b.nuit, b.or, 0.05), a: 1 },
          ]}
        />
      </View>
      {/* La réglette elle-même : un trait franc, sinon le halo semble venir
          de nulle part. */}
      <View style={styles.reglette} pointerEvents="none" />
      {/* Le fond de niche est en bois lui aussi, mais dans l'ombre : on l'y
          devine, on ne l'y voit pas. */}
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <Veinage graine={5} opacite={0.5} />
      </View>
      <View style={styles.plateau} pointerEvents="none" />

      {/* La plaque vissée au fond de la niche, en plein dans le halo de la
          réglette : c'est la première chose éclairée, donc la première lue. */}
      {titreEnTete && (
        <View style={styles.plaqueTete} pointerEvents="box-none">
          <Plaque texte={bay.label} styles={styles} b={b} />
        </View>
      )}

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
              <View style={styles.serreBiseau} pointerEvents="none" />
              <Text style={styles.serreSigne}>+</Text>
              <Text style={styles.serreCompte}>{reste}</Text>
            </Pressable>
          )}
        </View>
      )}
    </View>
  );
}

/**
 * LA PLAQUE GRAVÉE.
 *
 * Trois choses la rendaient illisible et elles sont corrigées ensemble :
 *
 * 1. Le texte n'était pas centré — il flottait dans une plaque qui prenait la
 *    largeur de son contenu, donc la plaque n'avait jamais deux fois la même
 *    taille. Elle a maintenant une largeur minimale, et le texte est centré
 *    dedans.
 * 2. Le contraste : gravé en ivoire sur un bronze sombre. En noir sur laiton,
 *    la plaque était certes lisible, mais six surfaces dorées par écran
 *    jaunissaient tout le meuble et l'or cessait d'être un accent.
 * 3. La taille : 10 px espacés de 1,4, c'était un filigrane. On monte à 12,
 *    en gras.
 *
 * Le bronze est dégradé du plus clair en haut au plus sombre en bas : c'est ce
 * qui fait une plaque coulée plutôt qu'une étiquette collée.
 */
function Plaque({
  texte,
  styles,
  b,
}: {
  texte: string;
  styles: ReturnType<typeof createStyles>;
  b: ReturnType<typeof bois>;
}) {
  return (
    <View style={styles.plaque}>
      <Degrade
        sens="v"
        bandes={10}
        etapes={[
          { couleur: b.bronzeClair, a: 0 },
          { couleur: b.bronze, a: 0.5 },
          { couleur: melangeCouleur(b.bronze, '#000000', 0.4), a: 1 },
        ]}
      />
      <View style={styles.plaqueBiseau} pointerEvents="none" />
      {/* Les deux vis qui la tiennent. Sans elles, la plaque est posée ;
          avec, elle est fixée — et un objet fixé est un objet sûr. */}
      <View style={[styles.vis, { left: 4 }]} pointerEvents="none" />
      <View style={[styles.vis, { right: 4 }]} pointerEvents="none" />
      <Text style={styles.plaqueTexte} numberOfLines={1} adjustsFontSizeToFit>
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
      boxShadow: [{ offsetX: 0, offsetY: 10, blurRadius: 24, color: 'rgba(24, 14, 5, 0.42)' }],
    },

    corniche: { height: CORNICHE, backgroundColor: b.corps, overflow: 'hidden' },
    filet: { height: 1.5, backgroundColor: b.or, opacity: 0.6 },
    filetFin: { height: 1, backgroundColor: b.bronzeArete, opacity: 0.5 },
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

    caisson: { flex: 1, justifyContent: 'flex-end', paddingHorizontal: RETRAIT, paddingBottom: 4 },
    plaqueTete: { position: 'absolute', left: 0, right: 0, top: 10, alignItems: 'center' },
    fond: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: b.nuit },
    reglette: { position: 'absolute', left: 8, right: 8, top: 0, height: 2, backgroundColor: '#e8cf9e', opacity: 0.4 },
    plateau: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 3, backgroundColor: b.clair, opacity: 0.8 },

    rangeeLivres: { flexDirection: 'row', alignItems: 'flex-end', gap: JEU },
    vide: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10, paddingTop: 26 },
    videTexte: { fontFamily: fonts.label, fontSize: 12, color: 'rgba(214, 201, 176, 0.42)', textAlign: 'center' },

    /* LE SERRE-LIVRES. En pointillé fin, il disparaissait : on ne voyait plus
       qu'un trait, alors que c'est LUI qui donne accès au reste du rayon.
       C'est maintenant une pièce de bronze pleine, de la largeur d'un livre,
       posée au bout de la rangée — impossible à manquer, et cohérente avec
       les plaques gravées du meuble. */
    serreLivres: {
      width: SERRE,
      backgroundColor: b.bronzeClair,
      borderWidth: 1,
      borderColor: b.bronzeArete,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 1,
      boxShadow: [{ offsetX: 1, offsetY: 2, blurRadius: 4, color: 'rgba(10, 7, 5, 0.6)' }],
    },
    serreBiseau: { position: 'absolute', left: 0, right: 0, top: 0, height: 2, backgroundColor: '#c2a271', opacity: 0.8 },
    serreSigne: { fontFamily: fonts.display, fontSize: 24, color: b.ivoire, lineHeight: 26 },
    serreCompte: { fontFamily: fonts.label, fontSize: 12, color: b.ivoire, fontWeight: '800' },

    tablette: { width: '100%' },
    tabletteNez: { height: 3, backgroundColor: b.vif },
    tabletteCorps: {
      height: TABLETTE - 7,
      flexDirection: 'row',
      alignItems: 'center',
      overflow: 'hidden',
    },
    plaqueZone: { flex: 1, alignItems: 'center' },
    plaque: {
      minWidth: 116,
      paddingHorizontal: 14,
      paddingVertical: 3,
      borderWidth: 1,
      borderColor: b.bronzeArete,
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
      boxShadow: [{ offsetX: 0, offsetY: 1, blurRadius: 3, color: 'rgba(12, 7, 3, 0.5)' }],
    },
    // Le biseau de la plaque : une lumière en haut, comme un métal poli.
    plaqueBiseau: { position: 'absolute', left: 0, right: 0, top: 0, height: 1, backgroundColor: '#c2a271', opacity: 0.55 },
    vis: { position: 'absolute', top: '50%', marginTop: -1.25, width: 2.5, height: 2.5, borderRadius: 1.25, backgroundColor: '#9c825a', opacity: 0.45 },
    plaqueTexte: {
      fontFamily: fonts.label,
      fontSize: 12,
      letterSpacing: 1.1,
      color: b.ivoire,
      fontWeight: '800',
      textAlign: 'center',
    },

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
