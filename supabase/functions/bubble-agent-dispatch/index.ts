/**
 * Supabase Edge Function: Database Webhook handler for Bubble Agents (stubbed AI).
 * Inserts a mock Kanban card + agent reply via public.agent_create_card_and_reply (service_role).
 *
 * Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, BUBBLE_AGENT_WEBHOOK_SECRET.
 * Deploy with verify_jwt=false (see supabase/config.toml); authenticate via shared secret header.
 */
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-bubble-agent-secret',
};

type MessageRecord = {
  id?: string;
  user_id?: string;
  bubble_id?: string;
  content?: string | null;
  parent_id?: string | null;
  target_task_id?: string | null;
};

type WebhookPayload = {
  type?: string;
  table?: string;
  schema?: string;
  record?: MessageRecord;
};

type AgentDefEmbed = {
  slug: string;
  display_name: string;
  auth_user_id: string;
  is_active: boolean;
};

type BindingRow = {
  sort_order: number;
  agent_definitions: AgentDefEmbed | AgentDefEmbed[] | null;
};

type VertexContent = {
  role: 'user' | 'model' | 'system';
  parts: Array<{ text: string }>;
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function unwrapDef(row: BindingRow): AgentDefEmbed | null {
  const d = row.agent_definitions;
  const o = Array.isArray(d) ? d[0] : d;
  if (!o || typeof o !== 'object') return null;
  if (!o.auth_user_id || !o.display_name) return null;
  return o as AgentDefEmbed;
}

const STUB_REPLY = 'Here is the 3-day split you requested.';
const STUB_TASK_TITLE = 'Mock: 3-day split';
const STUB_TASK_DESCRIPTION: string | null = null;

type VertexJsonResponse = {
  reply_content: string;
  task_title: string;
  task_description: string;
};

async function vertexGenerateJson(args: {
  apiKey: string;
  model: string;
  systemPrompt: string;
  contents: VertexContent[];
}): Promise<VertexJsonResponse> {
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${args.model}:generateContent?key=${encodeURIComponent(
    args.apiKey,
  )}`;

  const body = {
    system_instruction: {
      parts: [{ text: args.systemPrompt }],
    },
    contents: args.contents,
    generationConfig: {
      temperature: 0.4,
      maxOutputTokens: 512,
      responseMimeType: 'application/json',
      responseSchema: {
        type: 'OBJECT',
        properties: {
          reply_content: { type: 'STRING' },
          task_title: { type: 'STRING' },
          task_description: { type: 'STRING' },
        },
        required: ['reply_content', 'task_title', 'task_description'],
      },
    },
  };

  const resp = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const txt = await resp.text().catch(() => '');
    throw new Error(`vertex_http_${resp.status}:${txt.slice(0, 400)}`);
  }

  const json = (await resp.json()) as {
    candidates?: Array<{
      content?: { parts?: Array<{ text?: string }> };
    }>;
  };
  const text = json.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
  if (typeof text !== 'string' || !text.trim()) {
    throw new Error('vertex_empty_response');
  }

  const parsed = JSON.parse(text) as Record<string, unknown>;
  const replyContent = typeof parsed.reply_content === 'string' ? parsed.reply_content : null;
  const taskTitle = typeof parsed.task_title === 'string' ? parsed.task_title : null;
  const taskDescription =
    typeof parsed.task_description === 'string' ? parsed.task_description : null;
  if (!replyContent || !taskTitle || taskDescription == null) {
    throw new Error('vertex_invalid_json_shape');
  }

  return {
    reply_content: replyContent,
    task_title: taskTitle,
    task_description: taskDescription,
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    // Copilot suggestion ignored: keep non-POST as HTTP 200 so misrouted probes are not confused with Supabase webhook retry storms.
    return json({ ok: false, error: 'method_not_allowed' }, 200);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const webhookSecret = Deno.env.get('BUBBLE_AGENT_WEBHOOK_SECRET')?.trim();
  const geminiApiKey = Deno.env.get('GEMINI_API_KEY')?.trim();
  if (!supabaseUrl || !serviceKey || !webhookSecret) {
    return json({ ok: false, error: 'server_misconfigured' }, 500);
  }

  const bearer =
    req.headers
      .get('authorization')
      ?.replace(/^Bearer\s+/i, '')
      ?.trim() ?? '';
  const headerSecret = req.headers.get('x-bubble-agent-secret')?.trim() ?? '';
  const token = headerSecret || bearer;
  if (!token || token !== webhookSecret) {
    // Copilot suggestion ignored: HTTP 200 on bad secret avoids webhook infrastructure treating auth failures as delivery failures / retry loops.
    return json({ ok: false, error: 'unauthorized' }, 200);
  }

  let payload: WebhookPayload;
  try {
    payload = (await req.json()) as WebhookPayload;
  } catch {
    return json({ ok: false, error: 'invalid_json' }, 200);
  }

  const evt = (payload.type ?? '').toUpperCase();
  if (payload.schema !== 'public' || payload.table !== 'messages' || evt !== 'INSERT') {
    return json({ ok: true, skipped: 'not_messages_insert' }, 200);
  }

  const record = payload.record;
  if (!record?.id || !record.user_id || !record.bubble_id) {
    return json({ ok: false, error: 'missing_record_fields' }, 200);
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: selfAgent, error: selfAgentErr } = await supabase
    .from('agent_definitions')
    .select('id')
    .eq('auth_user_id', record.user_id)
    .eq('is_active', true)
    .maybeSingle();

  if (selfAgentErr) {
    console.error('[bubble-agent-dispatch] agent_definitions self lookup', selfAgentErr.message);
    return json({ ok: false, error: 'agent_lookup_failed' }, 200);
  }

  if (selfAgent) {
    return json({ ok: true, skipped: 'author_is_agent' }, 200);
  }

  const { data: bindingRows, error: bindErr } = await supabase
    .from('bubble_agent_bindings')
    .select('sort_order, agent_definitions ( slug, display_name, auth_user_id, is_active )')
    .eq('bubble_id', record.bubble_id)
    .eq('enabled', true)
    .order('sort_order', { ascending: true });

  if (bindErr) {
    console.error('[bubble-agent-dispatch] bindings', bindErr.message);
    return json({ ok: false, error: 'bindings_query_failed' }, 200);
  }

  const content = record.content ?? '';
  let resolvedAgentUserId: string | null = null;
  let resolvedSlug: string | null = null;
  const bubbleAgentAuthIds = new Set<string>();

  for (const raw of (bindingRows ?? []) as BindingRow[]) {
    const def = unwrapDef(raw);
    if (!def?.is_active) continue;
    if (def.auth_user_id) {
      bubbleAgentAuthIds.add(def.auth_user_id);
    }
    const tokenInMessage = `@${def.display_name}`;
    if (!content.includes(tokenInMessage)) continue;
    resolvedAgentUserId = def.auth_user_id;
    resolvedSlug = def.slug;
    break;
  }

  if (!resolvedAgentUserId) {
    return json({ ok: true, skipped: 'no_agent_mention' }, 200);
  }

  const vertexModel = Deno.env.get('VERTEX_GEMINI_MODEL')?.trim() || 'gemini-2.0-flash';

  const systemPrompt =
    'You are a BuddyBubble assistant. You can act as both a Fitness Coach and an Organizer. ' +
    'Return ONLY a raw JSON object (no markdown, no code fences) matching exactly: ' +
    '{"reply_content":"...","task_title":"...","task_description":"..."}';

  let replyText = STUB_REPLY;
  let taskTitle = STUB_TASK_TITLE;
  let taskDescription: string | null = STUB_TASK_DESCRIPTION;

  if (!geminiApiKey) {
    replyText =
      "I'm having trouble connecting to the AI service right now (missing API key). Try again in a moment.";
    taskTitle = 'Agent error: AI unavailable';
    taskDescription = 'Missing Supabase secret `GEMINI_API_KEY`.';
  } else {
    try {
      const threadRootId = record.parent_id ?? record.id;
      const { data: historyRows, error: historyErr } = await supabase
        .from('messages')
        .select('id, user_id, content, created_at, parent_id')
        .eq('bubble_id', record.bubble_id)
        .or(`parent_id.eq.${threadRootId},id.eq.${threadRootId}`)
        .neq('id', record.id)
        .order('created_at', { ascending: false })
        .limit(10);
      if (historyErr) {
        console.error('[bubble-agent-dispatch] history', historyErr.message, {
          bubble_id: record.bubble_id,
          thread_root_id: threadRootId,
          message_id: record.id,
        });
      }

      const historyAsc = [...(historyRows ?? [])].reverse();
      const vertexContents: VertexContent[] = historyAsc
        .map((m) => {
          const row = m as { user_id?: string | null; content?: string | null };
          const txt = row.content ?? '';
          if (!txt.trim()) return null;
          const role: VertexContent['role'] =
            row.user_id && bubbleAgentAuthIds.has(row.user_id) ? 'model' : 'user';
          return { role, parts: [{ text: txt }] };
        })
        .filter((v): v is VertexContent => v != null);

      vertexContents.push({ role: 'user', parts: [{ text: content }] });

      const out = await vertexGenerateJson({
        apiKey: geminiApiKey,
        model: vertexModel,
        systemPrompt,
        contents: vertexContents,
      });
      replyText = out.reply_content;
      taskTitle = out.task_title;
      taskDescription = out.task_description;
    } catch (e) {
      console.error('[bubble-agent-dispatch] vertex', String(e), {
        message_id: record.id,
        slug: resolvedSlug,
      });
      replyText =
        'Something went wrong while generating your agent response. I created a placeholder card so you can keep moving.';
      taskTitle = 'Agent error: generation failed';
      taskDescription =
        'Vertex AI request failed or returned invalid JSON. Check Edge Function logs for details.';
    }
  }

  const { data: rpcData, error: rpcErr } = await supabase.rpc('agent_create_card_and_reply', {
    p_trigger_message_id: record.id,
    p_agent_auth_user_id: resolvedAgentUserId,
    p_invoker_user_id: record.user_id,
    p_reply_text: replyText,
    p_task_title: taskTitle,
    p_task_description: taskDescription,
    p_task_item_type: 'task',
    p_task_status: 'todo',
  });

  if (rpcErr) {
    console.error('[bubble-agent-dispatch] rpc', rpcErr.message, {
      message_id: record.id,
      slug: resolvedSlug,
    });
    return json({ ok: false, error: 'rpc_failed', detail: rpcErr.message }, 200);
  }

  console.log(
    JSON.stringify({
      ok: true,
      message_id: record.id,
      bubble_id: record.bubble_id,
      agent_slug: resolvedSlug,
      rpc: rpcData,
    }),
  );

  return json({ ok: true, result: rpcData }, 200);
});
