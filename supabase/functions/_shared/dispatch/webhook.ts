/**
 * Database-webhook envelope verification + payload parsing for the consolidated dispatcher.
 *
 * The legacy dispatchers all preserve a strict HTTP 200 contract on auth/parse/skip
 * outcomes so Supabase webhook infrastructure does not interpret them as delivery
 * failures and trigger retry storms. Reference:
 * `supabase/functions/bubble-agent-dispatch/index.ts:1262-1306`. This module preserves
 * that contract exactly. HTTP 500 is reserved for true server misconfiguration only.
 */

import type { NormalizedMessage } from './types.ts';

const CORS_HEADERS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers':
    'authorization, x-client-info, apikey, content-type, x-agent-secret',
};

/** Webhook envelope shape Supabase posts for `messages` INSERT events. */
export type DatabaseWebhookPayload = {
  type?: string;
  schema?: string;
  table?: string;
  record?: Partial<NormalizedMessage> | null;
  old_record?: Partial<NormalizedMessage> | null;
};

export type WebhookSuccess = {
  ok: true;
  payload: DatabaseWebhookPayload;
  record: NormalizedMessage;
  requestId: string;
};

export type WebhookFailure = {
  ok: false;
  response: Response;
};

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...CORS_HEADERS },
  });
}

function readBearer(req: Request): string {
  const raw = req.headers.get('authorization');
  if (!raw) return '';
  return raw.replace(/^Bearer\s+/i, '').trim();
}

function readAgentSecret(req: Request): string {
  return req.headers.get('x-agent-secret')?.trim() ?? '';
}

function isInsertOnMessages(payload: DatabaseWebhookPayload): boolean {
  const evt = (payload.type ?? '').toUpperCase();
  return payload.schema === 'public' && payload.table === 'messages' && evt === 'INSERT';
}

function asMetadataObject(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

function normalizeRecord(record: Partial<NormalizedMessage>): NormalizedMessage {
  return {
    id: record.id!,
    bubble_id: record.bubble_id ?? null,
    user_id: record.user_id!,
    parent_id: record.parent_id ?? null,
    target_task_id: record.target_task_id ?? null,
    attached_task_id: record.attached_task_id ?? null,
    content: typeof record.content === 'string' ? record.content : null,
    created_at: record.created_at ?? new Date().toISOString(),
    metadata: asMetadataObject(record.metadata),
  };
}

/**
 * Verify the webhook secret and parse the payload. Returns:
 *   - `{ ok: true, payload, record, requestId }` on a valid `messages` INSERT.
 *   - `{ ok: false, response }` with the legacy HTTP 200 envelope on auth/parse/skip.
 *
 * The dispatcher's `Deno.serve` handler should return `response` directly when `ok` is
 * false. The dispatcher is the only caller that may decide to return HTTP 500, and only
 * for genuine misconfiguration / unhandled exceptions.
 */
export async function verifyAndParseWebhook(
  req: Request,
  expectedSecret: string,
): Promise<WebhookSuccess | WebhookFailure> {
  if (req.method === 'OPTIONS') {
    return {
      ok: false,
      response: new Response('ok', { headers: CORS_HEADERS }),
    };
  }
  if (req.method !== 'POST') {
    return {
      ok: false,
      response: jsonResponse({ ok: false, error: 'method_not_allowed' }, 200),
    };
  }

  const presented = readAgentSecret(req) || readBearer(req);
  if (!presented || presented !== expectedSecret) {
    return {
      ok: false,
      response: jsonResponse({ ok: false, error: 'unauthorized' }, 200),
    };
  }

  let payload: DatabaseWebhookPayload;
  try {
    payload = (await req.json()) as DatabaseWebhookPayload;
  } catch {
    return {
      ok: false,
      response: jsonResponse({ ok: false, error: 'invalid_json' }, 200),
    };
  }

  if (!isInsertOnMessages(payload)) {
    return {
      ok: false,
      response: jsonResponse({ ok: true, skipped: 'not_messages_insert' }, 200),
    };
  }

  const record = payload.record;
  if (!record?.id || !record.user_id) {
    return {
      ok: false,
      response: jsonResponse({ ok: false, error: 'missing_record_fields' }, 200),
    };
  }

  return {
    ok: true,
    payload,
    record: normalizeRecord(record),
    requestId: crypto.randomUUID(),
  };
}

/** Re-export for consumers that need to reply with the same CORS headers used here. */
export { CORS_HEADERS };
