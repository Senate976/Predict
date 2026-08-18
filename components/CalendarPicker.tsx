import { useMemo, useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { Text } from './Text';

import { MONTHS } from '../lib/datetime';
import { fonts, radius, type Colors } from '../lib/theme';
import { useColors } from '../lib/themeMode';

const WEEKDAY_LABELS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];

/** Nombre de jours du mois `month` (0-indexé, comme `Date.getMonth()`) de l'année `year`. */
function daysInMonth(month: number, year: number): number {
  return new Date(year, month + 1, 0).getDate();
}

/** `Date.getDay()` (0 = dimanche) converti en index lundi-premier (0 = lundi). */
function mondayIndex(jsDay: number): number {
  return (jsDay + 6) % 7;
}

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

type Cell = { date: Date; inMonth: boolean };

function buildGrid(year: number, month: number): Cell[] {
  const cells: Cell[] = [];
  const firstOfMonth = new Date(year, month, 1);
  const leading = mondayIndex(firstOfMonth.getDay());
  const total = daysInMonth(month, year);

  for (let i = leading; i > 0; i--) {
    cells.push({ date: new Date(year, month, 1 - i), inMonth: false });
  }
  for (let d = 1; d <= total; d++) {
    cells.push({ date: new Date(year, month, d), inMonth: true });
  }
  let trailing = 1;
  while (cells.length < 42) {
    cells.push({ date: new Date(year, month + 1, trailing), inMonth: false });
    trailing += 1;
  }
  return cells;
}

/**
 * Calendrier mensuel visuel, en remplacement d'une saisie ou de menus
 * Jour/Mois/Année séparés — un tap sur un jour suffit. Les jours passés sont
 * désactivés (une prédiction ne peut se révéler que dans le futur).
 */
export function CalendarPicker({
  value,
  onChange,
  disabled,
}: {
  value: Date | null;
  onChange: (date: Date) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [viewDate, setViewDate] = useState(() => value ?? new Date());
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const today = startOfDay(new Date());
  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const cells = buildGrid(year, month);

  function shiftMonth(delta: number) {
    setViewDate(new Date(year, month + delta, 1));
  }

  const label = value
    ? `${value.getDate()} ${MONTHS[value.getMonth()]} ${value.getFullYear()}`
    : 'Choisir une date';

  return (
    <View>
      <Text style={styles.label}>Date</Text>
      <Pressable
        onPress={() => setOpen(true)}
        disabled={disabled}
        style={[styles.field, disabled && styles.fieldDisabled]}
      >
        <Text style={[styles.value, !value && styles.placeholder]}>{label}</Text>
        <Text style={styles.chevron}>▾</Text>
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <Pressable style={styles.sheet} onPress={(event) => event.stopPropagation()}>
            <View style={styles.monthRow}>
              <Pressable onPress={() => shiftMonth(-1)} hitSlop={10} style={styles.navButton}>
                <Text style={styles.nav}>‹</Text>
              </Pressable>
              <Text style={styles.monthLabel}>
                {MONTHS[month].charAt(0).toUpperCase() + MONTHS[month].slice(1)} {year}
              </Text>
              <Pressable onPress={() => shiftMonth(1)} hitSlop={10} style={styles.navButton}>
                <Text style={styles.nav}>›</Text>
              </Pressable>
            </View>

            <View style={styles.weekdayRow}>
              {WEEKDAY_LABELS.map((label, i) => (
                <Text key={i} style={styles.weekday}>
                  {label}
                </Text>
              ))}
            </View>

            <View style={styles.grid}>
              {cells.map(({ date, inMonth }, i) => {
                const isPast = startOfDay(date).getTime() < today.getTime();
                const selected = value !== null && sameDay(date, value);
                const isToday = sameDay(date, today);
                return (
                  <Pressable
                    key={i}
                    disabled={isPast || !inMonth}
                    onPress={() => {
                      onChange(date);
                      setOpen(false);
                    }}
                    style={[styles.cell, selected && styles.cellSelected]}
                  >
                    <Text
                      style={[
                        styles.cellText,
                        !inMonth && styles.cellTextMuted,
                        isPast && styles.cellTextDisabled,
                        isToday && !selected && styles.cellTextToday,
                        selected && styles.cellTextSelected,
                      ]}
                    >
                      {date.getDate()}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const CELL_SIZE = '14.2857%';

function createStyles(colors: Colors) {
  return StyleSheet.create({
  label: { fontSize: 14, color: colors.textFaint, marginBottom: 6 },
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
  value: { fontSize: 16, color: colors.text },
  placeholder: { color: colors.textFaint },
  chevron: { fontSize: 14, color: colors.textFaint, marginLeft: 8 },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(23, 21, 18, 0.4)',
    justifyContent: 'center',
    padding: 24,
  },
  sheet: {
    backgroundColor: colors.background,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 18,
  },
  monthRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  navButton: { paddingHorizontal: 10, paddingVertical: 4 },
  nav: { fontSize: 20, color: colors.text, fontWeight: '700' },
  monthLabel: { fontFamily: fonts.bodyEmphasis, fontSize: 18, color: colors.text },
  weekdayRow: { flexDirection: 'row' },
  weekday: {
    width: CELL_SIZE,
    textAlign: 'center',
    fontSize: 13,
    fontWeight: '700',
    color: colors.textFaint,
    marginBottom: 6,
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: {
    width: CELL_SIZE,
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cellSelected: { backgroundColor: colors.accent, borderRadius: 999 },
  cellText: { fontSize: 14, color: colors.text },
  cellTextMuted: { color: colors.border },
  cellTextDisabled: { color: colors.border },
  cellTextToday: { color: colors.text, fontWeight: '700', textDecorationLine: 'underline' },
  // Texte noir sur la pastille jaune du jour sélectionné — du blanc y serait peu lisible.
  cellTextSelected: { color: colors.textOnAccent, fontWeight: '700' },
  });
}
