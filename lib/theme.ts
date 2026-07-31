// Charte graphique « Luxe & minimaliste » : fond sombre, typographie blanche
// épurée, accents dorés réservés aux éléments d'interaction. Un seul endroit à
// changer si la palette évolue — tous les écrans importent d'ici plutôt que de
// coder leurs propres couleurs.

export const colors = {
  background: '#0A0A0C',
  surface: '#151517',
  surfaceRaised: '#1C1C1F',
  border: '#2A2A2E',
  text: '#F5F3EE',
  textMuted: '#9C9A96',
  textFaint: '#65635F',
  gold: '#C9A24B',
  goldBright: '#E4C978',
  goldSoft: 'rgba(201, 162, 75, 0.14)',
  danger: '#E5484D',
  dangerSoft: 'rgba(229, 72, 77, 0.14)',
  success: '#4ADE80',
  successSoft: 'rgba(74, 222, 128, 0.12)',
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 18,
  pill: 999,
} as const;

export const spacing = {
  xs: 6,
  sm: 10,
  md: 16,
  lg: 24,
  xl: 32,
} as const;
