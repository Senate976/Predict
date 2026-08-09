// Saisie et affichage des dates, en français et sans dépendance à `Intl`.
//
// `toLocaleDateString('fr-FR')` serait plus court, mais le support d'`Intl`
// dépend du moteur JS (Hermes, JSC, navigateur) et des options de build : un
// repli silencieux sur l'anglais passerait le typecheck sans se voir.
//
// Ce module ne dépend que de `Date` — ce qui le rend aussi exécutable tel quel
// sous Node pour vérifier les cas limites (31/02, minuit, passage de mois).

export const MONTHS = [
  'janvier',
  'février',
  'mars',
  'avril',
  'mai',
  'juin',
  'juillet',
  'août',
  'septembre',
  'octobre',
  'novembre',
  'décembre',
];

const WEEKDAYS = [
  'dimanche',
  'lundi',
  'mardi',
  'mercredi',
  'jeudi',
  'vendredi',
  'samedi',
];

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

/** `JJ/MM/AAAA` dans le fuseau local. */
export function toDateInput(date: Date): string {
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()}`;
}

/** `HH:MM` dans le fuseau local. */
export function toTimeInput(date: Date): string {
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/**
 * Convertit une saisie `JJ/MM/AAAA` + `HH:MM` en `Date` locale, ou `null` si
 * elle ne désigne pas un instant réel.
 *
 * Le constructeur `Date` ne rejette pas les dates impossibles, il les reporte :
 * le 31/02 devient le 3 mars, `25:00` déborde sur le lendemain. On relit donc
 * les champs de la date obtenue pour vérifier qu'ils correspondent à la saisie.
 */
export function parseRevealAt(dateInput: string, timeInput: string): Date | null {
  const dateMatch = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(dateInput.trim());
  const timeMatch = /^(\d{1,2}):(\d{2})$/.exec(timeInput.trim());
  if (!dateMatch || !timeMatch) return null;

  const day = Number(dateMatch[1]);
  const month = Number(dateMatch[2]);
  const year = Number(dateMatch[3]);
  const hours = Number(timeMatch[1]);
  const minutes = Number(timeMatch[2]);

  if (hours > 23 || minutes > 59) return null;

  const parsed = new Date(year, month - 1, day, hours, minutes, 0, 0);
  const reported =
    parsed.getFullYear() !== year ||
    parsed.getMonth() !== month - 1 ||
    parsed.getDate() !== day;

  return reported ? null : parsed;
}

/** « mardi 4 août à 20:00 ». */
export function formatRevealAt(date: Date): string {
  const weekday = WEEKDAYS[date.getDay()];
  const month = MONTHS[date.getMonth()];
  const day = date.getDate();
  const dayLabel = day === 1 ? '1er' : String(day);
  return `${weekday} ${dayLabel} ${month} à ${toTimeInput(date)}`;
}

/** « 04/08/26 - 20:00 » — sans le jour de la semaine, année sur deux chiffres. */
export function formatShortDateTime(date: Date): string {
  const year2 = pad(date.getFullYear() % 100);
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${year2} - ${toTimeInput(date)}`;
}

/** « 26 NOVEMBRE 2024 » — jour, mois en toutes lettres et année, tout en
 * majuscules : mise en forme officielle du Sceau d'Orgueil (tampon de
 * verdict), qui ne reprend ni le format `JJ/MM/AAAA` ni le jour de la
 * semaine des autres affichages. */
export function formatStampDate(date: Date): string {
  return `${date.getDate()} ${MONTHS[date.getMonth()].toUpperCase()} ${date.getFullYear()}`;
}

/**
 * « Prédit 4 jours à l’avance » ou, en-deçà de 24 h, « Prédit 3 heures à
 * l’avance » — l'écart entre le scellé et la révélation compterait comme
 * « 0 jour » sinon, peu lisible pour une prédiction posée le matin pour le
 * soir même.
 */
export function formatAdvance(createdAt: Date, revealAt: Date): string {
  const totalHours = (revealAt.getTime() - createdAt.getTime()) / 3_600_000;

  if (totalHours < 24) {
    const hours = Math.max(0, Math.round(totalHours));
    return `Prédit ${hours} heure${hours > 1 ? 's' : ''} à l’avance`;
  }

  const days = Math.max(0, Math.round(totalHours / 24));
  return `Prédit ${days} jour${days > 1 ? 's' : ''} à l’avance`;
}

/** « à l’instant », « il y a 12 min », « il y a 3 h », « il y a 2 jours ». */
export function formatTimeAgo(iso: string, now: Date): string {
  const minutes = Math.floor((now.getTime() - new Date(iso).getTime()) / 60_000);
  if (minutes < 1) return 'à l’instant';
  if (minutes < 60) return `il y a ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `il y a ${hours} h`;
  const days = Math.floor(hours / 24);
  return days === 1 ? 'il y a 1 jour' : `il y a ${days} jours`;
}

/** « dans 12 min », « dans 3 h 05 », « dans 4 jours ». */
export function formatCountdown(target: Date, from: Date): string {
  const ms = target.getTime() - from.getTime();
  if (ms <= 0) return 'révélée';

  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) return 'dans moins d’une minute';
  if (minutes < 60) return `dans ${minutes} min`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    const rest = minutes % 60;
    return rest === 0 ? `dans ${hours} h` : `dans ${hours} h ${pad(rest)}`;
  }

  const days = Math.floor(hours / 24);
  return days === 1 ? 'dans 1 jour' : `dans ${days} jours`;
}
