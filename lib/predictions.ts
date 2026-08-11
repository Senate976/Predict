import type { PostgrestError } from '@supabase/supabase-js';

import type { AnswerFormat, PredictionType } from './questions';
import { supabase } from './supabase';

export type PredictionScope = 'circle' | 'selected' | 'group';

export type EmojiReaction =
  | '👍'
  | '🖕'
  | '❤️'
  | '👎'
  | '😊'
  | '😮'
  | '😢'
  | '🫣'
  | '😬'
  | '🤣'
  | '💀'
  | '🔮';

/** 12 réactions, un multiple de 6 : la bulle de sélection s'affiche en 2
 * rangées de 6 (voir `EMOJI_COLUMNS` dans PredictionCard.tsx). */
export const EMOJI_REACTIONS: EmojiReaction[] = [
  '👍',
  '❤️',
  '😊',
  '😮',
  '😢',
  '👎',
  '🖕',
  '🫣',
  '😬',
  '🤣',
  '💀',
  '🔮',
];

/**
 * Une prédiction telle que renvoyée par la vue `public.predictions_feed`.
 *
 * `content` est `null` tant que la RLS de `prediction_contents` ne le laisse
 * pas passer — c'est-à-dire tant que l'appelant n'est ni l'auteur, ni un
 * destinataire après `reveal_at`. Le Teaser, lui, est toujours présent : c'est
 * la promesse du Cercle, lisible dès la création.
 */
export type PredictionFeedItem = {
  id: string;
  author_id: string;
  teaser: string;
  content: string | null;
  /** Chemin dans le bucket `prediction-audio`, ou `null` sans message vocal. Soumis à la même RLS que `content`. */
  audio_path: string | null;
  /** ISO 8601, en UTC. */
  reveal_at: string;
  scope: PredictionScope;
  /** `true` : aucune date fixée par l'auteur, `reveal_at` porte une valeur
   * lointaine sans signification propre — ne jamais l'afficher tel quel dans
   * ce cas, seule la révélation manuelle (`revealPredictionNow`) compte. */
  open_ended: boolean;
  /** Révélée dès la création (pas de suspense à lever) : le vote porte alors
   * sur « j'y crois / j'y crois pas », jamais sur « réalisée / manquée ». */
  is_immediate: boolean;
  /** `declaration` (comportement historique) ou `question` — voir `lib/questions.ts`. */
  type: PredictionType;
  /** `null` pour une Déclaration ; format de réponse attendu pour une Question. */
  answer_format: AnswerFormat | null;
  created_at: string;
  is_revealed: boolean;
  /** `pending` tant que l'auteur n'a pas affirmé le résultat (voir
   * `setPredictionVerdict`) — jamais déduit d'un vote du Cercle. */
  final_status: PredictionOutcomeStatus;
  /** Date à laquelle l'auteur a affirmé `final_status` — `null` tant que
   * `pending`. Sert de date au Sceau d'Orgueil (tampon « ENCORE RAISON »),
   * figée comme un vrai tampon dateur plutôt que recalculée à l'affichage. */
  verdict_set_at: string | null;
  /** Préférences propres à l'appelant — jamais partagées avec les autres. */
  is_favorite: boolean;
  is_hidden: boolean;
  /** Posée au premier tap sur la carte — sert au badge de compteur des
   * onglets et au surlignage des cartes non lues. */
  is_seen: boolean;
  /** Posée après la première apparition de l'animation de pulsation verte
   * du verdict Réalisé, pour cet utilisateur — ne rejoue jamais deux fois. */
  is_verdict_seen: boolean;
  /** `{ '👍': 2, '❤️': 1, ... }` — absent des clés sans aucune réaction. */
  emoji_counts: Partial<Record<EmojiReaction, number>>;
  my_emoji_reaction: EmojiReaction | null;
  /** Ids des amis explicitement cités via « @pseudo » dans le teaser — voir `extractMentionedUsernames`. */
  mentioned_user_ids: string[];
  /** Nombre de réponses reçues — pour une Question, visible même avant
   * Clôture (contrairement au détail des réponses elles-mêmes, caché
   * jusque-là). Toujours `0` pour une Déclaration. */
  answer_count: number;
  /** La propre réponse de l'appelant à cette Question, si déjà posée — visible
   * avant Clôture (pour se relire/la modifier), `null` pour une Déclaration
   * ou tant qu'aucune réponse n'a été soumise. Exactement l'un des deux
   * (`my_answer_text`/`my_answer_option_id`) selon `answer_format`. */
  my_answer_text: string | null;
  my_answer_option_id: string | null;
  /** `null` tant que l'auteur n'a rien validé — voir `setAnswerCorrectness`. */
  my_answer_is_correct: boolean | null;
};

/** Doivent rester alignés sur les contraintes `predictions_*_length` du SQL. */
export const MAX_TEASER_LENGTH = 160;
export const MAX_CONTENT_LENGTH = 240;

/**
 * Marge minimale entre maintenant et la révélation.
 *
 * La policy d'insert refuse `reveal_at <= now()`. Sans cette marge, une date
 * encore valide au moment du clic peut être passée quand la base la reçoit, et
 * l'insert échoue sur une erreur RLS incompréhensible pour l'utilisateur.
 */
export const MIN_REVEAL_DELAY_MS = 60_000;

export function isRevealed(prediction: Pick<PredictionFeedItem, 'reveal_at'>, now: Date): boolean {
  return new Date(prediction.reveal_at).getTime() <= now.getTime();
}

/**
 * Signale une table ou fonction absente du schéma — en pratique,
 * `supabase/schema.sql` pas encore (ré)exécuté dans le SQL Editor.
 *
 * PostgREST répond `PGRST205` (table/vue) ou `PGRST202` (fonction RPC) depuis
 * son cache de schéma et ne laisse pas remonter le code Postgres d'origine.
 */
export function isMissingSchema(error: PostgrestError): boolean {
  return error.code === 'PGRST205' || error.code === 'PGRST202';
}

const MISSING_SCHEMA_MESSAGE =
  'Schéma introuvable (table, vue ou fonction). Exécute supabase/schema.sql dans le SQL Editor.';

/** Traduit les erreurs de lecture du fil de prédictions. */
export function feedErrorMessage(error: PostgrestError): string {
  if (isMissingSchema(error)) return MISSING_SCHEMA_MESSAGE;
  return `Chargement impossible : ${error.message}`;
}

/** Traduit les erreurs de la RPC `create_prediction`. */
export function predictionErrorMessage(error: PostgrestError): string {
  if (isMissingSchema(error)) return MISSING_SCHEMA_MESSAGE;

  switch (error.code) {
    // Violation d'une des contraintes check (longueur ou portée invalide).
    case '23514':
      if (error.message.includes('predictions_teaser_length')) {
        return `Le teaser doit faire entre 1 et ${MAX_TEASER_LENGTH} caractères.`;
      }
      if (error.message.includes('prediction_contents_length')) {
        return `Le contenu secret doit faire entre 1 et ${MAX_CONTENT_LENGTH} caractères.`;
      }
      return `Prédiction invalide : ${error.message}`;
    // RLS. Soit la date de révélation n'est plus future, soit un destinataire
    // choisi n'est pas (ou plus) un ami accepté.
    case '42501':
      return 'Enregistrement refusé : vérifie la date de révélation et que les destinataires sont bien dans ton Cercle.';
    default:
      return `Enregistrement impossible : ${error.message}`;
  }
}

/**
 * Le fil visible par l'utilisateur connecté : ses propres prédictions, et
 * celles où on lui a donné accès. La RLS de `predictions_feed` fait tout le
 * tri — cette fonction ne filtre rien de plus, elle se contente de trier.
 *
 * Tri par `created_at` et non `reveal_at` : c'est un fil d'actualité — l'ordre
 * dans lequel les choses ont été publiées, pas celui de leur révélation.
 */
const FEED_COLUMNS =
  'id, author_id, teaser, content, audio_path, reveal_at, scope, open_ended, is_immediate, type, answer_format, ' +
  'created_at, is_revealed, final_status, verdict_set_at, is_favorite, is_hidden, is_seen, is_verdict_seen, ' +
  'emoji_counts, my_emoji_reaction, mentioned_user_ids, answer_count, my_answer_text, my_answer_option_id, ' +
  'my_answer_is_correct';

export async function fetchPredictionsFeed() {
  return supabase
    .from('predictions_feed')
    .select(FEED_COLUMNS)
    .order('created_at', { ascending: false })
    .returns<PredictionFeedItem[]>();
}

export async function fetchPrediction(predictionId: string) {
  return supabase
    .from('predictions_feed')
    .select(FEED_COLUMNS)
    .eq('id', predictionId)
    .maybeSingle()
    .returns<PredictionFeedItem>();
}

export async function createPrediction(input: {
  teaser: string;
  content: string;
  revealAt: Date;
  scope: PredictionScope;
  friendIds: string[];
  groupId?: string | null;
  /** Ids d'amis mentionnés via « @pseudo » dans le teaser — reçoivent un accès
   * et une notification même hors du scope choisi. Revérifiés côté base. */
  mentionedFriendIds?: string[];
  /** Aucune date fixée par l'auteur : `revealAt` porte alors un repère
   * technique lointain (voir `computeOpenEndedRevealAt`), jamais affiché. */
  openEnded?: boolean;
  /** Révélation dès la création — `revealAt` est alors ignoré, la base pose
   * elle-même `now()` (voir `create_prediction`). Bascule le vote en
   * « j'y crois / j'y crois pas » plutôt qu'en « réalisée / manquée », vu
   * qu'il n'y a rien à constater : seulement une opinion à donner. */
  isImmediate?: boolean;
  /** `declaration` par défaut côté base si omis. `answerFormat`/`answerOptions`
   * n'ont de sens que pour `type: 'question'` — voir `lib/questions.ts`. */
  type?: PredictionType;
  answerFormat?: AnswerFormat;
  /** Labels des options, dans l'ordre — requis (au moins deux) si
   * `answerFormat: 'choice'`, ignoré sinon. */
  answerOptions?: string[];
}) {
  const result = await supabase.rpc('create_prediction', {
    p_teaser: input.teaser.trim(),
    p_content: input.content.trim(),
    p_reveal_at: input.revealAt.toISOString(),
    p_scope: input.scope,
    p_friend_ids: input.scope === 'selected' ? input.friendIds : [],
    p_group_id: input.scope === 'group' ? input.groupId ?? null : null,
    p_mentioned_ids: input.mentionedFriendIds ?? [],
    p_open_ended: input.openEnded ?? false,
    p_is_immediate: input.isImmediate ?? false,
    p_type: input.type ?? 'declaration',
    p_answer_format: input.answerFormat ?? null,
    p_answer_options: input.answerOptions ?? null,
  });
  return result as { data: string | null; error: PostgrestError | null };
}

/** Nombre d'années utilisé comme repère technique pour une prédiction
 * « ouverte » (sans date fixe) — jamais affiché tel quel, cf. `open_ended`. */
export const OPEN_ENDED_PLACEHOLDER_YEARS = 50;

export function computeOpenEndedRevealAt(): Date {
  const date = new Date();
  date.setFullYear(date.getFullYear() + OPEN_ENDED_PLACEHOLDER_YEARS);
  return date;
}

/** Repère les « @pseudo » dans un texte — mêmes caractères autorisés que la
 * validation du pseudo à l'inscription (lettres, chiffres, « _ » et « . »). */
const MENTION_REGEX = /@([a-zA-Z0-9_.]+)/g;

export function extractMentionedUsernames(text: string): string[] {
  const usernames = new Set<string>();
  for (const match of text.matchAll(MENTION_REGEX)) {
    usernames.add(match[1].toLowerCase());
  }
  return Array.from(usernames);
}

/** Choix stable (pas un vrai tirage à chaque rendu, qui ferait clignoter le
 * nom affiché) dérivé de l'id de la prédiction — se comporte comme un
 * aléatoire différent d'une prédiction à l'autre, sans jamais changer pour
 * une même carte entre deux rendus. */
function stableIndex(seed: string, length: number): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return hash % length;
}

/**
 * Étiquette « X cité » à afficher pour les amis mentionnés (« @pseudo ») dans
 * un teaser — jamais la liste complète (ça empiète sur le pseudo de
 * l'auteur, sur la même ligne). Personnalisée : une personne citée voit
 * toujours son propre nom en premier ; les autres destinataires voient un nom
 * choisi de préférence parmi leurs propres amis quand l'un des cités en fait
 * partie, sinon un choix stable parmi tous les cités.
 */
export function buildMentionLabel(
  predictionId: string,
  mentionedIds: string[],
  usernameById: Record<string, string | undefined>,
  viewerId: string,
  viewerFriendIds: ReadonlySet<string>
): string | null {
  if (mentionedIds.length === 0) return null;

  let featuredId: string;
  if (mentionedIds.includes(viewerId)) {
    featuredId = viewerId;
  } else {
    const friendMatches = mentionedIds.filter((id) => viewerFriendIds.has(id));
    const pool = friendMatches.length > 0 ? friendMatches : mentionedIds;
    featuredId = pool[stableIndex(predictionId, pool.length)];
  }

  const featuredName = usernameById[featuredId] ?? '…';
  return mentionedIds.length === 1
    ? `${featuredName} cité`
    : `${featuredName} cité, ainsi que d’autres personnes`;
}

/**
 * Révélation à la demande de l'auteur, avant (ou sans) date fixe — la RLS de
 * `reveal_prediction_now` (security definer) réserve l'action à l'auteur et
 * n'a d'effet que si la prédiction n'est pas déjà révélée.
 */
export async function revealPredictionNow(predictionId: string) {
  return supabase.rpc('reveal_prediction_now', { p_prediction_id: predictionId });
}

/**
 * Favori/masqué/vu : une préférence propre à l'appelant, jamais partagée.
 * `upsert` plutôt qu'un `update` : la ligne peut ne pas exister encore (aucune
 * préférence posée jusque-là) — `onConflict` bascule alors en update sans
 * écraser les autres champs que celui qu'on modifie.
 */
export async function setPredictionUserState(
  predictionId: string,
  userId: string,
  patch: { favorite?: boolean; hidden?: boolean; seen?: boolean; verdictSeen?: boolean }
) {
  const { verdictSeen, ...rest } = patch;
  return supabase
    .from('prediction_user_state')
    .upsert(
      {
        prediction_id: predictionId,
        user_id: userId,
        ...rest,
        ...(verdictSeen !== undefined ? { verdict_seen: verdictSeen } : {}),
      },
      { onConflict: 'prediction_id,user_id' }
    );
}

/**
 * Pose ou change sa réaction emoji sur une prédiction — `upsert` : contrairement
 * à l'ancien choix Confiance/Pas confiance (irréversible, retiré), on peut
 * changer d'avis librement.
 */
export async function castEmojiReaction(predictionId: string, userId: string, emoji: EmojiReaction) {
  return supabase
    .from('prediction_emoji_reactions')
    .upsert(
      { prediction_id: predictionId, user_id: userId, emoji },
      { onConflict: 'prediction_id,user_id' }
    );
}

/** Retire sa réaction — refaire le même emoji bascule en « aucune réaction ». */
export async function removeEmojiReaction(predictionId: string, userId: string) {
  return supabase
    .from('prediction_emoji_reactions')
    .delete()
    .eq('prediction_id', predictionId)
    .eq('user_id', userId);
}

/** Qui a réagi, et avec quel emoji — pour le détail « qui a mis quoi ». */
export type EmojiReactor = {
  user_id: string;
  emoji: EmojiReaction;
  username: string;
  avatar_url: string | null;
};

/**
 * Le détail des réactions d'une prédiction, une par personne. Deux requêtes
 * plutôt qu'un embed PostgREST — même raison que `fetchPredictionRecipients`
 * ci-dessus.
 */
export async function fetchEmojiReactors(predictionId: string) {
  const { data, error } = await supabase
    .from('prediction_emoji_reactions')
    .select('user_id, emoji')
    .eq('prediction_id', predictionId)
    .order('created_at', { ascending: true });

  if (error || !data) {
    return { data: null, error };
  }

  if (data.length === 0) {
    return { data: [] as EmojiReactor[], error: null };
  }

  const userIds = data.map((r) => r.user_id);
  const { data: profiles, error: profilesError } = await supabase
    .from('profiles')
    .select('id, username, avatar_url')
    .in('id', userIds);

  if (profilesError) {
    return { data: null, error: profilesError };
  }

  const byId = new Map((profiles ?? []).map((p) => [p.id, p]));
  const reactors: EmojiReactor[] = data.map((r) => ({
    user_id: r.user_id,
    emoji: r.emoji as EmojiReaction,
    username: byId.get(r.user_id)?.username ?? '…',
    avatar_url: byId.get(r.user_id)?.avatar_url ?? null,
  }));

  return { data: reactors, error: null };
}

/** Un destinataire d'une prédiction, avec son profil assemblé côté client. */
export type PredictionRecipient = {
  user_id: string;
  profile: { username: string };
};

/**
 * Visible par l'auteur et par tout autre destinataire (RLS de
 * `prediction_access`, section 11 du schéma).
 *
 * Volontairement en deux requêtes plutôt qu'un embed PostgREST
 * (`profile:profiles(username)`) : cet embed dépend du cache de schéma de
 * PostgREST, qui s'est révélé intermittent sur ce projet (même classe
 * d'erreur que pour `friendships`/`profiles`, déjà contournée dans
 * lib/friends.ts) — d'où « could not find a relationship between
 * prediction_access and profiles ». Deux requêtes simples puis un
 * assemblage côté client élimine cette classe de panne.
 */
export async function fetchPredictionRecipients(predictionId: string) {
  const { data, error } = await supabase
    .from('prediction_access')
    .select('user_id')
    .eq('prediction_id', predictionId);

  if (error || !data) {
    return { data: null, error };
  }

  if (data.length === 0) {
    return { data: [] as PredictionRecipient[], error: null };
  }

  const userIds = data.map((r) => r.user_id);
  const { data: profiles, error: profilesError } = await supabase
    .from('profiles')
    .select('id, username')
    .in('id', userIds);

  if (profilesError) {
    return { data: null, error: profilesError };
  }

  const byId = new Map((profiles ?? []).map((p) => [p.id, p]));
  const recipients: PredictionRecipient[] = data.map((r) => ({
    user_id: r.user_id,
    profile: { username: byId.get(r.user_id)?.username ?? '…' },
  }));

  return { data: recipients, error: null };
}

/**
 * Ajoute un destinataire à une prédiction existante. La RLS exige que ce soit
 * l'auteur qui agisse et que la personne ajoutée soit un ami accepté — sinon
 * l'insert est refusé (42501). Déclenche immédiatement la notification
 * `new_teaser` côté base (trigger sur `prediction_access`).
 *
 * `upsert` + `ignoreDuplicates` plutôt qu'un `insert` : si la personne a déjà
 * accès (scope « Tout mon Cercle »/« Groupe » à la création, ou un ajout
 * précédent), un simple insert violerait la clé primaire
 * `(prediction_id, user_id)` — l'intention de l'auteur (« cette personne doit
 * avoir accès ») est de toute façon déjà satisfaite, donc on ne fait rien
 * plutôt que de faire échouer l'action sur une contrainte unique.
 */
export async function addRecipient(predictionId: string, userId: string) {
  return supabase
    .from('prediction_access')
    .upsert(
      { prediction_id: predictionId, user_id: userId },
      { onConflict: 'prediction_id,user_id', ignoreDuplicates: true }
    );
}

/** Retire un destinataire, à tout moment (avant ou après révélation). */
export async function removeRecipient(predictionId: string, userId: string) {
  return supabase
    .from('prediction_access')
    .delete()
    .eq('prediction_id', predictionId)
    .eq('user_id', userId);
}

/**
 * Supprime la prédiction elle-même — réservé à l'auteur (RLS
 * `predictions_delete_own`), à tout moment. Entraîne en cascade la
 * suppression de son contenu, de son audience, des votes et des
 * commentaires (contraintes `on delete cascade`).
 */
export async function deletePrediction(predictionId: string) {
  return supabase.from('predictions').delete().eq('id', predictionId);
}

export type PredictionOutcomeStatus = 'pending' | 'realized' | 'missed';

/**
 * Une prédiction de l'auteur avec son statut final, tel que calculé par la
 * vue `public.prediction_outcomes` — depuis `author_verdict`, jamais un vote
 * du Cercle. Alimente les 4 compteurs et l'historique filtrable du Profil.
 */
export type PredictionOutcome = {
  prediction_id: string;
  author_id: string;
  teaser: string;
  reveal_at: string;
  created_at: string;
  is_revealed: boolean;
  final_status: PredictionOutcomeStatus;
};

/** Réservé à la lecture de ses propres prédictions (RLS de `predictions`). */
export async function fetchPredictionOutcomes(authorId: string) {
  return supabase
    .from('prediction_outcomes')
    .select('prediction_id, author_id, teaser, reveal_at, created_at, is_revealed, final_status')
    .eq('author_id', authorId)
    .order('created_at', { ascending: false })
    .returns<PredictionOutcome[]>();
}

/**
 * L'auteur affirme (ou corrige) si sa prédiction s'est réalisée ou a été
 * manquée. Ne fait rien si la prédiction n'est pas encore révélée ou si
 * l'appelant n'en est pas l'auteur — `set_prediction_verdict` (security
 * definer) porte elle-même ce garde-fou. Notifie chaque destinataire dans la
 * foulée, côté base, la première fois que ce verdict précis est posé.
 *
 * La fonction accepte un appel répété (correction) sans restriction : c'est
 * le client qui décide où proposer quoi — le Fil (PredictionCard) tant
 * qu'aucun verdict n'est posé, l'écran détail pour revenir dessus ensuite.
 */
export async function setPredictionVerdict(predictionId: string, verdict: 'realized' | 'missed') {
  return supabase.rpc('set_prediction_verdict', { p_prediction_id: predictionId, p_verdict: verdict });
}

export type PredictionStats = { total: number; realized: number; missed: number; pending: number };

/**
 * Compteurs agrégés des scellés d'un utilisateur (Total/Réalisées/Manquées/
 * En cours), pour la vue "Profil d'un ami" — jamais le détail des prédictions,
 * juste des totaux. `get_prediction_stats` (security definer) réserve l'accès
 * à soi-même ou à un ami accepté, et renvoie des zéros sinon.
 */
export async function fetchPredictionStats(targetUserId: string) {
  const { data, error } = await supabase
    .rpc('get_prediction_stats', { target_user: targetUserId })
    .maybeSingle()
    .returns<PredictionStats>();

  if (error || !data) {
    return { data: { total: 0, realized: 0, missed: 0, pending: 0 }, error };
  }

  return {
    data: {
      total: Number(data.total),
      realized: Number(data.realized),
      missed: Number(data.missed),
      pending: Number(data.pending),
    } satisfies PredictionStats,
    error: null,
  };
}

export type Prediscore = { score: number | null; weightedCount: number };

/**
 * Le Prediscore pondéré d'un utilisateur : pourcentage de prédictions
 * révélées avérées vraies, pondéré par le délai d'annonce (coefficient 1/3/5).
 * `score` reste `null` tant qu'aucune prédiction révélée n'existe — à
 * distinguer d'un score de 0%, qui est un vrai résultat.
 */
export async function fetchPrediscore(targetUserId: string) {
  const { data, error } = await supabase
    .rpc('get_prediscore', { target_user: targetUserId })
    .maybeSingle()
    .returns<{ score: number | null; weighted_count: number }>();

  if (error || !data) {
    return { data: { score: null, weightedCount: 0 } satisfies Prediscore, error };
  }

  return {
    data: {
      score: data.score === null ? null : Number(data.score),
      weightedCount: Number(data.weighted_count),
    } satisfies Prediscore,
    error: null,
  };
}
