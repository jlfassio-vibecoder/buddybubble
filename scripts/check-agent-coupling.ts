#!/usr/bin/env tsx
/**
 * Phase 4 lint guardrail: fail the build if the codebase regresses to agent-coupled code.
 *
 * Prevents:
 *   - Legacy single-agent identifiers (`useCoachTypingWait`, `CoachTypingIndicator`,
 *     `isWaitingForCoach`, `isBuddyTyping`, etc.).
 *   - Hardcoded references to `/brand/BuddyBubble-mark.svg` outside the resolver and
 *     SQL migrations (migrations reference it historically).
 *   - Indexed access `agentAuthUserIds[<number>]` — use the slug-keyed map instead.
 *   - Hardcoded agent slugs (`'coach'`, `'buddy'`, `'organizer'`) outside an explicit
 *     allowlist of files that must know about a specific agent (surface defaults,
 *     resolver library, edge functions, migrations, provisioning scripts, tests).
 *
 * Usage: `pnpm check:agent-coupling`
 *
 * Exit codes:
 *   0 — clean
 *   1 — at least one violation (each printed as `file:line:col  <rule>  <message>`)
 *   2 — internal / IO error
 *
 * CLI flags (for the self-test):
 *   --roots <comma,separated,paths>   Restrict the scan to the given paths (relative to cwd).
 *   --silent                          Suppress human summary (still prints violations).
 *
 * Rule choice: regex-over-text rather than ts-morph. We pair each regex with a path-level
 * allowlist so the output is `file:line:col`, matches are bounded, and the script has no
 * heavy dependencies (tsx + fs). Comments in the file-level allowlist explain WHY each
 * entry is exempt.
 */

import { promises as fs } from 'node:fs';
import * as path from 'node:path';

// ---------------------------------------------------------------------------
// Allowlists — each entry is path-normalized to forward slashes, matched via minimatch-ish
// glob patterns implemented below (no extra deps).
// ---------------------------------------------------------------------------

/**
 * Files / directories allowed to reference hardcoded agent slug literals ('coach',
 * 'buddy', 'organizer'). Each entry explains WHY.
 */
const SLUG_LITERAL_ALLOWLIST: ReadonlyArray<string> = [
  // Surface defaults: these files intentionally wire the "when there's no @mention,
  // fall back to Coach" behavior at the composer surface. Documented in Phase 2.
  'src/components/chat/ChatArea.tsx',
  'src/components/modals/task-modal/TaskModalCommentsPanel.tsx',

  // The resolver library IS the canonical home for slug-aware logic.
  'src/lib/agents/**',

  // Intentional Buddy-global fetch: Buddy is a workspace-global agent, joined into
  // teamMembers outside `bubble_agent_bindings`. Documented inline at line ~586.
  'src/hooks/useMessageThread.ts',

  // Test fixtures legitimately exercise slug-bearing inputs.
  '**/*.test.ts',
  '**/*.test.tsx',
  '**/*.test.js',
  '**/*.test.jsx',
  '**/*.spec.ts',
  '**/*.spec.tsx',
  '**/*.spec.js',
  '**/*.spec.jsx',
  '**/fixtures/**',
  'e2e/**',

  // SQL migrations reference slugs explicitly (both pre-existing backfill migrations
  // and the Phase 4 swap / uniqueness / webhook migrations).
  'supabase/migrations/**',

  // Edge functions need to know which agent they serve.
  'supabase/functions/bubble-agent-dispatch/**',
  'supabase/functions/buddy-agent-dispatch/**',
  'supabase/functions/organizer-agent-dispatch/**',

  // Provisioning / audit scripts need the slug list by design.
  'scripts/provision-agents.ts',
  'scripts/audit-agent-avatars.ts',
  'scripts/check-agent-coupling.ts', // this file references slugs in the allowlist itself

  // Markdown documentation: reference slugs in architecture notes / worked examples.
  'docs/**',
];

/**
 * Files allowed to reference `/brand/BuddyBubble-mark.svg`. The resolver is the only
 * live consumer at runtime; migrations reference it historically.
 */
const BUDDY_MARK_ALLOWLIST: ReadonlyArray<string> = [
  'src/lib/agents/resolveAgentAvatar.ts',
  'src/lib/agents/resolveAgentAvatar.test.ts',
  // Test suites that verify the historical Buddy mark still resolves are legitimate.
  '**/*.test.ts',
  '**/*.test.tsx',
  '**/*.spec.ts',
  '**/*.spec.tsx',
  'supabase/migrations/**',
  'docs/**',
  'scripts/provision-agents.ts',
  'scripts/check-agent-coupling.ts',
];

/** Directory roots to scan by default. */
const DEFAULT_ROOTS: ReadonlyArray<string> = [
  'src',
  'scripts',
  'supabase/functions',
  'supabase/migrations',
  'e2e',
  'docs',
];

/** Extensions we lint. */
const LINT_EXTS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.md', '.sql']);

/** Directories we never descend into. */
const SKIP_DIRS = new Set([
  'node_modules',
  '.next',
  'dist',
  'build',
  '.git',
  '.turbo',
  '.vercel',
  'coverage',
]);

// ---------------------------------------------------------------------------
// Rules
// ---------------------------------------------------------------------------

type Rule = {
  id: string;
  message: string;
  /** File patterns that are exempt (returns true → skip the rule for that path). */
  allowlist: ReadonlyArray<string>;
  /** Global regex; each match is reported with `file:line:col`. */
  pattern: RegExp;
};

const LEGACY_IDENTIFIERS = [
  'useCoachTypingWait',
  'CoachTypingIndicator',
  'isWaitingForCoach',
  'isBuddyTyping',
  'mentionsCoach',
  'mentionsBuddy',
  'coachTypingAvatarUrl',
  'COACH_WAIT_FAILSAFE_MS',
  'BUDDY_TYPING_TIMEOUT_MS',
];

const RULES: Rule[] = [
  {
    id: 'legacy-single-agent-identifier',
    message:
      'Legacy single-agent identifier. Use the agent-agnostic resolver + `useAgentResponseWait` instead.',
    allowlist: [
      // The lint rule itself names them, and the self-test fixture asserts detection.
      'scripts/check-agent-coupling.ts',
      'scripts/check-agent-coupling.test.ts',
      // Test suites may reference the names when asserting migration / removal.
      '**/*.test.ts',
      '**/*.test.tsx',
      '**/*.spec.ts',
      '**/*.spec.tsx',
      // Markdown docs / migrations may cite the legacy names historically.
      'docs/**',
      'supabase/migrations/**',
    ],
    pattern: new RegExp(`\\b(?:${LEGACY_IDENTIFIERS.join('|')})\\b`, 'g'),
  },
  {
    id: 'hardcoded-buddy-mark',
    message:
      "/brand/BuddyBubble-mark.svg outside the resolver / migrations. Use `resolveAgentAvatar` or the agent row's avatar_url.",
    allowlist: BUDDY_MARK_ALLOWLIST,
    pattern: /\/brand\/BuddyBubble-mark\.svg/g,
  },
  {
    id: 'indexed-agent-auth-user-ids',
    message:
      'Indexed access `agentAuthUserIds[<number>]`. Use slug-based lookup via `agentsByAuthUserId` instead.',
    allowlist: [
      'scripts/check-agent-coupling.ts',
      'scripts/check-agent-coupling.test.ts',
      'docs/**',
      // JSDoc comment references the legacy pattern.
      'src/hooks/useMessageThread.ts',
      // Test suites assert against the pattern as a negative fixture.
      '**/*.test.ts',
      '**/*.test.tsx',
      '**/*.spec.ts',
      '**/*.spec.tsx',
    ],
    pattern: /agentAuthUserIds\s*\[\s*\d+\s*\]/g,
  },
  {
    id: 'hardcoded-agent-slug-literal',
    message:
      "Hardcoded agent slug literal ('coach'/'buddy'/'organizer'). Outside the allowlist, resolve via agent_definitions / agentsByAuthUserId.",
    allowlist: SLUG_LITERAL_ALLOWLIST,
    pattern: /['"`](coach|buddy|organizer)['"`]/g,
  },
];

// ---------------------------------------------------------------------------
// Minimal glob matching — handles `**`, `*`, and directory boundaries. No deps.
// ---------------------------------------------------------------------------

function toRegex(glob: string): RegExp {
  const src = glob
    .split('/')
    .map((seg) => {
      if (seg === '**') return '(?:.*)';
      return seg
        .split('')
        .map((ch) => {
          if (ch === '*') return '[^/]*';
          if (/[.+?^${}()|[\]\\]/.test(ch)) return '\\' + ch;
          return ch;
        })
        .join('');
    })
    .join('/');
  return new RegExp('^' + src + '$');
}

function matchesAny(normalizedPath: string, patterns: ReadonlyArray<string>): boolean {
  for (const p of patterns) {
    if (toRegex(p).test(normalizedPath)) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Scanner
// ---------------------------------------------------------------------------

async function walk(root: string, out: string[]): Promise<void> {
  let stat;
  try {
    stat = await fs.stat(root);
  } catch {
    return;
  }
  if (stat.isFile()) {
    out.push(root);
    return;
  }
  if (!stat.isDirectory()) return;

  let entries;
  try {
    entries = await fs.readdir(root, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = path.join(root, entry.name);
    if (entry.isDirectory()) {
      await walk(full, out);
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name);
      if (LINT_EXTS.has(ext)) out.push(full);
    }
  }
}

export type Violation = {
  file: string;
  line: number;
  col: number;
  ruleId: string;
  message: string;
  snippet: string;
};

export async function runCheck(options: {
  cwd: string;
  roots?: ReadonlyArray<string>;
}): Promise<Violation[]> {
  const { cwd } = options;
  const roots = options.roots ?? DEFAULT_ROOTS;

  const files: string[] = [];
  for (const r of roots) {
    await walk(path.join(cwd, r), files);
  }

  const violations: Violation[] = [];
  for (const file of files) {
    const rel = path.relative(cwd, file).split(path.sep).join('/');

    // Collect applicable rules upfront (cheap; small list).
    const applicable = RULES.filter((r) => !matchesAny(rel, r.allowlist));
    if (applicable.length === 0) continue;

    let contents: string;
    try {
      contents = await fs.readFile(file, 'utf8');
    } catch {
      continue;
    }

    const lines = contents.split(/\r?\n/);

    for (const rule of applicable) {
      // `pattern` may or may not be global; reset lastIndex defensively.
      const re = new RegExp(rule.pattern.source, rule.pattern.flags);
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        re.lastIndex = 0;
        let m: RegExpExecArray | null;
        while ((m = re.exec(line)) !== null) {
          violations.push({
            file: rel,
            line: i + 1,
            col: m.index + 1,
            ruleId: rule.id,
            message: rule.message,
            snippet: line.trim().slice(0, 160),
          });
          if (!re.global) break;
        }
      }
    }
  }

  return violations;
}

// ---------------------------------------------------------------------------
// CLI entry
// ---------------------------------------------------------------------------

function parseArgs(argv: string[]): { roots?: string[]; silent: boolean } {
  const out: { roots?: string[]; silent: boolean } = { silent: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--roots' && argv[i + 1]) {
      out.roots = argv[i + 1]
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      i++;
    } else if (a === '--silent') {
      out.silent = true;
    }
  }
  return out;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const cwd = process.cwd();
  const violations = await runCheck({ cwd, roots: args.roots });
  for (const v of violations) {
    // Format: `file:line:col  <rule>  <message>  — <snippet>`
    process.stdout.write(
      `${v.file}:${v.line}:${v.col}  ${v.ruleId}  ${v.message}  — ${v.snippet}\n`,
    );
  }
  if (!args.silent) {
    if (violations.length === 0) {
      process.stdout.write('check-agent-coupling: OK\n');
    } else {
      process.stderr.write(`check-agent-coupling: FAILED with ${violations.length} violation(s)\n`);
    }
  }
  process.exit(violations.length === 0 ? 0 : 1);
}

// Only run when invoked directly (not when imported by the self-test).
const invokedDirectly =
  typeof process !== 'undefined' &&
  typeof process.argv[1] === 'string' &&
  process.argv[1].endsWith('check-agent-coupling.ts');
if (invokedDirectly) {
  main().catch((e) => {
    process.stderr.write(`check-agent-coupling: internal error — ${String(e)}\n`);
    process.exit(2);
  });
}
