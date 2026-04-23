/**
 * Provisions Bubble Agent identities via Supabase Auth Admin API + public.agent_definitions.
 *
 * Requires:
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *
 * Optional:
 *   BUBBLE_AGENT_BOOTSTRAP_PASSWORD — min 8 chars; used for both bot accounts (change in dashboard if needed).
 *     If unset, a random password is generated and printed once per run.
 *
 * Usage: pnpm db:provision-agents
 */

import { createClient } from '@supabase/supabase-js';
import { randomBytes } from 'node:crypto';

/** Untyped client: hand-maintained `Database` does not satisfy latest PostgREST generics for scripts. */
type AnyClient = any;

type AgentSpec = {
  slug: string;
  email: string;
  displayName: string;
  /**
   * Token after `@` used for the catalog row's `mention_handle`. Optional; defaults to
   * `slug` to preserve existing behavior for coach/organizer. Override when the handle
   * should differ from the slug (e.g. Buddy uses capitalized `Buddy`).
   */
  mentionHandle?: string;
};

/** Matches Phase 3 backfill (`supabase/migrations/20260722130000_backfill_agent_avatars.sql`). */
const DEFAULT_AGENT_AVATAR_URL = '/brand/BuddyBubble-mark.svg';

const AGENTS: readonly AgentSpec[] = [
  {
    slug: 'coach',
    email: 'bubble-agent-coach@system.buddybubble.local',
    displayName: 'Coach',
  },
  {
    slug: 'organizer',
    email: 'bubble-agent-organizer@system.buddybubble.local',
    displayName: 'Organizer',
  },
  {
    // Buddy: general-purpose onboarding / guidance agent. Isolated from the fitness @Coach pipeline
    // (see `supabase/functions/buddy-agent-dispatch/` vs. `supabase/functions/bubble-agent-dispatch/`).
    slug: 'buddy',
    email: 'buddy-agent@system.buddybubble.local',
    displayName: 'Buddy',
    mentionHandle: 'Buddy',
  },
];

function requireEnv(name: string): string {
  const v = process.env[name]?.trim();
  if (!v) {
    console.error(`Missing required environment variable: ${name}`);
    process.exit(1);
  }
  return v;
}

function bootstrapPassword(): { password: string; printAfterRun: boolean } {
  const fromEnv = process.env.BUBBLE_AGENT_BOOTSTRAP_PASSWORD?.trim();
  if (fromEnv && fromEnv.length >= 8) {
    return { password: fromEnv, printAfterRun: false };
  }
  const generated = randomBytes(24).toString('base64url');
  console.warn(
    '[provision-agents] BUBBLE_AGENT_BOOTSTRAP_PASSWORD not set or too short; using one-time random password for new bots (printed at end of run).',
  );
  return { password: generated, printAfterRun: true };
}

async function findUserIdByEmail(supabase: AnyClient, email: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('users')
    .select('id')
    .eq('email', email)
    .maybeSingle();
  if (error) {
    console.error('[provision-agents] lookup public.users by email', email, error.message);
    return null;
  }
  return (data as { id?: string } | null)?.id ?? null;
}

async function provisionAgent(
  supabase: AnyClient,
  spec: AgentSpec,
  password: string,
): Promise<void> {
  const { slug, email, displayName } = spec;

  const { data: existingDef, error: defErr } = await supabase
    .from('agent_definitions')
    .select('id, auth_user_id')
    .eq('slug', slug)
    .maybeSingle();

  if (defErr) {
    console.error(
      `[provision-agents] failed to query agent_definitions slug=${slug}`,
      defErr.message,
    );
    process.exit(1);
  }

  if (existingDef?.id) {
    console.log(
      `[provision-agents] skip slug=${slug}: agent_definitions already exists id=${existingDef.id} auth_user_id=${existingDef.auth_user_id}`,
    );
    return;
  }

  let userId: string | null = null;

  const { data: created, error: createErr } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      full_name: displayName,
      name: displayName,
    },
  });

  if (createErr) {
    const msg = createErr.message.toLowerCase();
    const duplicate =
      msg.includes('already been registered') ||
      msg.includes('already exists') ||
      msg.includes('duplicate');
    if (duplicate) {
      userId = await findUserIdByEmail(supabase, email);
      if (!userId) {
        console.error(
          `[provision-agents] createUser failed for slug=${slug} (${createErr.message}) and no public.users row found for ${email}.`,
        );
        process.exit(1);
      }
      console.warn(
        `[provision-agents] slug=${slug}: Auth user already exists for ${email}; using public.users id=${userId}`,
      );
    } else {
      console.error(`[provision-agents] createUser failed slug=${slug}`, createErr.message);
      process.exit(1);
    }
  } else if (created.user?.id) {
    userId = created.user.id;
  } else {
    console.error(`[provision-agents] createUser returned no user id slug=${slug}`);
    process.exit(1);
  }

  const { error: userUpdErr } = await supabase
    .from('users')
    .update({
      is_agent: true,
      full_name: displayName,
      email,
    })
    .eq('id', userId);

  if (userUpdErr) {
    console.error(`[provision-agents] update public.users slug=${slug}`, userUpdErr.message);
    process.exit(1);
  }

  const { data: inserted, error: insDefErr } = await supabase
    .from('agent_definitions')
    .insert({
      slug,
      mention_handle: spec.mentionHandle ?? slug,
      display_name: displayName,
      auth_user_id: userId,
      avatar_url: DEFAULT_AGENT_AVATAR_URL,
      is_active: true,
    })
    .select('id')
    .single();

  if (insDefErr || !inserted?.id) {
    console.error(`[provision-agents] insert agent_definitions slug=${slug}`, insDefErr?.message);
    process.exit(1);
  }

  console.log(
    `[provision-agents] provisioned slug=${slug} agent_definition_id=${inserted.id} auth_user_id=${userId} email=${email}`,
  );
}

async function main() {
  const url = requireEnv('SUPABASE_URL');
  const serviceKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY');
  const { password, printAfterRun } = bootstrapPassword();

  const supabase = createClient(url, serviceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }) as AnyClient;

  for (const spec of AGENTS) {
    await provisionAgent(supabase, spec, password);
  }

  if (printAfterRun) {
    console.log(
      '[provision-agents] bootstrap password used for any newly created bots (store in a secret manager; rotate via dashboard):',
      password,
    );
  }

  console.log(
    '[provision-agents] done. Bind agents to bubbles with bubble_agent_bindings when ready.',
  );
}

void main();
