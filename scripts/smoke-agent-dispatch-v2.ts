#!/usr/bin/env tsx
/**
 * Smoke test for `agent-dispatch-v2` — Phase 2 (Coach), extended in Phase 4 (Organizer)
 * and Phase 5 (Buddy).
 *
 * Posts a synthetic Supabase Database webhook payload (a `messages` INSERT row for the
 * target agent) to the dispatcher and then polls the public REST endpoint until the
 * agent reply appears. Exits non-zero on assertion failure.
 *
 * Usage:
 *   1. Start the function locally:
 *        supabase functions serve agent-dispatch-v2 --env-file .env.local
 *   2. Export the env vars below (read from process.env):
 *        # Shared
 *        SMOKE_AGENT_SECRET            — must equal AGENT_WEBHOOK_SECRET
 *        SMOKE_FUNCTION_URL            — defaults to http://localhost:54321/functions/v1/agent-dispatch-v2
 *        SMOKE_SUPABASE_URL            — defaults to http://localhost:54321
 *        SMOKE_SUPABASE_ANON_KEY       — public anon key for the polling REST query
 *        # When --target coach (default)
 *        SMOKE_BUBBLE_ID               — UUID of a bubble bound to Coach
 *        SMOKE_USER_ID                 — UUID of a user authorized to post in that bubble
 *        SMOKE_TRIGGER_TEXT            — optional, defaults to a Coach-mention prompt
 *        # When --target organizer
 *        SMOKE_ORGANIZER_BUBBLE_ID     — UUID of a bubble bound to Organizer
 *        SMOKE_ORGANIZER_USER_ID       — UUID of a user authorized to post in that bubble
 *        SMOKE_ORGANIZER_TRIGGER_TEXT  — optional, defaults to an Organizer-mention prompt
 *        # When --target buddy
 *        SMOKE_BUDDY_BUBBLE_ID         — UUID of any bubble (Buddy is workspace-global)
 *        SMOKE_BUDDY_USER_ID           — UUID of a user authorized to post in that bubble
 *        SMOKE_BUDDY_TRIGGER_TEXT      — optional, defaults depend on --scenario
 *   3. Run:
 *        pnpm tsx scripts/smoke-agent-dispatch-v2.ts                                  # Coach (back-compat)
 *        pnpm tsx scripts/smoke-agent-dispatch-v2.ts --target organizer               # Phase 4
 *        pnpm tsx scripts/smoke-agent-dispatch-v2.ts --target buddy                   # Phase 5 (mention)
 *        pnpm tsx scripts/smoke-agent-dispatch-v2.ts --target buddy --scenario sentinel
 *        pnpm tsx scripts/smoke-agent-dispatch-v2.ts --target buddy --scenario continuation
 *
 *   --scenario only applies when --target=buddy. Other targets ignore it.
 *
 *   `--scenario continuation` PREREQUISITE: the most recent `messages` row in the bubble
 *   (excluding this script's trigger) MUST be authored by Buddy. Otherwise the dispatcher
 *   correctly returns `skipped: no_strategy_matched` and the script will time out.
 *
 * Exit codes:
 *   0 — agent reply observed within timeout
 *   1 — assertion failure (HTTP error, timeout, or no reply)
 *   2 — environment misconfiguration
 */

import process from 'node:process';
import { randomUUID } from 'node:crypto';

type SmokeTarget = 'coach' | 'organizer' | 'buddy';
type SmokeScenario = 'mention' | 'sentinel' | 'continuation';

/**
 * Buddy onboarding sentinel — duplicated here (rather than imported from
 * src/lib/agents/buddy/config.ts) so this script keeps zero workspace-source
 * imports. Identity must match BUDDY_ONBOARDING_SENTINEL exactly.
 */
const BUDDY_ONBOARDING_SENTINEL = '[SYSTEM_EVENT: ONBOARDING_STARTED]';

type Env = {
  target: SmokeTarget;
  scenario: SmokeScenario;
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

type Cli = {
  target: SmokeTarget;
  scenario: SmokeScenario;
};

function isSmokeTarget(v: string): v is SmokeTarget {
  return v === 'coach' || v === 'organizer' || v === 'buddy';
}

function isSmokeScenario(v: string): v is SmokeScenario {
  return v === 'mention' || v === 'sentinel' || v === 'continuation';
}

function parseCli(argv: string[]): Cli {
  let target: SmokeTarget = 'coach';
  let scenario: SmokeScenario | null = null;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--target' && argv[i + 1]) {
      const v = argv[i + 1].trim().toLowerCase();
      if (isSmokeTarget(v)) {
        target = v;
        i++;
      } else {
        console.error(
          `[smoke] unknown --target value: ${argv[i + 1]} (expected coach|organizer|buddy)`,
        );
        process.exit(2);
      }
    } else if (a?.startsWith('--target=')) {
      const v = a.slice('--target='.length).trim().toLowerCase();
      if (isSmokeTarget(v)) {
        target = v;
      } else {
        console.error(`[smoke] unknown --target value: ${v} (expected coach|organizer|buddy)`);
        process.exit(2);
      }
    } else if (a === '--scenario' && argv[i + 1]) {
      const v = argv[i + 1].trim().toLowerCase();
      if (isSmokeScenario(v)) {
        scenario = v;
        i++;
      } else {
        console.error(
          `[smoke] unknown --scenario value: ${argv[i + 1]} (expected mention|sentinel|continuation)`,
        );
        process.exit(2);
      }
    } else if (a?.startsWith('--scenario=')) {
      const v = a.slice('--scenario='.length).trim().toLowerCase();
      if (isSmokeScenario(v)) {
        scenario = v;
      } else {
        console.error(
          `[smoke] unknown --scenario value: ${v} (expected mention|sentinel|continuation)`,
        );
        process.exit(2);
      }
    }
  }
  if (scenario && target !== 'buddy') {
    console.error(
      `[smoke] --scenario is only meaningful with --target buddy (got --target ${target})`,
    );
    process.exit(2);
  }
  // Default to 'mention' so a one-liner `--target buddy` Just Works.
  return { target, scenario: scenario ?? 'mention' };
}

function readEnv(cli: Cli): Env {
  const required = (name: string): string => {
    const v = process.env[name];
    if (!v || !v.trim()) {
      console.error(`[smoke] missing required env var: ${name}`);
      process.exit(2);
    }
    return v.trim();
  };

  // Per-target env var resolution. We deliberately do NOT cross-fall-back between
  // targets — that would let a user with e.g. a Coach-only `.env.local` accidentally
  // fire an Organizer mention into a Coach-bound bubble and report a confusing failure.
  const bubbleEnv =
    cli.target === 'organizer'
      ? 'SMOKE_ORGANIZER_BUBBLE_ID'
      : cli.target === 'buddy'
        ? 'SMOKE_BUDDY_BUBBLE_ID'
        : 'SMOKE_BUBBLE_ID';
  const userEnv =
    cli.target === 'organizer'
      ? 'SMOKE_ORGANIZER_USER_ID'
      : cli.target === 'buddy'
        ? 'SMOKE_BUDDY_USER_ID'
        : 'SMOKE_USER_ID';
  const triggerEnv =
    cli.target === 'organizer'
      ? 'SMOKE_ORGANIZER_TRIGGER_TEXT'
      : cli.target === 'buddy'
        ? 'SMOKE_BUDDY_TRIGGER_TEXT'
        : 'SMOKE_TRIGGER_TEXT';

  const bubbleId = required(bubbleEnv);
  const userId = required(userEnv);
  const agentSecret = required('SMOKE_AGENT_SECRET');
  const functionUrl =
    process.env.SMOKE_FUNCTION_URL?.trim() ??
    'http://localhost:54321/functions/v1/agent-dispatch-v2';
  const supabaseUrl = process.env.SMOKE_SUPABASE_URL?.trim() ?? 'http://localhost:54321';
  const supabaseAnonKey = required('SMOKE_SUPABASE_ANON_KEY');

  const buddyDefault =
    cli.scenario === 'sentinel'
      ? BUDDY_ONBOARDING_SENTINEL
      : cli.scenario === 'continuation'
        ? `[smoke ${new Date().toISOString()}] thanks, what's next?`
        : `[smoke ${new Date().toISOString()}] @Buddy hi — quick orientation please?`;
  const defaultTriggerText =
    cli.target === 'organizer'
      ? `[smoke ${new Date().toISOString()}] @Organizer when can we meet next Tuesday?`
      : cli.target === 'buddy'
        ? buddyDefault
        : `[smoke ${new Date().toISOString()}] Hi @Coach, can you suggest a quick mobility flow?`;

  // Sentinel scenario MUST send the exact sentinel string — env override would silently
  // disable the implicit-trigger code path and produce a confusing skip.
  const triggerText =
    cli.target === 'buddy' && cli.scenario === 'sentinel'
      ? BUDDY_ONBOARDING_SENTINEL
      : (process.env[triggerEnv]?.trim() ?? defaultTriggerText);

  const pollIntervalMs = Number.parseInt(process.env.SMOKE_POLL_INTERVAL_MS ?? '1000', 10);
  const pollTimeoutMs = Number.parseInt(process.env.SMOKE_POLL_TIMEOUT_MS ?? '60000', 10);

  return {
    target: cli.target,
    scenario: cli.scenario,
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

function targetLabel(env: Env): string {
  if (env.target === 'organizer') return 'Organizer';
  if (env.target === 'buddy') return `Buddy[${env.scenario}]`;
  return 'Coach';
}

async function main(): Promise<void> {
  const cli = parseCli(process.argv.slice(2));
  const env = readEnv(cli);
  const { triggerId, payload } = buildPayload(env);
  const label = targetLabel(env);
  console.log(
    `[smoke] target=${env.target}${env.target === 'buddy' ? ` scenario=${env.scenario}` : ''} dispatching trigger ${triggerId} to bubble ${env.bubbleId}`,
  );
  if (env.target === 'buddy' && env.scenario === 'continuation') {
    console.log(
      `[smoke] continuation prerequisite: the most recent prior message in bubble ${env.bubbleId} must be authored by Buddy, otherwise the dispatcher will skip and this script will time out`,
    );
  }

  await postWebhook(env, payload);
  const reply = await pollForReply(env, triggerId);
  if (!reply) {
    console.error(
      `[smoke] no ${label} reply observed within ${env.pollTimeoutMs}ms (trigger=${triggerId})`,
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
    `[smoke] OK — ${label} reply ${reply.id} arrived ${Math.round(
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
