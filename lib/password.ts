/**
 * Les exigences du mot de passe, énoncées une seule fois.
 *
 * Partagées par l'inscription, la réinitialisation et le changement depuis les
 * réglages : c'est la même liste qui s'affiche à l'écran et qui valide la
 * saisie, si bien qu'il est impossible d'annoncer une règle qui ne serait pas
 * contrôlée, ou de refuser une saisie pour une raison non annoncée.
 */
export const MIN_PASSWORD_LENGTH = 8;

export const PASSWORD_RULES: { label: string; test: (value: string) => boolean }[] = [
  { label: `${MIN_PASSWORD_LENGTH} caractères minimum`, test: (v) => v.length >= MIN_PASSWORD_LENGTH },
  { label: 'Une lettre', test: (v) => /[a-zA-Z]/.test(v) },
  { label: 'Un chiffre', test: (v) => /[0-9]/.test(v) },
  { label: 'Un signe (! ? * - … )', test: (v) => /[^a-zA-Z0-9]/.test(v) },
];

/** Les règles NON satisfaites, dans l'ordre d'affichage — vide si tout va bien. */
export function passwordIssues(value: string): string[] {
  return PASSWORD_RULES.filter((rule) => !rule.test(value)).map((rule) => rule.label);
}
