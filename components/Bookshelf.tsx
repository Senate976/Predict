import { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from './Text';

import { BookSpine, SPINE_HEIGHT } from './BookArt';
import { fonts, radius, type Colors } from '../lib/theme';
import { useColors } from '../lib/themeMode';

/* ===========================================================================
 * UN COMPARTIMENT DE LA BIBLIOTHÈQUE
 *
 * Un caisson : deux montants, un fond en retrait, une tablette sur laquelle
 * les livres reposent. Les quatre compartiments de l'accueil sont quatre
 * exemplaires de celui-ci — c'est le meuble qui donne l'unité, pas quatre
 * dessins qui se ressemblent.
 *
 * Le fond est plus SOMBRE que la page : c'est ce qui creuse le caisson. Un
 * fond de la même couleur que la page donnerait quatre rectangles posés
 * dessus, pas quatre niches.
 * ========================================================================= */

export type ShelfBook = {
  id: string;
  authorName: string;
  authorAvatarUrl?: string | null;
  highlighted?: boolean;
  unread?: boolean;
};

export function Bookshelf({
  title,
  books,
  emptyLabel,
  onPressBook,
  onPressMore,
  /** Au-delà, on n'entasse pas : le « + » ouvre la rangée entière. */
  maxVisible = 4,
  /** Le compartiment déroule tout, sans « + » — pour la page de débordement. */
  showAll = false,
}: {
  title: string;
  books: ShelfBook[];
  emptyLabel: string;
  onPressBook: (id: string) => void;
  onPressMore?: () => void;
  maxVisible?: number;
  showAll?: boolean;
}) {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const visible = showAll ? books : books.slice(0, maxVisible);
  const reste = books.length - visible.length;

  const rangee = (
    <View style={styles.row}>
      {visible.map((book) => (
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

      {/* Le « + » prend la place d'un livre, à la fin de la rangée : c'est le
          serre-livres. Il ouvre la rangée entière plutôt que de tasser
          davantage — six dos illisibles ne valent pas mieux que trois. */}
      {reste > 0 && onPressMore && (
        <Pressable
          onPress={onPressMore}
          style={styles.more}
          accessibilityRole="button"
          accessibilityLabel={`Voir les ${reste} autres`}
        >
          <Text style={styles.moreSign}>+</Text>
          <Text style={styles.moreCount}>{reste}</Text>
        </Pressable>
      )}
    </View>
  );

  return (
    <View style={styles.unit}>
      <Text style={styles.title} numberOfLines={1}>
        {title}
      </Text>

      <View style={styles.case}>
        {/* Le fond du caisson, en retrait. */}
        <View style={styles.back} pointerEvents="none" />
        <View style={[styles.montant, { left: 0 }]} pointerEvents="none" />
        <View style={[styles.montant, { right: 0 }]} pointerEvents="none" />
        {showAll ? (
          <ScrollView
            horizontal={false}
            contentContainerStyle={styles.scrollAll}
            showsVerticalScrollIndicator={false}
          >
            {rangee}
          </ScrollView>
        ) : books.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyText} numberOfLines={2}>
              {emptyLabel}
            </Text>
          </View>
        ) : (
          rangee
        )}

        {/* La tablette : un chant clair qui prend la lumière, et l'épaisseur
            du bois dessous. Les livres reposent dessus, jamais dans le vide. */}
        <View style={styles.plankEdge} pointerEvents="none" />
        <View style={styles.plank} pointerEvents="none" />
      </View>
    </View>
  );
}

function createStyles(colors: Colors) {
  const bois = colors.background === '#1c2737' ? '#4a6b78' : '#426170';
  return StyleSheet.create({
    unit: { flex: 1, gap: 6 },
    title: {
      fontFamily: fonts.sansBold,
      fontSize: 13,
      color: colors.textMuted,
      letterSpacing: 0.3,
    },
    case: {
      borderRadius: radius.sm,
      overflow: 'hidden',
      paddingTop: 16,
      paddingHorizontal: 8,
      // Place pour la tablette, sous les livres.
      paddingBottom: 11,
      justifyContent: 'flex-end',
      // De la hauteur sous plafond : un livre mis en avant dépasse de 12 px la
      // taille de référence, et se retrouvait décapité par le haut du caisson.
      minHeight: SPINE_HEIGHT + 40,
    },
    back: {
      position: 'absolute',
      left: 0,
      right: 0,
      top: 0,
      bottom: 0,
      backgroundColor: 'rgba(28, 39, 55, 0.10)',
    },
    // Le montant de gauche et celui de droite : deux traits verticaux
    // sombres, qui referment la niche sur les côtés.
    montant: {
      position: 'absolute',
      top: 0,
      bottom: 0,
      width: 3,
      backgroundColor: 'rgba(28, 39, 55, 0.16)',
    },
    // Pas de `flexWrap` : une étagère porte UNE rangée. Repliés sur deux
    // lignes, les livres perdaient leur tablette et l'illusion avec.
    row: { flexDirection: 'row', alignItems: 'flex-end', gap: 3 },
    scrollAll: { paddingBottom: 4 },
    empty: { minHeight: SPINE_HEIGHT, alignItems: 'center', justifyContent: 'center' },
    emptyText: {
      fontFamily: fonts.label,
      fontSize: 12,
      color: colors.textFaint,
      textAlign: 'center',
    },
    // Le serre-livres : même hauteur qu'un dos court, en pointillé, pour se
    // lire comme une place vide plutôt que comme un livre de plus.
    more: {
      width: 34,
      height: SPINE_HEIGHT - 22,
      borderRadius: 3,
      borderWidth: 1.5,
      borderStyle: 'dashed',
      borderColor: colors.accent,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 2,
    },
    moreSign: { fontFamily: fonts.display, fontSize: 20, color: colors.accent, lineHeight: 22 },
    moreCount: { fontFamily: fonts.label, fontSize: 11, color: colors.accent },
    plank: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      height: 7,
      backgroundColor: bois,
    },
    plankEdge: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 7,
      height: 2,
      backgroundColor: 'rgba(249, 252, 254, 0.35)',
    },
  });
}
