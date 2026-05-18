/**
 * Typed env reader for the consolidated agent dispatcher (Phase 1+).
 *
 * Lazy by design: never invoked at module top-level. Importing this file from any
 * `_shared` module — including unit-test runners that lack the new GCP secrets — must
 * not throw. The dispatcher entry point calls `readDispatcherEnv()` once per request.
 *
 * The validator collects every missing required variable into a single descriptive
 * `Error.message` rather than failing on the first one, so an operator sees the full
 * remediation list in one log line.
 */

export type DispatcherEnv = {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  AGENT_WEBHOOK_SECRET: string;
  GCP_PROJECT_ID: string;
  GCP_LOCATION: string;
  GCP_SERVICE_ACCOUNT_JSON: string;
  /** Per-attempt + total budget passed to `vertex-gemini.generateContent`. */
  LLM_TIMEOUT_MS: number;
  /** When true, dispatcher is allowed to log additional debug fields. */
  LLM_DEBUG: boolean;
  /**
   * Phase 4 Organizer write-gating flag. When true, Organizer's `proposedWrite`
   * payload is honored and the `organizer_create_reply_and_task` RPC inserts a
   * task row alongside the reply. When false (the default, matching legacy at
   * `organizer-agent-dispatch/index.ts:596`), the RPC inserts the reply only and
   * the strategy still surfaces the un-gated `proposedWrite` in the structured log.
   */
  ORGANIZER_WRITES_ENABLED: boolean;
  /**
   * When true, Coach rail `agent_update_task_and_reply` passes `p_new_metadata` through
   * `mergeCoachProposedIntoTaskMetadata` so rich `workout_set` and flat `exercises` stay
   * aligned. Default false (raw proposed shallow-merge). Strict `=== '1'`.
   */
  COACH_MERGE_WORKOUT_METADATA: boolean;
  /** When true, coach/strategy lets parsed `card_action` flow through guards and persist. */
  COACH_CARD_ACTIONS: boolean;
};

const REQUIRED_STRING_KEYS: ReadonlyArray<keyof DispatcherEnv> = [
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'AGENT_WEBHOOK_SECRET',
  'GCP_PROJECT_ID',
  'GCP_LOCATION',
  'GCP_SERVICE_ACCOUNT_JSON',
];

const DEFAULT_LLM_TIMEOUT_MS = 25_000;
const MIN_LLM_TIMEOUT_MS = 1_000;

function readString(name: string): string {
  // `Deno` is the runtime global on Supabase Edge; this file is Deno-only.
  // deno-lint-ignore no-explicit-any
  const value = (globalThis as any).Deno?.env?.get?.(name);
  return typeof value === 'string' ? value.trim() : '';
}

function parseTimeout(raw: string): { ok: true; value: number } | { ok: false; reason: string } {
  if (!raw) return { ok: true, value: DEFAULT_LLM_TIMEOUT_MS };
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed)) {
    return { ok: false, reason: `LLM_TIMEOUT_MS=${raw} is not an integer` };
  }
  if (parsed < MIN_LLM_TIMEOUT_MS) {
    return {
      ok: false,
      reason: `LLM_TIMEOUT_MS=${parsed} is below the ${MIN_LLM_TIMEOUT_MS}ms minimum`,
    };
  }
  return { ok: true, value: parsed };
}

/**
 * Read + validate the dispatcher's runtime configuration. On the first missing or
 * malformed variable encountered the function continues collecting; it then throws a
 * single `Error` whose message lists every problem.
 */
export function readDispatcherEnv(): DispatcherEnv {
  const problems: string[] = [];
  const values: Partial<Record<keyof DispatcherEnv, string>> = {};

  for (const key of REQUIRED_STRING_KEYS) {
    const v = readString(key);
    if (!v) problems.push(`missing required env var: ${key}`);
    else values[key] = v;
  }

  const timeoutRaw = readString('LLM_TIMEOUT_MS');
  const timeoutResult = parseTimeout(timeoutRaw);
  let llmTimeoutMs = DEFAULT_LLM_TIMEOUT_MS;
  if (timeoutResult.ok) llmTimeoutMs = timeoutResult.value;
  else problems.push(timeoutResult.reason);

  if (problems.length > 0) {
    throw new Error(`[agent-dispatch] dispatcher env invalid:\n  - ${problems.join('\n  - ')}`);
  }

  return {
    SUPABASE_URL: values.SUPABASE_URL!,
    SUPABASE_SERVICE_ROLE_KEY: values.SUPABASE_SERVICE_ROLE_KEY!,
    AGENT_WEBHOOK_SECRET: values.AGENT_WEBHOOK_SECRET!,
    GCP_PROJECT_ID: values.GCP_PROJECT_ID!,
    GCP_LOCATION: values.GCP_LOCATION!,
    GCP_SERVICE_ACCOUNT_JSON: values.GCP_SERVICE_ACCOUNT_JSON!,
    LLM_TIMEOUT_MS: llmTimeoutMs,
    LLM_DEBUG: readString('LLM_DEBUG') === '1',
    // Mirrors `organizer-agent-dispatch/index.ts:596` — strict `=== '1'` semantic
    // so an accidental `ORGANIZER_WRITES_ENABLED=true` or `=yes` reads as false.
    ORGANIZER_WRITES_ENABLED: readString('ORGANIZER_WRITES_ENABLED') === '1',
    COACH_MERGE_WORKOUT_METADATA: readString('COACH_MERGE_WORKOUT_METADATA') === '1',
    COACH_CARD_ACTIONS: readString('COACH_CARD_ACTIONS') === '1',
  };
}
