#!/usr/bin/env tsx
/**
 * Phase 7a lint guardrail #1: schema/prompt/parser drift detection.
 *
 * Catches three classes of bug that have bitten the team before:
 *
 *   - Direction A — required ⊆ prompt: a key is added to `responseSchema.required`
 *     but the prompt never names it, so the model has no way to know the contract.
 *   - Direction B — prompt-key-shaped tokens ⊆ schema keys ∪ enum values: a token
 *     in the prompt LOOKS like a schema key (snake_case or camelCase, ≥2 segments)
 *     but isn't actually declared in the schema. Catches refactor renames where the
 *     schema was updated but the prompt still says the old name.
 *   - Direction C — required ⊆ parser source: a key is required by the schema but
 *     the parser never reads it, so the dispatcher silently gets `undefined`.
 *
 * Scope: the canonical Vitest-side strategy modules under `src/lib/agents/<slug>/`.
 * The script does NOT load Deno strategies (they have Deno-only imports). The
 * companion mirror-parity script `check-agent-mirror-parity.ts` handles
 * canonical/Deno divergence.
 *
 * Usage: `pnpm check:agent-prompts`
 *
 * Exit codes:
 *   0 — clean
 *   1 — at least one violation (printed as `<contract>:<rule-id>  <message>`)
 *   2 — internal / IO error
 *
 * CLI flags (for the self-test):
 *   --silent                          Suppress human summary (still prints violations).
 *
 * Adding a new strategy: append a `Contract` to `REGISTRY` and run the lint locally.
 * If a token in the prompt legitimately is not a schema key (e.g. a runtime context
 * block name like `workoutContext` or a prose example value), add it to that
 * contract's `promptOnlyTokens`. If a required schema key legitimately is not in
 * the prompt (e.g. a 1-key schema where the key is conveyed in natural-language
 * prose), add it to `schemaOnlyKeys`.
 */

import { promises as fs } from 'node:fs';
import * as path from 'node:path';

import {
  COACH_RESPONSE_SCHEMA,
  COACH_WORKOUT_GREETING_SCHEMA,
} from '../src/lib/agents/coach/schema';
import {
  buildBaseCoachPrompt,
  buildWorkoutOpenGreetingPrompt,
} from '../src/lib/agents/coach/prompts';
import { BUDDY_RESPONSE_SCHEMA } from '../src/lib/agents/buddy/schema';
import { buddySystemPrompt } from '../src/lib/agents/buddy/prompts';
import { ORGANIZER_RESPONSE_SCHEMA } from '../src/lib/agents/organizer/schema';
import { organizerSystemPrompt } from '../src/lib/agents/organizer/prompts';

// ---------------------------------------------------------------------------
// Contract registry
// ---------------------------------------------------------------------------

/** A single (schema, prompt, parser) contract we lint for drift. */
export type Contract = {
  /** Human-readable contract identifier; appears in violation output. */
  name: string;
  /** Agent slug for grouping (also human-readable). */
  slug: string;
  /** Schema literal — the canonical Vitest export. Permissive shape so test fixtures fit. */
  schema: {
    type?: string;
    properties?: Record<string, unknown>;
    required?: ReadonlyArray<string>;
    [k: string]: unknown;
  };
  /** Prompt body (already resolved to a string). */
  prompt: string;
  /** Path (relative to repo root) of the parser source file to substring-scan. */
  parserSourcePath: string;
  /**
   * Required keys legitimately absent from the prompt — typically because the schema
   * has only one required key conveyed in natural-language prose (e.g. the Coach
   * workout-open silent-greeting preflight whose 1-key schema is implicit in
   * "write ONE chat message"). Empty for production strategies whose prompt should
   * name every required key.
   */
  schemaOnlyKeys?: ReadonlyArray<string>;
  /**
   * Tokens in the prompt that LOOK like schema keys (snake_case / camelCase, ≥2
   * segments) but legitimately are NOT schema property keys / enum values.
   * Examples: runtime-context block names (`workoutContext`), prose example values
   * (Buddy's `action_type` examples like `onboarding_checklist`). Direction B
   * suppresses these.
   */
  promptOnlyTokens?: ReadonlyArray<string>;
};

const REGISTRY: ReadonlyArray<Contract> = [
  {
    name: 'coach.main',
    slug: 'coach',
    schema: COACH_RESPONSE_SCHEMA,
    prompt: buildBaseCoachPrompt('2026-01-01'),
    parserSourcePath: 'src/lib/agents/coach/parse.ts',
    schemaOnlyKeys: [],
    // Runtime context block name + prose example value the Coach prompt mentions.
    // `workout_log` is an `item_type` label in TASK MODAL INTAKE UI prose, not a schema key.
    promptOnlyTokens: ['workoutContext', 'equipment_today', 'workout_log'],
  },
  {
    name: 'coach.workout-open-greeting',
    slug: 'coach',
    schema: COACH_WORKOUT_GREETING_SCHEMA,
    prompt: buildWorkoutOpenGreetingPrompt({
      workoutTitle: 'Test Workout',
      isoNow: '2026-01-01T00:00:00Z',
    }),
    parserSourcePath: 'src/lib/agents/coach/parse.ts',
    // 1-key schema (`reply_content`) is implicit in the prose "write ONE chat message";
    // model conformance is enforced by Vertex JSON-mode + responseSchema.
    schemaOnlyKeys: ['reply_content'],
    promptOnlyTokens: [],
  },
  {
    name: 'buddy.main',
    slug: 'buddy',
    schema: BUDDY_RESPONSE_SCHEMA,
    prompt: buddySystemPrompt,
    parserSourcePath: 'src/lib/agents/buddy/parse.ts',
    schemaOnlyKeys: [],
    promptOnlyTokens: [
      // action_type examples enumerated in prompt prose, not in the schema enum.
      'onboarding_checklist',
      'try_first_card',
      'invite_teammate',
      'create_first_bubble',
      'explore_bubbleboard',
      // Naming-convention meta-term used in prose ("snake_case tag").
      'snake_case',
    ],
  },
  {
    name: 'organizer.main',
    slug: 'organizer',
    schema: ORGANIZER_RESPONSE_SCHEMA,
    prompt: organizerSystemPrompt,
    parserSourcePath: 'src/lib/agents/organizer/parse.ts',
    schemaOnlyKeys: [],
    promptOnlyTokens: [
      // File-name reference in prose ("See README in organizerPrompt.ts").
      'organizerPrompt',
    ],
  },
];

// ---------------------------------------------------------------------------
// Schema introspection helpers
// ---------------------------------------------------------------------------

/** Recursively collects every `properties.<key>` key in the schema, at all depths. */
function collectAllPropertyKeys(schema: unknown, out: Set<string> = new Set()): Set<string> {
  if (!schema || typeof schema !== 'object') return out;
  const s = schema as Record<string, unknown>;
  const properties = s.properties;
  if (properties && typeof properties === 'object' && !Array.isArray(properties)) {
    for (const [key, sub] of Object.entries(properties)) {
      out.add(key);
      collectAllPropertyKeys(sub, out);
    }
  }
  const items = s.items;
  if (items && typeof items === 'object') {
    collectAllPropertyKeys(items, out);
  }
  return out;
}

/** Recursively collects every string in any `enum: [...]` array in the schema. */
function collectAllEnumValues(schema: unknown, out: Set<string> = new Set()): Set<string> {
  if (!schema || typeof schema !== 'object') return out;
  const s = schema as Record<string, unknown>;
  const enumValues = s.enum;
  if (Array.isArray(enumValues)) {
    for (const v of enumValues) {
      if (typeof v === 'string') out.add(v);
    }
  }
  const properties = s.properties;
  if (properties && typeof properties === 'object' && !Array.isArray(properties)) {
    for (const sub of Object.values(properties)) {
      collectAllEnumValues(sub, out);
    }
  }
  const items = s.items;
  if (items && typeof items === 'object') {
    collectAllEnumValues(items, out);
  }
  return out;
}

/** Top-level required keys only — direction A asserts every one is named in the prompt. */
function topLevelRequiredKeys(schema: unknown): ReadonlyArray<string> {
  if (!schema || typeof schema !== 'object') return [];
  const required = (schema as Record<string, unknown>).required;
  if (!Array.isArray(required)) return [];
  return required.filter((x): x is string => typeof x === 'string');
}

// ---------------------------------------------------------------------------
// Token matching
// ---------------------------------------------------------------------------

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Word-bounded match: the key appears as a standalone token (not part of a larger
 * identifier). Snake_case and camelCase both match correctly because `_` and
 * letter/digit are word-chars under the `\w` class.
 */
function containsToken(haystack: string, key: string): boolean {
  const re = new RegExp('(?:^|[^A-Za-z0-9_])' + escapeRegex(key) + '(?:$|[^A-Za-z0-9_])');
  return re.test(haystack);
}

/**
 * Heuristic: tokens in `text` that LOOK like schema keys — snake_case (contains
 * `_`) or camelCase (lowercase-leading with at least one internal uppercase
 * letter). Excludes single-segment lowercase words like `title` to avoid false
 * positives from English prose. The leading-lowercase requirement also drops
 * `SYSTEM_EVENT`-style sentinel constants and proper nouns like `BuddyBubble`.
 */
function extractSchemaKeyShapedTokens(text: string): Set<string> {
  const out = new Set<string>();
  const re = /\b[a-z][a-zA-Z0-9_]*\b/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const t = m[0];
    const isSnake = t.includes('_');
    const isCamel = /[A-Z]/.test(t);
    if (isSnake || isCamel) out.add(t);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Violation type + runner
// ---------------------------------------------------------------------------

export type RuleId =
  | 'required-key-missing-from-prompt'
  | 'prompt-key-missing-from-schema'
  | 'required-key-missing-from-parser';

export type Violation = {
  contract: string;
  ruleId: RuleId;
  key: string;
  message: string;
};

export type RunOptions = {
  cwd: string;
  /** Override the registry — used by the self-test for synthetic-contract negative tests. */
  registry?: ReadonlyArray<Contract>;
};

export async function runCheck(options: RunOptions): Promise<Violation[]> {
  const { cwd } = options;
  const registry = options.registry ?? REGISTRY;
  const violations: Violation[] = [];

  for (const contract of registry) {
    const required = topLevelRequiredKeys(contract.schema);
    const schemaKeys = collectAllPropertyKeys(contract.schema);
    const enumValues = collectAllEnumValues(contract.schema);
    const knownTokens = new Set<string>([
      ...schemaKeys,
      ...enumValues,
      ...(contract.promptOnlyTokens ?? []),
    ]);
    const allowedSchemaOnly = new Set<string>(contract.schemaOnlyKeys ?? []);

    // Direction A: required ⊆ prompt
    for (const key of required) {
      if (allowedSchemaOnly.has(key)) continue;
      if (!containsToken(contract.prompt, key)) {
        violations.push({
          contract: contract.name,
          ruleId: 'required-key-missing-from-prompt',
          key,
          message: `required schema key \`${key}\` is not named in the system prompt (add it to the prompt or to \`schemaOnlyKeys\` if the model is expected to know about it implicitly)`,
        });
      }
    }

    // Direction B: prompt-mentioned schema-key-shaped tokens ⊆ schema keys ∪ enum values ∪ promptOnlyTokens
    const promptTokens = extractSchemaKeyShapedTokens(contract.prompt);
    for (const token of promptTokens) {
      if (knownTokens.has(token)) continue;
      violations.push({
        contract: contract.name,
        ruleId: 'prompt-key-missing-from-schema',
        key: token,
        message: `prompt mentions token \`${token}\` which looks like a schema key but is not declared in \`responseSchema.properties\`, \`enum\` values, or \`promptOnlyTokens\` (renamed property?)`,
      });
    }

    // Direction C: required ⊆ parser source (substring scan)
    let parserSource: string;
    try {
      parserSource = await fs.readFile(path.join(cwd, contract.parserSourcePath), 'utf8');
    } catch (err) {
      throw new Error(
        `cannot read parser source for contract ${contract.name} at ${contract.parserSourcePath}: ${String(err)}`,
      );
    }
    for (const key of required) {
      if (!containsToken(parserSource, key)) {
        violations.push({
          contract: contract.name,
          ruleId: 'required-key-missing-from-parser',
          key,
          message: `required schema key \`${key}\` is not referenced anywhere in \`${contract.parserSourcePath}\` (parser likely never reads it)`,
        });
      }
    }
  }

  return violations;
}

// ---------------------------------------------------------------------------
// CLI entry
// ---------------------------------------------------------------------------

function parseArgs(argv: string[]): { silent: boolean } {
  const out = { silent: false };
  for (const a of argv) {
    if (a === '--silent') out.silent = true;
  }
  return out;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const cwd = process.cwd();
  const violations = await runCheck({ cwd });
  for (const v of violations) {
    process.stdout.write(`${v.contract}:${v.ruleId}  ${v.message}\n`);
  }
  if (!args.silent) {
    if (violations.length === 0) {
      process.stdout.write('check-agent-prompt-schema-drift: OK\n');
    } else {
      process.stderr.write(
        `check-agent-prompt-schema-drift: FAILED with ${violations.length} violation(s)\n`,
      );
    }
  }
  process.exit(violations.length === 0 ? 0 : 1);
}

const invokedDirectly =
  typeof process !== 'undefined' &&
  typeof process.argv[1] === 'string' &&
  process.argv[1].endsWith('check-agent-prompt-schema-drift.ts');
if (invokedDirectly) {
  main().catch((e) => {
    process.stderr.write(`check-agent-prompt-schema-drift: internal error — ${String(e)}\n`);
    process.exit(2);
  });
}
