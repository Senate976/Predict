/** Sections de l'écran Paramètres — chacune a son propre écran sous
 * `app/(app)/settings/<id>.tsx`. */
export type SettingsSectionId =
  | 'account'
  | 'privacy'
  | 'notifications'
  | 'security'
  | 'reminders'
  | 'accessibility'
  | 'appearance'
  | 'languages';

export const SETTINGS_SECTIONS: { id: SettingsSectionId; label: string }[] = [
  { id: 'account', label: 'Compte' },
  { id: 'privacy', label: 'Confidentialité' },
  { id: 'notifications', label: 'Notifications' },
  { id: 'security', label: 'Sécurité' },
  { id: 'reminders', label: 'Gestion du temps' },
  { id: 'accessibility', label: 'Accessibilité' },
  { id: 'appearance', label: 'Apparence' },
  { id: 'languages', label: 'Langues' },
];

export type LegalDocId = 'mentions' | 'terms' | 'privacy';

export const LEGAL_DOCS: { id: LegalDocId; label: string }[] = [
  { id: 'mentions', label: 'Mentions légales' },
  { id: 'terms', label: 'CGU' },
  { id: 'privacy', label: 'Confidentialité' },
];
