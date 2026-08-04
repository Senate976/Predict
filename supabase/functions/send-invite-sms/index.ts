// Envoie un SMS d'invitation Predict à un numéro de téléphone, et enregistre
// l'invitation (`phone_invites`) pour que le futur compte créé avec ce même
// numéro reçoive automatiquement une demande d'ami de la part de l'auteur de
// l'invitation — voir le déclencheur `handle_phone_invite_match` dans
// supabase/schema.sql.
//
// Secrets requis, à définir plus tard dans le Dashboard Supabase (Edge
// Functions > send-invite-sms > Secrets) :
//   TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER
// Tant qu'ils ne sont pas configurés, la fonction répond `not_configured`
// sans planter — l'appli affiche alors un message générique.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

function normalizePhone(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const digits = trimmed.replace(/[^0-9+]/g, '');
  if (digits.startsWith('+')) return digits;
  if (digits.startsWith('0')) return `+33${digits.slice(1)}`;
  return digits || null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return jsonResponse({ error: 'unauthorized' }, 401);
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData.user) {
      return jsonResponse({ error: 'unauthorized' }, 401);
    }

    const body = await req.json().catch(() => ({}));
    const normalized = typeof body.phone === 'string' ? normalizePhone(body.phone) : null;
    if (!normalized) {
      return jsonResponse({ error: 'invalid_phone' }, 400);
    }

    const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
    const authToken = Deno.env.get('TWILIO_AUTH_TOKEN');
    const fromNumber = Deno.env.get('TWILIO_FROM_NUMBER');
    if (!accountSid || !authToken || !fromNumber) {
      return jsonResponse({ error: 'not_configured' }, 503);
    }

    const { data: inviterProfile } = await supabase
      .from('profiles')
      .select('username')
      .eq('id', userData.user.id)
      .maybeSingle();

    const { data: invite, error: insertError } = await supabase
      .from('phone_invites')
      .insert({ inviter_id: userData.user.id, phone: normalized })
      .select('id')
      .single();

    if (insertError || !invite) {
      return jsonResponse({ error: 'insert_failed' }, 500);
    }

    const message =
      `${inviterProfile?.username ?? 'Quelqu’un'} t’invite à rejoindre Predict ! ` +
      'Télécharge l’appli et crée ton compte avec ce numéro pour être automatiquement mis en relation.';

    const twilioResponse = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
      {
        method: 'POST',
        headers: {
          Authorization: `Basic ${btoa(`${accountSid}:${authToken}`)}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({ To: normalized, From: fromNumber, Body: message }),
      }
    );

    if (!twilioResponse.ok) {
      // Le SMS n'est pas parti : inutile de garder une invitation fantôme.
      await supabase.from('phone_invites').delete().eq('id', invite.id);
      return jsonResponse({ error: 'send_failed' }, 502);
    }

    return jsonResponse({ ok: true });
  } catch (unexpected) {
    return jsonResponse({ error: 'unexpected', message: String(unexpected) }, 500);
  }
});
