import type { PostgrestError } from '@supabase/supabase-js';

import { supabase } from './supabase';

/** `declaration` : le fonctionnement historique (une affirmation secrète
 * jusqu'à révélation). `question` : l'auteur pose une question visible
 * immédiatement, le Cercle y répond — ce que la Clôture cache, ce sont les
 * réponses des autres, jamais la question elle-même. */
export type PredictionType = 'declaration' | 'question';

/** `text` : chacun écrit sa propre réponse. `choice` : l'auteur a défini des
 * options à la création (`prediction_answer_options`), chacun en choisit une. */
export type AnswerFormat = 'text' | 'choice';

/** Doit rester aligné sur la contrainte `prediction_answers_*` du SQL. */
/** Court comme une option de Sondage : on répond d'un mot ou deux, pas d'un
 * paragraphe. Aucune mention à l'écran — le champ s'arrête, sans explication
 * à donner pour une limite qu'on n'atteint quasiment jamais en répondant. */
export const MAX_ANSWER_LENGTH = 30;

/** Une option prédéfinie (format « choix »), visible dès la création — ce
 * n'est pas un secret, seulement l'énoncé de la Question. */
export type PredictionAnswerOption = {
  id: string;
  prediction_id: string;
  label: string;
  position: number;
};

/**
 * Une réponse individuelle, avec son profil assemblé côté client — même
 * pattern en deux requêtes que `fetchEmojiReactors`/`fetchPredictionRecipients`
 * dans `lib/predictions.ts` (embed PostgREST intermittent sur ce projet).
 * `is_correct` reste `null` tant que l'auteur n'a rien validé, une fois la
 * Question close.
 */
export type PredictionAnswer = {
  id: string;
  user_id: string;
  answer_text: string | null;
  option_id: string | null;
  is_correct: boolean | null;
  username: string;
  avatar_url: string | null;
};

/** Traduit les erreurs des RPC `submit_prediction_answer`/`set_prediction_answer_correct`.
 * `PGRST205`/`PGRST202` : table/vue ou fonction absente du cache de schéma
 * PostgREST — en pratique, `supabase/schema.sql` pas encore (ré)exécuté. */
export function questionAnswerErrorMessage(error: PostgrestError): string {
  if (error.code === 'PGRST205' || error.code === 'PGRST202') {
    return 'Schéma introuvable (table, vue ou fonction). Exécute supabase/schema.sql dans le SQL Editor.';
  }
  return error.message || 'Action impossible.';
}

/** Options d'une Question à choix multiples, dans leur ordre de création —
 * vide (jamais `null`) pour une Question en texte libre. */
export async function fetchAnswerOptions(predictionId: string) {
  return supabase
    .from('prediction_answer_options')
    .select('id, prediction_id, label, position')
    .eq('prediction_id', predictionId)
    .order('position', { ascending: true })
    .returns<PredictionAnswerOption[]>();
}

/**
 * Les réponses d'une Question — la RLS de `prediction_answers` ne renvoie
 * quoi que ce soit d'autre que sa propre ligne tant que la Question n'est
 * pas close (voir schema.sql, section 42) : cette fonction ne fait
 * qu'assembler ce que la base a bien voulu rendre.
 */
export async function fetchPredictionAnswers(predictionId: string) {
  const { data, error } = await supabase
    .from('prediction_answers')
    .select('id, user_id, answer_text, option_id, is_correct')
    .eq('prediction_id', predictionId)
    .order('created_at', { ascending: true });

  if (error || !data) {
    return { data: null, error };
  }

  if (data.length === 0) {
    return { data: [] as PredictionAnswer[], error: null };
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
  const answers: PredictionAnswer[] = data.map((r) => ({
    id: r.id,
    user_id: r.user_id,
    answer_text: r.answer_text,
    option_id: r.option_id,
    is_correct: r.is_correct,
    username: byId.get(r.user_id)?.username ?? '…',
    avatar_url: byId.get(r.user_id)?.avatar_url ?? null,
  }));

  return { data: answers, error: null };
}

/** Un votant, sans sa réponse — voir `fetchPredictionVoters`. */
export type PredictionVoter = {
  user_id: string;
  username: string;
  avatar_url: string | null;
};

/**
 * Qui a répondu à un Sondage, avant Clôture — l'identité seule, jamais la
 * réponse. Passe par la RPC `get_prediction_voters` : la RLS de
 * `prediction_answers` masque la ligne entière tant que le Sondage n'est pas
 * clos (pseudo compris), et c'est très bien ainsi — la fonction SQL, elle,
 * ne sélectionne que `user_id`, `username` et `avatar_url`, si bien que le
 * contenu des réponses ne peut pas fuiter, quoi qu'affiche l'app.
 */
export async function fetchPredictionVoters(predictionId: string) {
  const { data, error } = await supabase.rpc('get_prediction_voters', {
    p_prediction_id: predictionId,
  });

  // `rpc()` type la sortie comme une ligne unique alors que la fonction SQL
  // en renvoie un ensemble (`returns table`) : sans types générés depuis la
  // base, TypeScript ne peut pas le deviner. D'où ce recadrage explicite, le
  // même que pour n'importe quelle liste renvoyée par une RPC.
  return { data: (data as unknown as PredictionVoter[] | null) ?? null, error };
}

/**
 * Répond à une Question — définitif, un seul appel réussi par personne.
 * Fournir `text` ou `optionId` selon le format de la Question —
 * `submit_prediction_answer` (security definer) refuse tout appel qui ne
 * correspond pas au format stocké, arrivé après Clôture, sans accès, ou
 * qui tenterait de répondre une seconde fois.
 */
export async function submitPredictionAnswer(
  predictionId: string,
  answer: { text: string } | { optionId: string }
) {
  return supabase.rpc('submit_prediction_answer', {
    p_prediction_id: predictionId,
    p_answer_text: 'text' in answer ? answer.text.trim() : null,
    p_option_id: 'optionId' in answer ? answer.optionId : null,
  });
}

/**
 * L'auteur valide qui a deviné juste, une fois la Question close —
 * `set_prediction_answer_correct` (security definer) réserve l'action à
 * l'auteur et n'a d'effet qu'après Clôture.
 */
export async function setAnswerCorrectness(answerId: string, isCorrect: boolean) {
  return supabase.rpc('set_prediction_answer_correct', {
    p_answer_id: answerId,
    p_is_correct: isCorrect,
  });
}
