/**
 * Supabase Edge Function: Database Webhook handler for the Buddy general-purpose agent.
 *
 * Phase 1 scope (this file): scaffold only.
 *   - Verify shared secret via `x-buddy-agent-secret` header (or `Authorization: Bearer ...`).
 *   - Fast-reject messages that are not @Buddy mentions or implicit onboarding triggers.
 *   - No LLM / RPC logic yet.
 *
 * Buddy is intentionally isolated from `bubble-agent-dispatch` (the fitness @Coach pipeline).
 * Do not share prompt files, RPCs, or secrets between the two functions.
 *
 * Secrets (to be configured): SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, BUDDY_AGENT_WEBHOOK_SECRET.
 * Optional: BUDDY_AGENT_DEBUG=1 — logs full Gemini webhook payloads (avoid in production).
 * Deploy with verify_jwt=false (see supabase/config.toml); authenticate via shared secret header.
 *
 * Return contract: ALWAYS HTTP 200 for skips / auth failures / malformed payloads so Supabase's
 * webhook infrastructure does not retry-loop. Reserve 500 for true server misconfiguration.
 */
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { buddySystemPrompt } from './buddyPrompt.ts';

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-buddy-agent-secret',
};

/** Default Gemini fetch timeout (ms). Overridable via BUDDY_GEMINI_FETCH_TIMEOUT_MS. */
const BUDDY_GEMINI_FETCH_TIMEOUT_DEFAULT_MS = 55_000;

/** Response schema Buddy MUST emit (Gemini JSON mode). See `buddyPrompt.ts` for contract. */
const BUDDY_RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    replyContent: {
      type: 'STRING',
      description:
        "What Buddy says in chat. Required. Plain text, 1–3 short sentences by default. Never echo the '[SYSTEM_EVENT: ONBOARDING_STARTED]' sentinel.",
    },
    createCard: {
      type: 'OBJECT',
      nullable: true,
      description:
        'Optional Kanban card Buddy proposes. Include only when a Bubbleboard card would genuinely help the user act on replyContent. Use null / omit otherwise.',
      properties: {
        title: {
          type: 'STRING',
          description:
            'Short plain-text card title, <= 100 chars. NO EMOJIS. State the action once and stop.',
        },
        description: {
          type: 'STRING',
          description: 'Card body: small checklist or 1–4 concrete steps the user can act on.',
        },
        action_type: {
          type: 'STRING',
          description:
            'Short snake_case tag describing the card purpose (e.g. onboarding_checklist, try_first_card, invite_teammate, create_first_bubble, explore_bubbleboard).',
        },
      },
      required: ['title', 'description', 'action_type'],
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

/**
 * Escape a `mention_handle` for safe insertion into a dynamically-built `RegExp`.
 *
 * Keeps server-side parsing aligned with the client resolver in
 * `src/lib/agents/resolveTargetAgent.ts`: both sides now read the handle from
 * `agent_definitions.mention_handle` instead of hardcoding "@buddy". That lets us add or
 * rename agents through the DB without shipping a new function build.
 */
function escapeRegExpLiteral(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Word-bounded, case-insensitive @mention check for a given handle.
 *
 * Mirrors the client regex at `src/lib/agents/resolveTargetAgent.ts` so "@BuddyBubble" or
 * "you@buddy.example.com" do not false-positive, and "@BUDDY" / "@Buddy" both match.
 */
function mentionsHandle(content: string | null | undefined, handle: string): boolean {
  if (!content || !handle) return false;
  const re = new RegExp(`(^|[^\\w])@${escapeRegExpLiteral(handle)}(?!\\w)`, 'i');
  return re.test(content);
}

/**
 * Sentinel string the frontend silently inserts into a new chat-forward feature to wake Buddy up
 * for a first-time onboarding nudge. Treated as an exact-match trigger so it cannot collide with
 * anything a real user would type.
 *
 * Keep this in sync with the frontend system-message emitter.
 */
const BUDDY_ONBOARDING_SYSTEM_EVENT = '[SYSTEM_EVENT: ONBOARDING_STARTED]';

/**
 * Implicit onboarding trigger classifier ("Proactive Buddy" model).
 *
 * Phase 2: returns true only when `record.content` is an EXACT match for the sentinel string
 * above. Phase 3+ may extend this to additional system events (e.g. trial landing, first board
 * visit) — keep any new branches cheap so the fast-reject path stays O(1) for the common case.
 */
function isImplicitOnboardingTrigger(record: MessageRecord): boolean {
  const content = record.content;
  if (typeof content !== 'string') return false;
  return content === BUDDY_ONBOARDING_SYSTEM_EVENT;
}

type BuddyContinuationArgs = {
  supabase: ReturnType<typeof createClient>;
  record: MessageRecord;
  buddyAuthUserId: string;
};

async function buddyThreadContinuation({
  supabase,
  record,
  buddyAuthUserId,
}: BuddyContinuationArgs): Promise<boolean> {
  // If replying in a thread, check if Buddy authored the parent or any recent message in that thread.
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
      console.error('[DEBUG] [Buddy Agent] continuation thread lookup failed', error.message);
      return false;
    }

    return (data ?? []).some(
      (m) => (m as { user_id?: string } | null)?.user_id === buddyAuthUserId,
    );
  }

  // Root message: check the immediate prior message in the bubble.
  const { data, error } = await supabase
    .from('messages')
    .select('id, user_id')
    .eq('bubble_id', record.bubble_id)
    .neq('id', record.id)
    .order('created_at', { ascending: false })
    .limit(2);

  if (error) {
    console.error('[DEBUG] [Buddy Agent] continuation bubble lookup failed', error.message);
    return false;
  }

  const prev = (data ?? [])[0] as { user_id?: string } | undefined;
  return prev?.user_id === buddyAuthUserId;
}

type BuddyHistoryArgs = {
  supabase: ReturnType<typeof createClient>;
  record: MessageRecord;
  buddyAuthUserId: string;
  maxMessages: number;
};

function toGeminiRole(userId: string, buddyAuthUserId: string): 'user' | 'model' {
  return userId === buddyAuthUserId ? 'model' : 'user';
}

async function fetchBuddyHistory({
  supabase,
  record,
  buddyAuthUserId,
  maxMessages,
}: BuddyHistoryArgs): Promise<Array<{ role: 'user' | 'model'; parts: Array<{ text: string }> }>> {
  const parentId = (record.parent_id ?? '').trim();
  const baseSelect = 'id, user_id, content, created_at, parent_id';

  // Thread context: fetch messages for that thread (parent + replies) in chronological order.
  if (parentId) {
    const { data, error } = await supabase
      .from('messages')
      .select(baseSelect)
      .eq('bubble_id', record.bubble_id)
      .or(`id.eq.${parentId},parent_id.eq.${parentId}`)
      .order('created_at', { ascending: true })
      .limit(maxMessages);

    if (error) {
      console.error('[DEBUG] [Buddy Agent] history thread fetch failed', error.message);
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
        role: toGeminiRole(m.user_id, buddyAuthUserId),
        parts: [{ text: (m.content ?? '').trim() }],
      }));
  }

  // Bubble context: fetch the last N messages in the bubble (chronological).
  const { data, error } = await supabase
    .from('messages')
    .select(baseSelect)
    .eq('bubble_id', record.bubble_id)
    .order('created_at', { ascending: false })
    .limit(maxMessages);

  if (error) {
    console.error('[DEBUG] [Buddy Agent] history bubble fetch failed', error.message);
    return [];
  }

  // Reverse into chronological order for Gemini.
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
      role: toGeminiRole(m.user_id, buddyAuthUserId),
      parts: [{ text: (m.content ?? '').trim() }],
    }));
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    // Keep non-POST as HTTP 200 so misrouted probes are not confused with webhook retries.
    return json({ ok: false, error: 'method_not_allowed' }, 200);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const webhookSecret = Deno.env.get('BUDDY_AGENT_WEBHOOK_SECRET')?.trim();
  if (!supabaseUrl || !serviceKey || !webhookSecret) {
    // True server misconfiguration: 500 is appropriate (webhook retries are acceptable here).
    console.error('[DEBUG] [Buddy Agent] server_misconfigured', {
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
  const headerSecret = req.headers.get('x-buddy-agent-secret')?.trim() ?? '';
  const token = headerSecret || bearer;
  if (!token || token !== webhookSecret) {
    console.log('[DEBUG] [Buddy Agent] unauthorized — secret missing or mismatched', {
      hasHeaderSecret: !!headerSecret,
      hasBearer: !!bearer,
    });
    // HTTP 200 on bad secret avoids webhook infrastructure treating auth failures as
    // delivery failures / retry storms (same pattern as bubble-agent-dispatch).
    return json({ ok: false, error: 'unauthorized' }, 200);
  }

  let payload: WebhookPayload | null = null;
  try {
    payload = (await req.json()) as WebhookPayload;
  } catch {
    payload = null;
  }

  if (!payload) {
    console.log('[DEBUG] [Buddy Agent] invalid_json payload');
    return json({ ok: false, error: 'invalid_json' }, 200);
  }

  const record: MessageRecord | undefined = payload.record;

  const evt = (payload.type ?? '').toUpperCase();
  if (payload.schema !== 'public' || payload.table !== 'messages' || evt !== 'INSERT') {
    console.log('[DEBUG] [Buddy Agent] skipped — not a messages INSERT', {
      schema: payload.schema,
      table: payload.table,
      type: evt,
    });
    return json({ ok: true, skipped: 'not_messages_insert' }, 200);
  }

  if (!record?.id || !record.user_id || !record.bubble_id) {
    console.log('[DEBUG] [Buddy Agent] missing_record_fields', {
      hasId: !!record?.id,
      hasUserId: !!record?.user_id,
      hasBubbleId: !!record?.bubble_id,
    });
    return json({ ok: false, error: 'missing_record_fields' }, 200);
  }

  // Cheap content-only trigger that does not need the DB.
  const isImplicitTrigger = isImplicitOnboardingTrigger(record);

  // Phase 4: service-role client (required to bypass RLS for bot writes and to look up
  // Buddy's auth_user_id for the loop guard and the RPC call).
  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Phase 4: loop guard — resolve Buddy's auth_user_id from public.agent_definitions and
  // short-circuit if this webhook fired for one of Buddy's own messages. Without this,
  // Buddy could reply to itself forever.
  //
  // Phase 3 refactor: also read `mention_handle` here so the server-side @mention regex is
  // driven by the same DB column the client resolver uses. This aligns the two sides and
  // lets ops rename Buddy's handle without redeploying the Edge Function.
  const { data: buddyDef, error: buddyDefErr } = await supabase
    .from('agent_definitions')
    .select('auth_user_id, mention_handle')
    .eq('slug', 'buddy')
    .eq('is_active', true)
    .maybeSingle();

  if (buddyDefErr) {
    console.error('[DEBUG] [Buddy Agent] buddy identity lookup failed', buddyDefErr.message);
    return json({ ok: false, error: 'buddy_identity_lookup_failed' }, 200);
  }

  const buddyRow = buddyDef as { auth_user_id?: string; mention_handle?: string } | null;
  const buddyAuthUserId = buddyRow?.auth_user_id ?? null;
  const buddyMentionHandle = buddyRow?.mention_handle?.trim() || 'Buddy';
  if (!buddyAuthUserId) {
    console.error(
      '[DEBUG] [Buddy Agent] buddy identity not seeded — run scripts/provision-agents.ts',
    );
    return json({ ok: false, error: 'buddy_identity_missing' }, 200);
  }

  const hasBuddyMention = mentionsHandle(record.content, buddyMentionHandle);

  if (record.user_id === buddyAuthUserId) {
    console.log("[DEBUG] [Buddy Agent] Loop guard triggered. Ignoring Buddy's own message.");
    return json({ ok: true, skipped: 'loop_guard' }, 200);
  }

  // Thread continuation: if the user is replying within an active Buddy conversation,
  // allow execution to proceed even without an explicit @Buddy mention.
  const isThreadContinuation =
    !hasBuddyMention && !isImplicitTrigger
      ? await buddyThreadContinuation({
          supabase,
          record,
          buddyAuthUserId,
        })
      : false;

  if (!hasBuddyMention && !isImplicitTrigger && !isThreadContinuation) {
    console.log('[DEBUG] [Buddy Agent] skipped — not_buddy_target', {
      message_id: record.id,
      bubble_id: record.bubble_id,
      user_id: record.user_id,
      hasBuddyMention,
      isImplicitTrigger,
      isThreadContinuation,
    });
    return json({ ok: true, skipped: 'not_buddy_target' }, 200);
  }

  if (isThreadContinuation) {
    console.log('[DEBUG] [Buddy Agent] Trigger passed via Thread Continuation');
  } else {
    // Trigger passed — log which kind fired so we can watch onboarding vs. @mention flow independently.
    console.log(
      '[DEBUG] [Buddy Agent] Trigger passed. Type:',
      hasBuddyMention ? 'Explicit (@)' : 'Implicit (System)',
    );
  }

  // Phase 3: call Gemini for Buddy's conversational reply + optional Kanban card.
  // Phase 4 parses the response below and writes it via the Buddy RPC.
  const geminiApiKey = Deno.env.get('GEMINI_API_KEY')?.trim();
  if (!geminiApiKey) {
    console.error('[DEBUG] [Buddy Agent] missing GEMINI_API_KEY');
    return json({ ok: false, error: 'gemini_misconfigured' }, 500);
  }

  const buddyModel =
    Deno.env.get('BUDDY_GEMINI_MODEL')?.trim() ||
    Deno.env.get('GEMINI_MODEL')?.trim() ||
    'gemini-2.5-flash';

  const timeoutRaw = Number.parseInt(Deno.env.get('BUDDY_GEMINI_FETCH_TIMEOUT_MS') ?? '', 10);
  const buddyFetchTimeoutMs =
    Number.isFinite(timeoutRaw) && timeoutRaw >= 1000
      ? timeoutRaw
      : BUDDY_GEMINI_FETCH_TIMEOUT_DEFAULT_MS;

  const userTurnText = isImplicitTrigger
    ? 'The user just landed on this feature for the first time (implicit onboarding trigger). Greet them briefly, orient them, offer ONE concrete first step, and consider proposing a small starter card.'
    : (record.content ?? '');

  // Provide lightweight conversation history so Buddy can answer follow-ups like
  // "Can you explain the trial?" without requiring an explicit @Buddy mention.
  const history = await fetchBuddyHistory({
    supabase,
    record,
    buddyAuthUserId,
    maxMessages: 12,
  });

  const geminiEndpoint = `https://generativelanguage.googleapis.com/v1beta/models/${buddyModel}:generateContent`;
  const geminiBody = {
    system_instruction: {
      parts: [{ text: buddySystemPrompt }],
    },
    contents: [...history, { role: 'user', parts: [{ text: userTurnText }] }],
    generationConfig: {
      temperature: 0.4,
      maxOutputTokens: 1024,
      // Gemini JSON mode — required so the model emits parseable structured output.
      responseMimeType: 'application/json',
      responseSchema: BUDDY_RESPONSE_SCHEMA,
    },
  };

  // AbortSignal.timeout ensures the Edge Function cannot hang indefinitely on a stalled LLM call.
  let response: Response;
  try {
    response = await fetch(geminiEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': geminiApiKey,
      },
      body: JSON.stringify(geminiBody),
      signal: AbortSignal.timeout(buddyFetchTimeoutMs),
    });
  } catch (e) {
    // HTTP 200 on network/timeout errors avoids webhook retry storms for transient LLM hiccups.
    console.error('[DEBUG] [Buddy Agent] LLM fetch failed', String(e), {
      message_id: record.id,
      trigger: hasBuddyMention ? 'mention' : 'implicit_onboarding',
    });
    return json({ ok: false, error: 'gemini_fetch_failed', detail: String(e) }, 200);
  }

  if (!response.ok) {
    const errTxt = await response.text().catch(() => '');
    console.error('[DEBUG] [Buddy Agent] LLM HTTP error', response.status, errTxt.slice(0, 400));
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

  // Concatenate every text part (JSON mode is usually one part; multi-part avoids silent truncation).
  const generatedText = extractGeminiCandidateText(geminiEnvelope.candidates?.[0]);
  const candidateCount = geminiEnvelope.candidates?.length ?? 0;
  if (Deno.env.get('BUDDY_AGENT_DEBUG')?.trim() === '1') {
    console.log('[DEBUG] [Buddy Agent] LLM envelope (BUDDY_AGENT_DEBUG=1)', geminiEnvelope);
  } else {
    console.log('[Buddy Agent] gemini response', {
      candidateCount,
      textChars: generatedText.length,
    });
  }
  const parsedBuddyResponse = parseBuddyResponse(generatedText);
  if (!parsedBuddyResponse) {
    // Graceful: return 200 so a bad LLM hallucination does not trigger webhook retries.
    console.error('[DEBUG] [Buddy Agent] Failed to parse Buddy JSON response', {
      rawLength: generatedText.length,
    });
    return json({ ok: false, error: 'buddy_json_parse_failed' }, 200);
  }

  // Thread Buddy's reply under the trigger (Slack-style): same convention as bubble-agent-dispatch.
  // Frontend can hide the silent `[SYSTEM_EVENT: ...]` sentinel message on implicit onboarding.
  const parentId: string =
    typeof record.parent_id === 'string' && record.parent_id.length > 0
      ? record.parent_id
      : record.id!;

  const card = parsedBuddyResponse.createCard;
  const { data: rpcData, error: rpcErr } = await supabase.rpc('buddy_create_onboarding_reply', {
    p_bubble_id: record.bubble_id,
    p_buddy_user_id: buddyAuthUserId,
    p_parent_id: parentId,
    p_reply_content: parsedBuddyResponse.replyContent,
    p_card_title: card ? card.title : null,
    p_card_desc: card ? card.description : null,
    p_action_type: card ? card.action_type : null,
  });

  if (rpcErr) {
    console.error('[DEBUG] [Buddy Agent] RPC failed', rpcErr.message, {
      message_id: record.id,
    });
    return json({ ok: false, error: 'buddy_rpc_failed', detail: rpcErr.message }, 200);
  }

  // Final tripwire: confirms the DB side of Buddy's turn completed successfully.
  console.log('[DEBUG] [Buddy Agent] Successfully wrote reply/card to DB via RPC.');

  return json(
    {
      ok: true,
      matched: true,
      trigger: hasBuddyMention ? 'mention' : 'implicit_onboarding',
      rpc: rpcData ?? null,
    },
    200,
  );
});

// ---------------------------------------------------------------------------
// Buddy response parser — mirrors BUDDY_RESPONSE_SCHEMA above.
// Returns null on any shape / type mismatch so callers can 200 OK gracefully.
// ---------------------------------------------------------------------------

function extractGeminiCandidateText(
  candidate: { content?: { parts?: Array<{ text?: string }> } } | undefined,
): string {
  const parts = candidate?.content?.parts;
  if (!Array.isArray(parts)) return '';
  return parts.map((p) => (typeof p?.text === 'string' ? p.text : '')).join('');
}

/**
 * Balanced `{ ... }` slice starting at `start` (must be `{`). String-aware so `{` inside
 * JSON strings does not confuse depth.
 */
function extractBalancedJsonAt(s: string, start: number): string | null {
  if (s[start] !== '{') return null;
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < s.length; i++) {
    const c = s[i]!;
    if (inString) {
      if (escape) {
        escape = false;
        continue;
      }
      if (c === '\\') {
        escape = true;
        continue;
      }
      if (c === '"') inString = false;
      continue;
    }
    if (c === '"') {
      inString = true;
      continue;
    }
    if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) return s.slice(start, i + 1);
    }
  }
  return null;
}

type BuddyCreateCard = {
  title: string;
  description: string;
  action_type: string;
};

type BuddyParsedResponse = {
  replyContent: string;
  createCard: BuddyCreateCard | null;
};

function stripJsonCodeFences(raw: string): string {
  let t = raw.trim();
  // Whole string is one fenced block: ```json ... ``` or ``` ... ```
  const fullFence = /^```(?:json)?\s*\r?\n?([\s\S]*?)\r?\n?```\s*$/i;
  const m = t.match(fullFence);
  if (m?.[1]) return m[1].trim();
  // Opening fence only (model forgot closing ```)
  if (/^```(?:json)?\s*/i.test(t)) {
    t = t.replace(/^```(?:json)?\s*/i, '');
    t = t.replace(/\r?\n?```\s*$/i, '');
  }
  return t.trim();
}

/** Strip BOM, markdown fences, and common LLM wrappers before JSON.parse. */
function sanitizeBuddyModelJsonText(raw: string): string {
  let t = raw.replace(/^\uFEFF/, '').trim();
  t = stripJsonCodeFences(t);
  t = t
    .replace(
      /^(?:ok[,.\s]*)?(?:here(?:'s| is| are)\s+)?(?:the\s+)?(?:json|response|output)\s*[:.\s-]*\r?\n?/i,
      '',
    )
    .trim();
  return t;
}

function parseBuddyJsonObject(cleaned: string): Record<string, unknown> | null {
  const tryParse = (s: string): Record<string, unknown> | null => {
    try {
      const parsed = JSON.parse(s) as unknown;
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
      return parsed as Record<string, unknown>;
    } catch {
      return null;
    }
  };

  const direct = tryParse(cleaned);
  if (direct) return direct;

  // Try every `{` start: prose may contain a spurious `{...}` before the real JSON object.
  let search = 0;
  while (search < cleaned.length) {
    const start = cleaned.indexOf('{', search);
    if (start < 0) break;
    const extracted = extractBalancedJsonAt(cleaned, start);
    if (extracted) {
      const parsed = tryParse(extracted);
      if (parsed) return parsed;
    }
    search = start + 1;
  }
  return null;
}

function parseBuddyResponse(rawText: string): BuddyParsedResponse | null {
  const cleaned = sanitizeBuddyModelJsonText(rawText);
  if (!cleaned) return null;

  const obj = parseBuddyJsonObject(cleaned);
  if (!obj) return null;

  const replyContentRaw = obj.replyContent;
  if (typeof replyContentRaw !== 'string') return null;
  const replyContent = replyContentRaw.trim();
  if (!replyContent) return null;

  let createCard: BuddyCreateCard | null = null;
  const cardRaw = obj.createCard;
  if (cardRaw && typeof cardRaw === 'object' && !Array.isArray(cardRaw)) {
    const c = cardRaw as Record<string, unknown>;
    const titleRaw = typeof c.title === 'string' ? c.title.trim() : '';
    const descRaw = typeof c.description === 'string' ? c.description.trim() : '';
    const actionRaw = typeof c.action_type === 'string' ? c.action_type.trim() : '';
    // Require all three fields to be non-empty strings; otherwise drop the card rather
    // than write a malformed Kanban row.
    if (titleRaw && descRaw && actionRaw) {
      createCard = {
        title: titleRaw.slice(0, 100),
        description: descRaw,
        action_type: actionRaw,
      };
    }
  }

  return { replyContent, createCard };
}
