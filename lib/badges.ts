import { supabase } from './supabase';

export type BadgeLevel = 'fer' | 'bronze' | 'argent' | 'or';

type Gradient = readonly [string, string, string];

type Threshold = {
  level: BadgeLevel;
  label: string;
  min: number;
  color: string;
  gradient: Gradient;
  engraveShadow: string;
  engraveLight: string;
};

/**
 * Quatre niveaux de prestige, sur le nombre de prédictions passées
 * « Réalisée » (à la majorité des votes) au cours des 30 derniers jours.
 * Doivent rester alignés sur `get_realized_count_30d` côté SQL. Chaque métal
 * a son propre dégradé (reflet métallique) et ses teintes de gravure
 * (ombre/relief du libellé), pour un rendu fidèle par matériau plutôt qu'une
 * simple couleur plate.
 */
const THRESHOLDS: Threshold[] = [
  {
    level: 'fer',
    label: 'Fer',
    min: 0,
    color: '#8A8D91',
    gradient: ['#C9CCCF', '#8A8D91', '#54575B'],
    engraveShadow: '#3A3C3F',
    engraveLight: '#EDEEEF',
  },
  {
    level: 'bronze',
    label: 'Bronze',
    min: 10,
    color: '#B87A3D',
    gradient: ['#E3B27C', '#B87A3D', '#7A4C1E'],
    engraveShadow: '#4A2C10',
    engraveLight: '#F6DFB8',
  },
  {
    level: 'argent',
    label: 'Argent',
    min: 20,
    color: '#B7B9BC',
    gradient: ['#F0F1F2', '#B7B9BC', '#84878B',],
    engraveShadow: '#5C5E61',
    engraveLight: '#FFFFFF',
  },
  {
    level: 'or',
    label: 'Or',
    min: 35,
    color: '#CE9F2E',
    gradient: ['#F3D888', '#CE9F2E', '#8A6414'],
    engraveShadow: '#5C4310',
    engraveLight: '#FCEDBB',
  },
];

export type BadgeInfo = {
  level: BadgeLevel;
  label: string;
  color: string;
  gradient: Gradient;
  engraveShadow: string;
  engraveLight: string;
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
    engraveShadow: current.engraveShadow,
    engraveLight: current.engraveLight,
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

/**
 * Réservé à soi-même ou à un ami accepté (`get_realized_count_30d` le vérifie
 * côté base) ; renvoie `0` sinon, silencieusement.
 */
export async function fetchRealizedCount30d(userId: string) {
  return supabase.rpc('get_realized_count_30d', { target_user: userId });
}
