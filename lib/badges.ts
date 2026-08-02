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
};

/**
 * Ne renvoie que le niveau courant, jamais le suivant ni ses seuils : le
 * Profil (components/PrestigeBadge.tsx) n'affiche que le badge débloqué,
 * volontairement sans indice sur la progression à venir.
 */
export function badgeForCount(count: number): BadgeInfo {
  let index = 0;
  for (let i = 0; i < THRESHOLDS.length; i++) {
    if (count >= THRESHOLDS[i].min) index = i;
  }
  const current = THRESHOLDS[index];
  return {
    level: current.level,
    label: current.label,
    color: current.color,
    gradient: current.gradient,
    monogramColor: current.monogramColor,
    min: current.min,
  };
}

/**
 * Réservé à soi-même ou à un ami accepté (`get_realized_count_30d` le vérifie
 * côté base) ; renvoie `0` sinon, silencieusement.
 */
export async function fetchRealizedCount30d(userId: string) {
  return supabase.rpc('get_realized_count_30d', { target_user: userId });
}
