import { useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, View } from 'react-native';
import { Text } from './Text';

import { colors, fonts, radius } from '../lib/theme';

export type SelectOption<T> = { value: T; label: string };

/**
 * Menu déroulant générique : un champ qui ouvre une liste défilante en
 * feuille modale, plutôt qu'une saisie libre. Utilisé pour la date et l'heure
 * de révélation (components/../app/(app)/new-prediction.tsx) — un choix dans
 * une liste ne peut jamais produire de date invalide, contrairement à un
 * texte JJ/MM/AAAA saisi à la main.
 */
export function SelectField<T extends string | number>({
  label,
  value,
  options,
  placeholder,
  onChange,
  disabled,
}: {
  label: string;
  value: T | null;
  options: SelectOption<T>[];
  placeholder: string;
  onChange: (value: T) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const selected = options.find((option) => option.value === value);

  return (
    <View>
      <Text style={styles.label}>{label}</Text>
      <Pressable
        onPress={() => setOpen(true)}
        disabled={disabled}
        style={[styles.field, disabled && styles.fieldDisabled]}
      >
        <Text style={[styles.value, !selected && styles.placeholder]} numberOfLines={1}>
          {selected ? selected.label : placeholder}
        </Text>
        <Text style={styles.chevron}>▾</Text>
      </Pressable>

      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={() => setOpen(false)}
      >
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <Pressable style={styles.sheet} onPress={(event) => event.stopPropagation()}>
            <Text style={styles.sheetTitle}>{label}</Text>
            <FlatList
              data={options}
              keyExtractor={(item) => String(item.value)}
              style={styles.list}
              initialScrollIndex={
                selected ? Math.max(0, options.indexOf(selected) - 2) : undefined
              }
              getItemLayout={(_, index) => ({ length: 44, offset: 44 * index, index })}
              renderItem={({ item }) => (
                <Pressable
                  onPress={() => {
                    onChange(item.value);
                    setOpen(false);
                  }}
                  style={[styles.option, item.value === value && styles.optionActive]}
                >
                  <Text
                    style={[styles.optionText, item.value === value && styles.optionTextActive]}
                  >
                    {item.label}
                  </Text>
                </Pressable>
              )}
            />
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  label: { fontSize: 12, color: colors.textFaint, marginBottom: 6 },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: colors.surface,
  },
  fieldDisabled: { opacity: 0.6 },
  value: { fontSize: 16, color: colors.text, flexShrink: 1 },
  placeholder: { color: colors.textFaint },
  chevron: { fontSize: 12, color: colors.textFaint, marginLeft: 8 },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(23, 21, 18, 0.4)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    maxHeight: '55%',
    paddingTop: 16,
    paddingBottom: 24,
  },
  sheetTitle: {
    fontFamily: fonts.sansBold,
    fontSize: 20,
    color: colors.text,
    textAlign: 'center',
    marginBottom: 8,
  },
  list: { paddingHorizontal: 20 },
  option: {
    height: 44,
    justifyContent: 'center',
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  optionActive: { backgroundColor: colors.goldSoft },
  optionText: { fontSize: 15, color: colors.text },
  optionTextActive: { color: colors.text, fontWeight: '700' },
});
