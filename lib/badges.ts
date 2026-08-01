import { supabase } from './supabase';

export type BadgeLevel = 'bois' | 'fer' | 'bronze' | 'argent' | 'or' | 'titane';

type Gradient = readonly [string, string, string];

type Threshold = { level: BadgeLevel; label: string; min: number; color: string; gradient: Gradient };

/**
 * Seuils de prestige, sur le nombre de prédictions passées « Réalisée » (à la
 * majorité des votes) au cours des 30 derniers jours. Doivent rester alignés
 * sur `get_realized_count_30d` côté SQL, qui calcule le nombre lui-même — ce
 * fichier ne fait que le traduire en niveau visuel. Les dégradés (clair →
 * teinte → sombre) donnent le reflet métallique de la médaille ; définis à la
 * main plutôt que calculés, pour un rendu fiable par matériau.
 */
const THRESHOLDS: Threshold[] = [
  { level: 'bois', label: 'Bois', min: 0, color: '#8B6B4A', gradient: ['#B08D63', '#8B6B4A', '#5B4128'] },
  { level: 'fer', label: 'Fer', min: 5, color: '#8A8D91', gradient: ['#B4B7BA', '#8A8D91', '#5C5F63'] },
  { level: 'bronze', label: 'Bronze', min: 10, color: '#B87333', gradient: ['#D99A5B', '#B87333', '#7D4B1E'] },
  { level: 'argent', label: 'Argent', min: 20, color: '#ADADAD', gradient: ['#E2E2E2', '#ADADAD', '#787878'] },
  { level: 'or', label: 'Or', min: 35, color: '#D4AF37', gradient: ['#F0D77B', '#D4AF37', '#9C7A1F'] },
  { level: 'titane', label: 'Titane', min: 50, color: '#5E7C8A', gradient: ['#93B4C2', '#5E7C8A', '#37505C'] },
];

export type BadgeInfo = {
  level: BadgeLevel;
  label: string;
  color: string;
  gradient: Gradient;
  min: number;
  next: { label: string; min: number } | null;
};

export function badgeForCount(count: number): BadgeInfo {
  let index = 0;
  for (let i = 0; i < THRESHOLDS.length; i++) {
    if (count >= THRESHOLDS[i].min) index = i;
  }
  const current = THRESHOLDS[index];
  const next = THRESHOLDS[index + 1] ?? null;
  return {
    level: current.level,
    label: current.label,
    color: current.color,
    gradient: current.gradient,
    min: current.min,
    next: next ? { label: next.label, min: next.min } : null,
  };
}

/** Progression vers le niveau suivant, entre 0 et 1. `null` : déjà au sommet (Titane). */
export function badgeProgress(count: number, badge: BadgeInfo): number | null {
  if (!badge.next) return null;
  const span = badge.next.min - badge.min;
  return Math.min(1, Math.max(0, (count - badge.min) / span));
}

/**
 * Réservé à soi-même ou à un ami accepté (`get_realized_count_30d` le vérifie
 * côté base) ; renvoie `0` sinon, silencieusement.
 */
export async function fetchRealizedCount30d(userId: string) {
  return supabase.rpc('get_realized_count_30d', { target_user: userId });
}
