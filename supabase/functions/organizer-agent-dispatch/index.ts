/**
 * Supabase Edge Function: Database Webhook handler for the Organizer agent.
 *
 * Organizer is the meeting / calendar coordinator. Strictly isolated from `bubble-agent-dispatch`
 * (the fitness @Coach pipeline) and from `buddy-agent-dispatch` (onboarding). No shared prompt
 * files, RPCs, or secrets between the three functions.
 *
 * Trigger: DB webhook on `public.messages` INSERT where the message mentions Organizer's
 * `mention_handle` (resolved at dispatch time from `public.agent_definitions`, NOT hardcoded).
 * Thread continuation mirrors the Buddy dispatch pattern.
 *
 * Writes (per Phase 4 spec):
 *   * Text reply: ALWAYS via `public.organizer_create_reply_and_task` RPC (task params null).
 *   * Task creation (meeting action items): gated behind ORGANIZER_WRITES_ENABLED=1. When that
 *     flag is unset, Organizer's `proposedWrite` payload is returned in the reply JSON but NOT
 *     executed server-side — the UI is responsible for a confirmation round-trip (see
 *     `docs/refactor/phase4-deviation-log.md` for the current deviation: reply messages do not
 *     yet carry structured proposedWrite metadata back to the client).
 *
 * Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ORGANIZER_AGENT_WEBHOOK_SECRET, GEMINI_API_KEY.
 * Optional: ORGANIZER_AGENT_DEBUG=1, ORGANIZER_WRITES_ENABLED=1, ORGANIZER_GEMINI_FETCH_TIMEOUT_MS,
 *           ORGANIZER_GEMINI_MODEL (falls back to GEMINI_MODEL, then gemini-2.5-flash).
 * Deploy with verify_jwt=false (see supabase/config.toml); authenticate via shared secret header.
 *
 * Return contract: ALWAYS HTTP 200 for skips / auth failures / malformed payloads so Supabase's
 * webhook infrastructure does not retry-loop. Reserve 500 for true server misconfiguration.
 */
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { organizerSystemPrompt } from './organizerPrompt.ts';

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-organizer-agent-secret',
};

const ORGANIZER_GEMINI_FETCH_TIMEOUT_DEFAULT_MS = 55_000;

/** Sentinel owned by the frontend (Buddy onboarding); Organizer ignores it in history. */
const BUDDY_ONBOARDING_SYSTEM_EVENT = '[SYSTEM_EVENT: ONBOARDING_STARTED]';

const ORGANIZER_RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    replyContent: {
      type: 'STRING',
      description:
        'What Organizer says in chat. Required. Plain text, 1–3 short sentences by default. Never echo any SYSTEM_EVENT sentinel.',
    },
    proposedWrite: {
      type: 'OBJECT',
      nullable: true,
      description:
        'Optional structured write Organizer proposes. The server DOES NOT execute it unless ORGANIZER_WRITES_ENABLED=1 and the payload validates. Use null / omit when only replying.',
      properties: {
        kind: {
          type: 'STRING',
          enum: ['create_task', 'append_agenda_note'],
          description: 'Discriminator. Controls the payload shape.',
        },
        rationale: {
          type: 'STRING',
          description: 'Short human-readable reason for the proposed write.',
        },
        payload: {
          type: 'OBJECT',
          description:
            'Payload shape depends on kind. create_task: {title, description?, due_on?, assignee_user_id?}. append_agenda_note: {note}.',
          properties: {
            title: { type: 'STRING', nullable: true },
            description: { type: 'STRING', nullable: true },
            due_on: { type: 'STRING', nullable: true },
            assignee_user_id: { type: 'STRING', nullable: true },
            note: { type: 'STRING', nullable: true },
          },
        },
      },
      required: ['kind', 'rationale', 'payload'],
    },
  },
  required: ['replyContent'],
} as const;

type MessageRecord = {
  id?: string;
  user_id?: string;
  bubble_id?: string;
  content?: string | null;
  parent_id?: string | null;
  target_task_id?: string | null;
  attached_task_id?: string | null;
};

type WebhookPayload = {
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

function escapeRegExpLiteral(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Word-bounded, case-insensitive @mention check for a given handle.
 * Mirrors the client regex at `src/lib/agents/resolveTargetAgent.ts` and the Buddy/Coach
 * dispatchers so handle parsing is identical on every side.
 */
export function mentionsHandle(content: string | null | undefined, handle: string): boolean {
  if (!content || !handle) return false;
  const re = new RegExp(`(^|[^\\w])@${escapeRegExpLiteral(handle)}(?!\\w)`, 'i');
  return re.test(content);
}

type OrganizerContinuationArgs = {
  supabase: ReturnType<typeof createClient>;
  record: MessageRecord;
  organizerAuthUserId: string;
};

async function organizerThreadContinuation({
  supabase,
  record,
  organizerAuthUserId,
}: OrganizerContinuationArgs): Promise<boolean> {
  const parentId = (record.parent_id ?? '').trim();
  if (parentId) {
    const { data, error } = await supabase
      .from('messages')
      .select('user_id')
      .eq('bubble_id', record.bubble_id)
      .or(`id.eq.${parentId},parent_id.eq.${parentId}`)
      .order('created_at', { ascending: false })
      .limit(12);

    if (error) {
      console.error('[organizer-agent-dispatch] continuation thread lookup failed', error.message);
      return false;
    }

    return (data ?? []).some(
      (m) => (m as { user_id?: string } | null)?.user_id === organizerAuthUserId,
    );
  }

  return false;
}

type OrganizerHistoryArgs = {
  supabase: ReturnType<typeof createClient>;
  record: MessageRecord;
  organizerAuthUserId: string;
  maxMessages: number;
};

function toGeminiRole(userId: string, organizerAuthUserId: string): 'user' | 'model' {
  return userId === organizerAuthUserId ? 'model' : 'user';
}

async function fetchOrganizerHistory({
  supabase,
  record,
  organizerAuthUserId,
  maxMessages,
}: OrganizerHistoryArgs): Promise<
  Array<{ role: 'user' | 'model'; parts: Array<{ text: string }> }>
> {
  const parentId = (record.parent_id ?? '').trim();
  const baseSelect = 'id, user_id, content, created_at, parent_id';

  if (parentId) {
    const { data, error } = await supabase
      .from('messages')
      .select(baseSelect)
      .eq('bubble_id', record.bubble_id)
      .or(`id.eq.${parentId},parent_id.eq.${parentId}`)
      .order('created_at', { ascending: true })
      .limit(maxMessages);

    if (error) {
      console.error('[organizer-agent-dispatch] history thread fetch failed', error.message);
      return [];
    }

    return (data ?? [])
      .map((m) => m as { user_id: string; content: string | null })
      .filter(
        (m) =>
          (m.content ?? '').trim() !== '' &&
          (m.content ?? '').trim() !== BUDDY_ONBOARDING_SYSTEM_EVENT,
      )
      .map((m) => ({
        role: toGeminiRole(m.user_id, organizerAuthUserId),
        parts: [{ text: (m.content ?? '').trim() }],
      }));
  }

  const { data, error } = await supabase
    .from('messages')
    .select(baseSelect)
    .eq('bubble_id', record.bubble_id)
    .order('created_at', { ascending: false })
    .limit(maxMessages);

  if (error) {
    console.error('[organizer-agent-dispatch] history bubble fetch failed', error.message);
    return [];
  }

  return (data ?? [])
    .slice()
    .reverse()
    .map((m) => m as { user_id: string; content: string | null })
    .filter(
      (m) =>
        (m.content ?? '').trim() !== '' &&
        (m.content ?? '').trim() !== BUDDY_ONBOARDING_SYSTEM_EVENT,
    )
    .map((m) => ({
      role: toGeminiRole(m.user_id, organizerAuthUserId),
      parts: [{ text: (m.content ?? '').trim() }],
    }));
}

// ---------------------------------------------------------------------------
// Response parsing — exported so unit tests exercise the write-gating logic
// without needing a full Edge Function harness.
// ---------------------------------------------------------------------------

export type OrganizerProposedWrite =
  | {
      kind: 'create_task';
      rationale: string;
      payload: {
        title: string;
        description: string | null;
        due_on: string | null;
        assignee_user_id: string | null;
      };
    }
  | {
      kind: 'append_agenda_note';
      rationale: string;
      payload: { note: string };
    };

export type OrganizerParsedResponse = {
  replyContent: string;
  proposedWrite: OrganizerProposedWrite | null;
};

function stripJsonCodeFences(raw: string): string {
  let t = raw.trim();
  const fullFence = /^```(?:json)?\s*\r?\n?([\s\S]*?)\r?\n?```\s*$/i;
  const m = t.match(fullFence);
  if (m) return m[1].trim();
  if (/^```(?:json)?\s*\r?\n?/i.test(t)) {
    t = t.replace(/^```(?:json)?\s*\r?\n?/i, '');
    t = t.replace(/\r?\n?```\s*$/, '');
  }
  return t.trim();
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function parseOrganizerResponse(rawText: string): OrganizerParsedResponse | null {
  const cleaned = stripJsonCodeFences(rawText);
  if (!cleaned) return null;

  let obj: Record<string, unknown>;
  try {
    const parsed = JSON.parse(cleaned) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    obj = parsed as Record<string, unknown>;
  } catch {
    return null;
  }

  const replyContentRaw = obj.replyContent;
  if (typeof replyContentRaw !== 'string') return null;
  const replyContent = replyContentRaw.trim();
  if (!replyContent) return null;

  let proposedWrite: OrganizerProposedWrite | null = null;
  const pwRaw = obj.proposedWrite;
  if (pwRaw && typeof pwRaw === 'object' && !Array.isArray(pwRaw)) {
    const pw = pwRaw as Record<string, unknown>;
    const kind = typeof pw.kind === 'string' ? pw.kind.trim() : '';
    const rationale =
      typeof pw.rationale === 'string' && pw.rationale.trim() ? pw.rationale.trim() : '';
    const payloadRaw = pw.payload;
    if (
      rationale &&
      payloadRaw &&
      typeof payloadRaw === 'object' &&
      !Array.isArray(payloadRaw)
    ) {
      const payload = payloadRaw as Record<string, unknown>;
      if (kind === 'create_task') {
        const title = typeof payload.title === 'string' ? payload.title.trim() : '';
        if (title) {
          const description =
            typeof payload.description === 'string' && payload.description.trim()
              ? payload.description.trim()
              : null;
          const due_on_raw = typeof payload.due_on === 'string' ? payload.due_on.trim() : '';
          const due_on = due_on_raw && ISO_DATE_RE.test(due_on_raw) ? due_on_raw : null;
          const assignee_raw =
            typeof payload.assignee_user_id === 'string' ? payload.assignee_user_id.trim() : '';
          const assignee_user_id = assignee_raw && UUID_RE.test(assignee_raw) ? assignee_raw : null;
          proposedWrite = {
            kind: 'create_task',
            rationale,
            payload: {
              title: title.slice(0, 120),
              description,
              due_on,
              assignee_user_id,
            },
          };
        }
      } else if (kind === 'append_agenda_note') {
        const note = typeof payload.note === 'string' ? payload.note.trim() : '';
        if (note) {
          proposedWrite = {
            kind: 'append_agenda_note',
            rationale,
            payload: { note },
          };
        }
      }
    }
  }

  return { replyContent, proposedWrite };
}

/**
 * Write-gating policy (pure helper so tests can exercise it).
 *
 * Returns the task fields to pass to `organizer_create_reply_and_task` iff writes are enabled
 * AND the proposedWrite is a well-formed `create_task`. Otherwise returns all-null task params
 * so the RPC inserts only the reply message.
 */
export function gateOrganizerWrite(
  parsed: OrganizerParsedResponse,
  writesEnabled: boolean,
): {
  p_task_title: string | null;
  p_task_description: string | null;
  p_task_due_on: string | null;
  p_task_assignee_user_id: string | null;
} {
  if (!writesEnabled) {
    return {
      p_task_title: null,
      p_task_description: null,
      p_task_due_on: null,
      p_task_assignee_user_id: null,
    };
  }
  const pw = parsed.proposedWrite;
  if (!pw || pw.kind !== 'create_task') {
    return {
      p_task_title: null,
      p_task_description: null,
      p_task_due_on: null,
      p_task_assignee_user_id: null,
    };
  }
  return {
    p_task_title: pw.payload.title,
    p_task_description: pw.payload.description,
    p_task_due_on: pw.payload.due_on,
    p_task_assignee_user_id: pw.payload.assignee_user_id,
  };
}

// ---------------------------------------------------------------------------
// Request handler
// ---------------------------------------------------------------------------

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return json({ ok: false, error: 'method_not_allowed' }, 200);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const webhookSecret = Deno.env.get('ORGANIZER_AGENT_WEBHOOK_SECRET')?.trim();
  if (!supabaseUrl || !serviceKey || !webhookSecret) {
    console.error('[organizer-agent-dispatch] server_misconfigured', {
      hasSupabaseUrl: !!supabaseUrl,
      hasServiceKey: !!serviceKey,
      hasWebhookSecret: !!webhookSecret,
    });
    return json({ ok: false, error: 'server_misconfigured' }, 500);
  }

  const bearer =
    req.headers
      .get('authorization')
      ?.replace(/^Bearer\s+/i, '')
      ?.trim() ?? '';
  const headerSecret = req.headers.get('x-organizer-agent-secret')?.trim() ?? '';
  const token = headerSecret || bearer;
  if (!token || token !== webhookSecret) {
    console.log('[organizer-agent-dispatch] unauthorized — secret missing or mismatched');
    return json({ ok: false, error: 'unauthorized' }, 200);
  }

  let payload: WebhookPayload | null = null;
  try {
    payload = (await req.json()) as WebhookPayload;
  } catch {
    payload = null;
  }

  if (!payload) {
    console.log('[organizer-agent-dispatch] invalid_json payload');
    return json({ ok: false, error: 'invalid_json' }, 200);
  }

  const record: MessageRecord | undefined = payload.record;

  const evt = (payload.type ?? '').toUpperCase();
  if (payload.schema !== 'public' || payload.table !== 'messages' || evt !== 'INSERT') {
    return json({ ok: true, skipped: 'not_messages_insert' }, 200);
  }

  if (!record?.id || !record.user_id || !record.bubble_id) {
    return json({ ok: false, error: 'missing_record_fields' }, 200);
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Resolve Organizer identity + mention handle from the DB.
  const { data: orgDef, error: orgDefErr } = await supabase
    .from('agent_definitions')
    .select('auth_user_id, mention_handle')
    .eq('slug', 'organizer')
    .eq('is_active', true)
    .maybeSingle();

  if (orgDefErr) {
    console.error('[organizer-agent-dispatch] organizer identity lookup failed', orgDefErr.message);
    return json({ ok: false, error: 'organizer_identity_lookup_failed' }, 200);
  }

  const orgRow = orgDef as { auth_user_id?: string; mention_handle?: string } | null;
  const organizerAuthUserId = orgRow?.auth_user_id ?? null;
  const organizerMentionHandle = orgRow?.mention_handle?.trim() || 'Organizer';
  if (!organizerAuthUserId) {
    console.error(
      '[organizer-agent-dispatch] organizer identity not seeded — run scripts/provision-agents.ts',
    );
    return json({ ok: false, error: 'organizer_identity_missing' }, 200);
  }

  // Loop guard
  if (record.user_id === organizerAuthUserId) {
    console.log('[organizer-agent-dispatch] loop guard — ignoring Organizer own message');
    return json({ ok: true, skipped: 'loop_guard' }, 200);
  }

  // Bubble binding check — Organizer only answers in bubbles it is bound to.
  const { data: binding, error: bindErr } = await supabase
    .from('bubble_agent_bindings')
    .select('agent_definitions!inner(slug, is_active, auth_user_id)')
    .eq('bubble_id', record.bubble_id)
    .eq('enabled', true)
    .eq('agent_definitions.slug', 'organizer')
    .eq('agent_definitions.is_active', true)
    .maybeSingle();

  if (bindErr) {
    console.error('[organizer-agent-dispatch] bubble binding lookup failed', bindErr.message);
    return json({ ok: false, error: 'binding_lookup_failed' }, 200);
  }

  if (!binding) {
    return json({ ok: true, skipped: 'organizer_not_bound_to_bubble' }, 200);
  }

  const hasOrganizerMention = mentionsHandle(record.content, organizerMentionHandle);
  const isThreadContinuation = !hasOrganizerMention
    ? await organizerThreadContinuation({ supabase, record, organizerAuthUserId })
    : false;

  if (!hasOrganizerMention && !isThreadContinuation) {
    return json({ ok: true, skipped: 'not_organizer_target' }, 200);
  }

  const geminiApiKey = Deno.env.get('GEMINI_API_KEY')?.trim();
  if (!geminiApiKey) {
    console.error('[organizer-agent-dispatch] missing GEMINI_API_KEY');
    return json({ ok: false, error: 'gemini_misconfigured' }, 500);
  }

  const organizerModel =
    Deno.env.get('ORGANIZER_GEMINI_MODEL')?.trim() ||
    Deno.env.get('GEMINI_MODEL')?.trim() ||
    'gemini-2.5-flash';

  const timeoutRaw = Number.parseInt(
    Deno.env.get('ORGANIZER_GEMINI_FETCH_TIMEOUT_MS') ?? '',
    10,
  );
  const organizerFetchTimeoutMs =
    Number.isFinite(timeoutRaw) && timeoutRaw >= 1000
      ? timeoutRaw
      : ORGANIZER_GEMINI_FETCH_TIMEOUT_DEFAULT_MS;

  const history = await fetchOrganizerHistory({
    supabase,
    record,
    organizerAuthUserId,
    maxMessages: 12,
  });

  const userTurnText = (record.content ?? '').trim();
  const geminiEndpoint = `https://generativelanguage.googleapis.com/v1beta/models/${organizerModel}:generateContent`;
  const geminiBody = {
    system_instruction: {
      parts: [{ text: organizerSystemPrompt }],
    },
    contents: [...history, { role: 'user', parts: [{ text: userTurnText }] }],
    generationConfig: {
      temperature: 0.3,
      maxOutputTokens: 1024,
      responseMimeType: 'application/json',
      responseSchema: ORGANIZER_RESPONSE_SCHEMA,
    },
  };

  let response: Response;
  try {
    response = await fetch(geminiEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': geminiApiKey,
      },
      body: JSON.stringify(geminiBody),
      signal: AbortSignal.timeout(organizerFetchTimeoutMs),
    });
  } catch (e) {
    console.error('[organizer-agent-dispatch] LLM fetch failed', String(e));
    return json({ ok: false, error: 'gemini_fetch_failed', detail: String(e) }, 200);
  }

  if (!response.ok) {
    const errTxt = await response.text().catch(() => '');
    console.error('[organizer-agent-dispatch] LLM HTTP error', response.status, errTxt.slice(0, 400));
    return json(
      { ok: false, error: `gemini_http_${response.status}`, detail: errTxt.slice(0, 400) },
      200,
    );
  }

  const geminiEnvelope = (await response.json().catch(() => null)) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  } | null;

  if (!geminiEnvelope) {
    return json({ ok: false, error: 'gemini_invalid_envelope' }, 200);
  }

  const generatedText = geminiEnvelope.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
  if (Deno.env.get('ORGANIZER_AGENT_DEBUG')?.trim() === '1') {
    console.log('[organizer-agent-dispatch] LLM envelope (ORGANIZER_AGENT_DEBUG=1)', geminiEnvelope);
  }
  const parsed = parseOrganizerResponse(generatedText);
  if (!parsed) {
    console.error('[organizer-agent-dispatch] organizer_json_parse_failed', {
      rawLength: generatedText.length,
    });
    return json({ ok: false, error: 'organizer_json_parse_failed' }, 200);
  }

  const writesEnabled = Deno.env.get('ORGANIZER_WRITES_ENABLED')?.trim() === '1';
  const writeGate = gateOrganizerWrite(parsed, writesEnabled);

  const parentId: string =
    typeof record.parent_id === 'string' && record.parent_id.length > 0
      ? record.parent_id
      : record.id!;

  const { data: rpcData, error: rpcErr } = await supabase.rpc(
    'organizer_create_reply_and_task',
    {
      p_bubble_id: record.bubble_id,
      p_organizer_user_id: organizerAuthUserId,
      p_parent_id: parentId,
      p_reply_content: parsed.replyContent,
      p_task_title: writeGate.p_task_title,
      p_task_description: writeGate.p_task_description,
      p_task_due_on: writeGate.p_task_due_on,
      p_task_assignee_user_id: writeGate.p_task_assignee_user_id,
    },
  );

  if (rpcErr) {
    console.error('[organizer-agent-dispatch] RPC failed', rpcErr.message);
    return json({ ok: false, error: 'organizer_rpc_failed', detail: rpcErr.message }, 200);
  }

  return json(
    {
      ok: true,
      matched: true,
      trigger: hasOrganizerMention ? 'mention' : 'thread_continuation',
      writes_enabled: writesEnabled,
      proposed_write: parsed.proposedWrite,
      rpc: rpcData ?? null,
    },
    200,
  );
});
