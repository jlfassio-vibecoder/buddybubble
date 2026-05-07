#!/usr/bin/env tsx
/**
 * Smoke test for `agent-dispatch-v2` — Phase 2.
 *
 * Posts a synthetic Supabase Database webhook payload (a `messages` INSERT row for a
 * Coach-bound bubble) to the dispatcher and then polls the public REST endpoint until
 * the Coach reply appears. Exits non-zero on assertion failure.
 *
 * Usage:
 *   1. Start the function locally:
 *        supabase functions serve agent-dispatch-v2 --env-file .env.local
 *   2. Export the env vars below (read from process.env):
 *        SMOKE_BUBBLE_ID         — UUID of a bubble bound to Coach
 *        SMOKE_USER_ID           — UUID of a user authorized to post in that bubble
 *        SMOKE_AGENT_SECRET      — must equal AGENT_WEBHOOK_SECRET
 *        SMOKE_FUNCTION_URL      — defaults to http://localhost:54321/functions/v1/agent-dispatch-v2
 *        SMOKE_SUPABASE_URL      — defaults to http://localhost:54321
 *        SMOKE_SUPABASE_ANON_KEY — public anon key for the polling REST query
 *   3. Run:
 *        pnpm tsx scripts/smoke-agent-dispatch-v2.ts
 *
 * Exit codes:
 *   0 — Coach reply observed within timeout
 *   1 — assertion failure (HTTP error, timeout, or no reply)
 *   2 — environment misconfiguration
 */

import process from 'node:process';
import { randomUUID } from 'node:crypto';

type Env = {
  bubbleId: string;
  userId: string;
  agentSecret: string;
  functionUrl: string;
  supabaseUrl: string;
  supabaseAnonKey: string;
  triggerText: string;
  pollIntervalMs: number;
  pollTimeoutMs: number;
};

function readEnv(): Env {
  const required = (name: string): string => {
    const v = process.env[name];
    if (!v || !v.trim()) {
      console.error(`[smoke] missing required env var: ${name}`);
      process.exit(2);
    }
    return v.trim();
  };

  const bubbleId = required('SMOKE_BUBBLE_ID');
  const userId = required('SMOKE_USER_ID');
  const agentSecret = required('SMOKE_AGENT_SECRET');
  const functionUrl =
    process.env.SMOKE_FUNCTION_URL?.trim() ??
    'http://localhost:54321/functions/v1/agent-dispatch-v2';
  const supabaseUrl = process.env.SMOKE_SUPABASE_URL?.trim() ?? 'http://localhost:54321';
  const supabaseAnonKey = required('SMOKE_SUPABASE_ANON_KEY');
  const triggerText =
    process.env.SMOKE_TRIGGER_TEXT?.trim() ??
    `[smoke ${new Date().toISOString()}] Hi @Coach, can you suggest a quick mobility flow?`;
  const pollIntervalMs = Number.parseInt(process.env.SMOKE_POLL_INTERVAL_MS ?? '1000', 10);
  const pollTimeoutMs = Number.parseInt(process.env.SMOKE_POLL_TIMEOUT_MS ?? '60000', 10);

  return {
    bubbleId,
    userId,
    agentSecret,
    functionUrl,
    supabaseUrl,
    supabaseAnonKey,
    triggerText,
    pollIntervalMs: Number.isFinite(pollIntervalMs) && pollIntervalMs > 100 ? pollIntervalMs : 1000,
    pollTimeoutMs: Number.isFinite(pollTimeoutMs) && pollTimeoutMs > 1000 ? pollTimeoutMs : 60_000,
  };
}

type WebhookPayload = {
  type: 'INSERT';
  schema: 'public';
  table: 'messages';
  record: {
    id: string;
    user_id: string;
    bubble_id: string;
    parent_id: null;
    target_task_id: null;
    attached_task_id: null;
    content: string;
    created_at: string;
    metadata: null;
  };
};

function buildPayload(env: Env): { triggerId: string; payload: WebhookPayload } {
  const triggerId = randomUUID();
  return {
    triggerId,
    payload: {
      type: 'INSERT',
      schema: 'public',
      table: 'messages',
      record: {
        id: triggerId,
        user_id: env.userId,
        bubble_id: env.bubbleId,
        parent_id: null,
        target_task_id: null,
        attached_task_id: null,
        content: env.triggerText,
        created_at: new Date().toISOString(),
        metadata: null,
      },
    },
  };
}

async function postWebhook(env: Env, payload: WebhookPayload): Promise<void> {
  const resp = await fetch(env.functionUrl, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-agent-secret': env.agentSecret,
    },
    body: JSON.stringify(payload),
  });
  const body = await resp.text();
  if (!resp.ok) {
    console.error(`[smoke] webhook POST failed: ${resp.status} ${body}`);
    process.exit(1);
  }
  console.log(`[smoke] webhook accepted: ${resp.status} ${body.slice(0, 200)}`);
}

type ReplyRow = {
  id: string;
  user_id: string;
  parent_id: string | null;
  content: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

async function pollForReply(env: Env, triggerId: string): Promise<ReplyRow | null> {
  const url = new URL(`${env.supabaseUrl}/rest/v1/messages`);
  url.searchParams.set('select', 'id,user_id,parent_id,content,metadata,created_at');
  url.searchParams.set('parent_id', `eq.${triggerId}`);
  url.searchParams.set('order', 'created_at.asc');
  url.searchParams.set('limit', '5');

  const deadline = Date.now() + env.pollTimeoutMs;
  while (Date.now() < deadline) {
    const resp = await fetch(url, {
      headers: {
        apikey: env.supabaseAnonKey,
        authorization: `Bearer ${env.supabaseAnonKey}`,
      },
    });
    if (resp.ok) {
      const rows = (await resp.json()) as ReplyRow[];
      if (Array.isArray(rows) && rows.length > 0) return rows[0];
    } else {
      const body = await resp.text();
      console.error(`[smoke] polling failed: ${resp.status} ${body.slice(0, 200)}`);
    }
    await new Promise((resolve) => setTimeout(resolve, env.pollIntervalMs));
  }
  return null;
}

async function main(): Promise<void> {
  const env = readEnv();
  const { triggerId, payload } = buildPayload(env);
  console.log(`[smoke] dispatching trigger ${triggerId} to bubble ${env.bubbleId}`);

  await postWebhook(env, payload);
  const reply = await pollForReply(env, triggerId);
  if (!reply) {
    console.error(
      `[smoke] no Coach reply observed within ${env.pollTimeoutMs}ms (trigger=${triggerId})`,
    );
    process.exit(1);
  }
  if (reply.parent_id !== triggerId) {
    console.error(
      `[smoke] reply parent_id mismatch: got ${reply.parent_id}, expected ${triggerId}`,
    );
    process.exit(1);
  }
  console.log(
    `[smoke] OK — Coach reply ${reply.id} arrived ${Math.round(
      (Date.parse(reply.created_at) - Date.parse(payload.record.created_at)) / 1000,
    )}s after trigger`,
  );
  console.log(`[smoke] reply preview: ${(reply.content ?? '').slice(0, 200)}`);
}

main().catch((err) => {
  console.error(
    `[smoke] crashed: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}`,
  );
  process.exit(1);
});
