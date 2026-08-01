import { supabase } from './supabase';

export type BadgeLevel = 'fer' | 'bronze' | 'argent' | 'or';

type Threshold = {
  level: BadgeLevel;
  label: string;
  min: number;
  /** Couleur d'accent du niveau — anneau fin + libellé (components/PrestigeBadge.tsx). */
  color: string;
};

/**
 * Quatre niveaux de prestige, sur le nombre de prédictions passées
 * « Réalisée » (à la majorité des votes) au cours des 30 derniers jours.
 * Doivent rester alignés sur `get_realized_count_30d` côté SQL.
 */
const THRESHOLDS: Threshold[] = [
  { level: 'fer', label: 'Capteur de signal', min: 0, color: '#8A8D91' },
  { level: 'bronze', label: 'Analyste de scénario', min: 10, color: '#B87A3D' },
  { level: 'argent', label: 'Expert en tendances', min: 20, color: '#9AA0A6' },
  { level: 'or', label: 'Maître de l\'anticipation', min: 35, color: '#C6A24C' },
];

export type BadgeInfo = {
  level: BadgeLevel;
  label: string;
  color: string;
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
    min: current.min,
    next: next ? { label: next.label, min: next.min } : null,
  };
}

/** Progression vers le niveau suivant, entre 0 et 1. `null` : déjà au sommet (Or). */
export function badgeProgress(count: number, badge: BadgeInfo): number | null {
  if (!badge.next) return null;
  const span = badge.next.min - badge.min;
  return Math.min(1, Math.max(0, (count - badge.min) / span));
}

export type BadgeLevelInfo = {
  level: BadgeLevel;
  label: string;
  color: string;
  min: number;
  /** `null` pour le dernier niveau (Or) — pas de plafond. */
  max: number | null;
};

/** L'échelle complète des 4 niveaux, du plus bas au plus haut — pour le
 * panneau récapitulatif du Profil (components/PrestigeBadge.tsx ne montre
 * que le niveau courant). */
export function allBadgeLevels(): BadgeLevelInfo[] {
  return THRESHOLDS.map((t, i) => ({
    level: t.level,
    label: t.label,
    color: t.color,
    min: t.min,
    max: THRESHOLDS[i + 1] ? THRESHOLDS[i + 1].min - 1 : null,
  }));
}

/**
 * Réservé à soi-même ou à un ami accepté (`get_realized_count_30d` le vérifie
 * côté base) ; renvoie `0` sinon, silencieusement.
 */
export async function fetchRealizedCount30d(userId: string) {
  return supabase.rpc('get_realized_count_30d', { target_user: userId });
}
