/** Sections du squelette de l'écran Paramètres — pour l'instant des stubs
 * vides, chacune ouvrant un écran générique réutilisable (`[section].tsx`). */
export type SettingsSectionId =
  | 'preferences'
  | 'security'
  | 'notifications'
  | 'accessibility'
  | 'languages'
  | 'time-management'
  | 'dark-mode';

export const SETTINGS_SECTIONS: { id: SettingsSectionId; label: string }[] = [
  { id: 'preferences', label: 'Préférences' },
  { id: 'security', label: 'Sécurité' },
  { id: 'notifications', label: 'Notifications' },
  { id: 'accessibility', label: 'Accessibilité' },
  { id: 'languages', label: 'Langues' },
  { id: 'time-management', label: 'Gestion du temps' },
  { id: 'dark-mode', label: 'Mode sombre' },
];

export type LegalDocId = 'mentions' | 'terms' | 'privacy';

export const LEGAL_DOCS: { id: LegalDocId; label: string }[] = [
  { id: 'mentions', label: 'Mentions légales' },
  { id: 'terms', label: 'CGU' },
  { id: 'privacy', label: 'Confidentialité' },
];
