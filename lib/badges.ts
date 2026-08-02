import { supabase } from './supabase';

export type BadgeLevel = 'fer' | 'bronze' | 'argent' | 'or';

type Gradient = readonly [string, string];

type Threshold = {
  level: BadgeLevel;
  label: string;
  min: number;
  /** Couleur d'accent du niveau — anneau fin, libellé, jauge. */
  color: string;
  /** Dégradé subtil du médaillon, façon reflet de métal précieux. */
  gradient: Gradient;
  /** Couleur du monogramme "P" (repris du logo), contrastée sur le dégradé. */
  monogramColor: string;
};

/**
 * Quatre niveaux de prestige, sur le nombre de prédictions passées
 * « Réalisée » (à la majorité des votes) au cours des 30 derniers jours.
 * Doivent rester alignés sur `get_realized_count_30d` côté SQL. Progression
 * de métal du plus sobre au plus précieux : fer, bronze, argent, or.
 */
const THRESHOLDS: Threshold[] = [
  {
    level: 'fer',
    label: 'Capteur de signal',
    min: 0,
    color: '#8A8D91',
    gradient: ['#E4E7EA', '#8F98A3'],
    monogramColor: '#4B5158',
  },
  {
    level: 'bronze',
    label: 'Analyste de scénario',
    min: 10,
    color: '#B87A3D',
    gradient: ['#F0C89A', '#A15D28'],
    monogramColor: '#5A2F0F',
  },
  {
    level: 'argent',
    label: 'Expert en tendances',
    min: 20,
    color: '#9AA0A6',
    gradient: ['#FFFFFF', '#B9C0C7'],
    monogramColor: '#5C646C',
  },
  {
    level: 'or',
    label: 'Maître de l\'anticipation',
    min: 35,
    color: '#C6A24C',
    gradient: ['#FCEAAE', '#C6952E'],
    monogramColor: '#6B4E10',
  },
];

export type BadgeInfo = {
  level: BadgeLevel;
  label: string;
  color: string;
  gradient: Gradient;
  monogramColor: string;
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
    monogramColor: current.monogramColor,
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
