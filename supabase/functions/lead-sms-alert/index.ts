/**
 * Supabase Edge Function: Database Webhook on `public.messages` INSERT → optional Twilio SMS and/or Resend email
 * when chat silence exceeds workspace-configured thresholds (`metadata.lead_inactivity_timeout`,
 * `metadata.member_inactivity_timeout`); needs `metadata.lead_alert_phone` and/or `RESEND` + `ADMIN_ALERT_EMAIL`.
 *
 * Secrets (set in Supabase Dashboard → Edge Functions → Secrets):
 * - SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (auto-injected on hosted projects)
 * - APP_URL — origin for deep link, e.g. https://buddybubble.app (no trailing slash)
 * - TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER — Twilio Programmable SMS (optional; failures are logged, not fatal)
 * - RESEND_API_KEY, ADMIN_ALERT_EMAIL — Resend outbound email (optional; if configured, runs after Twilio attempt)
 * - RESEND_FROM_EMAIL — optional `from` address for Resend (defaults to onboarding@resend.dev)
 * - LEAD_SMS_ALERT_WEBHOOK_SECRET — required; send as `Authorization: Bearer <secret>` or `x-lead-sms-alert-secret`
 *
 * After a successful Twilio SMS and/or Resend email, `workspaces.metadata.last_sms_sent_at` is set to an ISO-8601 timestamp (name retained for compatibility).
 *
 * Configure the Database Webhook to POST this function’s URL with the default Supabase payload
 * (`type`, `table`, `schema`, `record`). `verify_jwt` should be false (see `supabase/config.toml`); authenticate
 * with the shared secret above.
 */
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-lead-sms-alert-secret',
};

type MessageRecord = {
  id?: string;
  bubble_id?: string;
  user_id?: string;
  created_at?: string;
};

type DbWebhookPayload = {
  type?: string;
  table?: string;
  schema?: string;
  record?: MessageRecord;
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

function readMetadataString(meta: Record<string, unknown>, key: string): string | null {
  const v = meta[key];
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t.length > 0 ? t : null;
}

function readTimeoutMinutes(
  meta: Record<string, unknown>,
  key: string,
  fallback: number,
  allowed: Set<number>,
): number {
  const v = meta[key];
  let n: number | null = null;
  if (typeof v === 'number' && Number.isInteger(v)) n = v;
  else if (typeof v === 'string' && /^\d+$/.test(v)) n = parseInt(v, 10);
  if (n !== null && allowed.has(n)) return n;
  return fallback;
}

const LEAD_TIMEOUT_ALLOWED = new Set([2, 5, 10, 30]);
const MEMBER_TIMEOUT_ALLOWED = new Set([15, 30, 60, 720, 1440]);

function minutesBetweenUtc(isoNewer: string, isoOlder: string): number {
  const a = Date.parse(isoNewer);
  const b = Date.parse(isoOlder);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  return (a - b) / 60_000;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return json({ ok: false, error: 'method_not_allowed' }, 405);
  }

  const webhookSecret = Deno.env.get('LEAD_SMS_ALERT_WEBHOOK_SECRET')?.trim();
  if (!webhookSecret) {
    console.error('[lead-sms-alert] missing LEAD_SMS_ALERT_WEBHOOK_SECRET');
    return json({ ok: false, error: 'server_misconfigured' }, 500);
  }
  const bearer =
    req.headers
      .get('authorization')
      ?.replace(/^Bearer\s+/i, '')
      ?.trim() ?? '';
  const headerSecret = req.headers.get('x-lead-sms-alert-secret')?.trim() ?? '';
  const token = headerSecret || bearer;
  if (!token || token !== webhookSecret) {
    // HTTP 200 limits DB webhook retry storms on bad auth (same pattern as bubble-agent-dispatch).
    return json({ ok: false, error: 'unauthorized' }, 200);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceKey) {
    return json({ ok: false, error: 'server_misconfigured' }, 500);
  }

  let payload: DbWebhookPayload;
  try {
    payload = (await req.json()) as DbWebhookPayload;
  } catch {
    return json({ ok: false, error: 'invalid_json' }, 200);
  }

  const evt = (payload.type ?? '').toUpperCase();
  if (payload.schema !== 'public' || payload.table !== 'messages' || evt !== 'INSERT') {
    return json({ ok: true, skipped: 'not_messages_insert' }, 200);
  }

  const { record: message } = payload;
  if (!message?.id || !message.bubble_id || !message.user_id) {
    return json({ ok: false, error: 'missing_record_fields' }, 200);
  }

  const createdAt = message.created_at;
  if (!createdAt || typeof createdAt !== 'string') {
    return json({ ok: false, error: 'missing_created_at' }, 200);
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: bubble, error: bubbleErr } = await supabase
    .from('bubbles')
    .select('workspace_id, bubble_type')
    .eq('id', message.bubble_id)
    .maybeSingle();

  if (bubbleErr) {
    console.error('[lead-sms-alert] bubbles', bubbleErr.message);
    return json({ ok: false, error: 'bubble_query_failed' }, 500);
  }
  const workspaceId = (bubble as { workspace_id?: string } | null)?.workspace_id;
  const bubbleType = String((bubble as { bubble_type?: string } | null)?.bubble_type ?? 'standard');
  if (!workspaceId) {
    return json({ ok: true, skipped: 'bubble_not_found' }, 200);
  }

  const { data: wm, error: wmErr } = await supabase
    .from('workspace_members')
    .select('role')
    .eq('workspace_id', workspaceId)
    .eq('user_id', message.user_id)
    .maybeSingle();

  if (wmErr) {
    console.error('[lead-sms-alert] workspace_members', wmErr.message);
    return json({ ok: false, error: 'membership_query_failed' }, 500);
  }
  const role = String((wm as { role?: string } | null)?.role ?? '');
  if (!role) {
    return json({ ok: true, skipped: 'no_workspace_membership' }, 200);
  }
  if (role === 'owner' || role === 'admin') {
    return json({ ok: true, skipped: 'author_is_owner_or_admin' }, 200);
  }

  const { data: ws, error: wsErr } = await supabase
    .from('workspaces')
    .select('metadata')
    .eq('id', workspaceId)
    .maybeSingle();

  if (wsErr) {
    console.error('[lead-sms-alert] workspaces', wsErr.message);
    return json({ ok: false, error: 'workspace_query_failed' }, 500);
  }

  const meta = asRecord((ws as { metadata?: unknown } | null)?.metadata);
  const alertPhone = readMetadataString(meta, 'lead_alert_phone');

  const resendApiKey = Deno.env.get('RESEND_API_KEY')?.trim();
  const adminAlertEmail = Deno.env.get('ADMIN_ALERT_EMAIL')?.trim();
  const canResend = !!(resendApiKey && adminAlertEmail);

  if (!alertPhone && !canResend) {
    return json({ ok: true, skipped: 'no_sms_or_email_configured' }, 200);
  }

  const threshold =
    bubbleType === 'trial'
      ? readTimeoutMinutes(meta, 'lead_inactivity_timeout', 5, LEAD_TIMEOUT_ALLOWED)
      : readTimeoutMinutes(meta, 'member_inactivity_timeout', 15, MEMBER_TIMEOUT_ALLOWED);

  const { data: prev, error: prevErr } = await supabase
    .from('messages')
    .select('id, created_at')
    .eq('bubble_id', message.bubble_id)
    .neq('id', message.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (prevErr) {
    console.error('[lead-sms-alert] previous message', prevErr.message);
    return json({ ok: false, error: 'previous_message_query_failed' }, 500);
  }

  const prevCreated = (prev as { created_at?: string } | null)?.created_at;
  if (prevCreated && typeof prevCreated === 'string') {
    const diffMinutes = minutesBetweenUtc(createdAt, prevCreated);
    if (diffMinutes < threshold) {
      return json({ ok: true, skipped: 'below_inactivity_threshold', diffMinutes, threshold }, 200);
    }
  }

  const appUrl = (Deno.env.get('APP_URL') ?? Deno.env.get('PUBLIC_APP_URL') ?? '').replace(
    /\/$/,
    '',
  );
  if (!appUrl) {
    console.error('[lead-sms-alert] missing APP_URL or PUBLIC_APP_URL');
    return json({ ok: true, skipped: 'app_url_not_configured' }, 200);
  }

  const replyUrl = `${appUrl}/app/${workspaceId}?bubble=${encodeURIComponent(message.bubble_id)}`;
  const smsBody = `BuddyBubble Alert: New message in ${bubbleType} chat. Reply: ${replyUrl}`;

  const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID')?.trim();
  const authToken = Deno.env.get('TWILIO_AUTH_TOKEN')?.trim();
  const twilioFrom = Deno.env.get('TWILIO_PHONE_NUMBER')?.trim();
  const canTwilio = !!(accountSid && authToken && twilioFrom && alertPhone);

  /** First successful channel (SMS or email) wins this timestamp for `last_sms_sent_at`. */
  let alertSentAt: string | null = null;

  if (canTwilio) {
    const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
    const form = new URLSearchParams();
    form.set('To', alertPhone!);
    form.set('From', twilioFrom!);
    form.set('Body', smsBody);

    const smsRes = await fetch(twilioUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${btoa(`${accountSid}:${authToken}`)}`,
      },
      body: form,
    });

    if (smsRes.ok) {
      alertSentAt = new Date().toISOString();
    } else {
      const detail = await smsRes.text().catch(() => '');
      console.error('[lead-sms-alert] twilio_sms_http_error', {
        status: smsRes.status,
        body: detail,
      });
    }
  } else {
    if (!alertPhone) {
      console.warn('[lead-sms-alert] twilio_skipped: no lead_alert_phone');
    } else {
      console.warn(
        '[lead-sms-alert] twilio_skipped: missing TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, or TWILIO_PHONE_NUMBER',
      );
    }
  }

  const resendFrom = Deno.env.get('RESEND_FROM_EMAIL')?.trim() || 'onboarding@resend.dev';

  if (canResend) {
    const emailRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${resendApiKey}`,
      },
      body: JSON.stringify({
        from: resendFrom,
        to: adminAlertEmail,
        subject: '🚨 BuddyBubble: New Trial Message!',
        text: smsBody,
      }),
    });

    if (emailRes.ok) {
      if (!alertSentAt) alertSentAt = new Date().toISOString();
    } else {
      const detail = await emailRes.text().catch(() => '');
      console.error('[lead-sms-alert] resend_email_http_error', {
        status: emailRes.status,
        body: detail,
      });
      if (!alertSentAt) {
        return json({ error: 'email_dispatch_failed' }, 500);
      }
    }
  } else if (!alertSentAt) {
    if (canTwilio) {
      return json({ error: 'sms_dispatch_failed' }, 500);
    }
    console.error('[lead-sms-alert] missing RESEND_API_KEY or ADMIN_ALERT_EMAIL');
    return json({ ok: true, skipped: 'resend_env_incomplete' }, 200);
  }

  if (!alertSentAt) {
    return json({ ok: true, skipped: 'dispatch_failed' }, 200);
  }

  const nowIso = alertSentAt;
  const nextMetadata = { ...meta, last_sms_sent_at: nowIso };
  const { error: metaUpdErr } = await supabase
    .from('workspaces')
    .update({ metadata: nextMetadata })
    .eq('id', workspaceId)
    .select('id');

  if (metaUpdErr) {
    // Return 200 after a successful alert dispatch so the webhook does not retry billable sends; log for ops.
    console.error('[lead-sms-alert] metadata_update_failed', metaUpdErr);
    return json(
      { ok: true, sent: true, last_sms_sent_at: nowIso, metadata_persist_failed: true },
      200,
    );
  }

  return json({ ok: true, sent: true, last_sms_sent_at: nowIso }, 200);
});
