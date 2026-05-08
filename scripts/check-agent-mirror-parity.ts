#!/usr/bin/env tsx
/**
 * Phase 7a lint guardrail #2: byte-for-byte parity between Vitest-canonical and
 * Deno-mirror agent modules.
 *
 * The agent-dispatch-v2 architecture maintains pure TypeScript modules in two
 * locations:
 *
 *   - `src/lib/agents/<slug>/...` (or `src/lib/agents/_shared/...`) — canonical
 *     Vitest-side home for everything Vitest can exercise without Deno globals or
 *     a Supabase client.
 *   - `supabase/functions/agents/<slug>/...` (or `supabase/functions/_shared/...`) —
 *     byte-for-byte Deno mirror that the deployed Edge Functions import.
 *
 * Some files are bidirectional canonical/mirror pairs (e.g. `_shared/dispatch/types.ts`
 * is canonical on the Deno side, mirrored on the Vitest side). Direction does not
 * matter for parity: this script asserts the bodies match modulo two normalizations.
 *
 * Discovery rule: enumerate `src/lib/agents/**\/*.ts` (skip `*.test.ts`, including
 * `*.smoke.test.ts`); for each, compute the equivalent Deno path. If both files
 * exist, it is a mirror pair. If only one exists, the file is intentionally
 * Vitest-only or Deno-only (e.g. `strategy.ts`, `context.ts`, `parse.test.ts`)
 * and is skipped silently. This makes the script robust to future strategies —
 * naming convention enforces intent.
 *
 * Normalization before comparison:
 *   1. Strip the leading `/** ... *\/` JSDoc block (its body intentionally differs
 *      between canonical and mirror).
 *   2. Normalize relative imports/exports: strip leading `./` / `../` segments AND
 *      any trailing `.ts` extension, but ONLY in import/export specifiers. This makes
 *      `'../_shared/llm/types'` (Vitest, where `_shared` lives under
 *      `src/lib/agents/`) compare equal to `'../../_shared/llm/types.ts'` (Deno,
 *      where `_shared` lives under `supabase/functions/`). Both resolve to logically
 *      the same module — the depth difference is a structural artifact of the two
 *      trees, not drift.
 *   3. Normalize CRLF → LF defensively.
 *
 * After normalization the two files must hash-equal (SHA-256). On mismatch the
 * script reports the first diverging line in the normalized bodies.
 *
 * Usage: `pnpm check:agent-mirror`
 *
 * Exit codes:
 *   0 — clean
 *   1 — at least one mirror pair drifted
 *   2 — internal / IO error
 *
 * CLI flags (for the self-test):
 *   --silent                          Suppress human summary (still prints violations).
 */

import { promises as fs } from 'node:fs';
import { createHash } from 'node:crypto';
import * as path from 'node:path';

const VITEST_ROOT_REL = 'src/lib/agents';
const DENO_AGENTS_PREFIX = 'supabase/functions/agents';
const DENO_SHARED_PREFIX = 'supabase/functions/_shared';

// ---------------------------------------------------------------------------
// Path mapping
// ---------------------------------------------------------------------------

/**
 * Map a Vitest-side path under `src/lib/agents/` to the Deno equivalent.
 *
 * Examples:
 *   `src/lib/agents/coach/parse.ts`           → `supabase/functions/agents/coach/parse.ts`
 *   `src/lib/agents/_shared/llm/types.ts`     → `supabase/functions/_shared/llm/types.ts`
 *   `src/lib/agents/_shared/dispatch/types.ts`→ `supabase/functions/_shared/dispatch/types.ts`
 */
export function denoMirrorPathOf(vitestPath: string): string | null {
  const norm = vitestPath.split(path.sep).join('/');
  if (!norm.startsWith(VITEST_ROOT_REL + '/')) return null;
  const after = norm.slice(VITEST_ROOT_REL.length + 1);
  if (after.startsWith('_shared/')) {
    return DENO_SHARED_PREFIX + '/' + after.slice('_shared/'.length);
  }
  return DENO_AGENTS_PREFIX + '/' + after;
}

// ---------------------------------------------------------------------------
// Normalization
// ---------------------------------------------------------------------------

/**
 * Strip the file's leading JSDoc block (`/** ... *\/`) plus trailing whitespace.
 * Conservative: only strips if the file actually opens with `/**`. Stops at the
 * FIRST `*\/`, so subsequent inline JSDoc on type/function declarations is preserved.
 */
export function stripLeadingJsDoc(text: string): string {
  const m = text.match(/^\s*\/\*\*[\s\S]*?\*\/\s*/);
  if (!m) return text;
  return text.slice(m[0].length);
}

/**
 * Normalize relative import/export specifiers: strip leading `./` / `../`
 * segments and any trailing `.ts` extension. So `import './config'`,
 * `import './config.ts'`, `export ... from '../_shared/llm/types'`, and
 * `export ... from '../../_shared/llm/types.ts'` all reduce to a canonical
 * form like `'config'` or `'_shared/llm/types'`.
 *
 * Why aggressive `../` stripping: the Vitest tree puts `_shared` UNDER
 * `src/lib/agents/`, while the Deno tree puts `_shared` AS A SIBLING of
 * `functions/agents/`. So `coach/schema.ts` reaches `_shared/llm/types` via
 * `../_shared/...` on Vitest but `../../_shared/...` on Deno. Both resolve to
 * logically the same module — the depth difference is a tree-shape artifact,
 * not drift.
 *
 * Only touches RELATIVE paths (starting with `./` or `../`) in import/export
 * specifiers to avoid mangling prompt/runtime strings or specifier schemes like
 * `npm:` and `jsr:`.
 */
export function normalizeRelativeImports(text: string): string {
  return text.replace(
    /^(?<before>\s*(?:import|export)(?:\s+type)?\b[\s\S]*?\bfrom\s*['"])(?<prefix>(?:\.\.?\/)+)(?<body>[^'"]+?)(?:\.ts)?(?<quote>['"])/gm,
    (_full, before, _prefix, body, quote) => `${before}${body}${quote}`,
  );
}

export function normalizeForCompare(raw: string): string {
  let t = raw.replace(/\r\n/g, '\n');
  t = stripLeadingJsDoc(t);
  t = normalizeRelativeImports(t);
  return t;
}

// ---------------------------------------------------------------------------
// Discovery
// ---------------------------------------------------------------------------

const SKIP_DIRS = new Set(['node_modules', '.next', 'dist', 'build', '.git']);

async function walk(dir: string, out: string[]): Promise<void> {
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await walk(full, out);
    } else if (entry.isFile() && entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts')) {
      out.push(full);
    }
  }
}

/**
 * Discover (canonicalRelPath, mirrorRelPath) pairs by walking `src/lib/agents/`,
 * skipping test files, and confirming the Deno twin exists.
 */
export async function discoverPairs(
  cwd: string,
): Promise<ReadonlyArray<{ vitestRel: string; denoRel: string }>> {
  const root = path.join(cwd, VITEST_ROOT_REL);
  const files: string[] = [];
  await walk(root, files);
  const pairs: { vitestRel: string; denoRel: string }[] = [];
  for (const abs of files) {
    const rel = path.relative(cwd, abs).split(path.sep).join('/');
    const denoRel = denoMirrorPathOf(rel);
    if (!denoRel) continue;
    try {
      const stat = await fs.stat(path.join(cwd, denoRel));
      if (stat.isFile()) pairs.push({ vitestRel: rel, denoRel });
    } catch {
      // No Deno twin → file is Vitest-only (e.g. test fixtures); skip silently.
    }
  }
  // Stable order so violation output is deterministic across runs.
  pairs.sort((a, b) => a.vitestRel.localeCompare(b.vitestRel));
  return pairs;
}

// ---------------------------------------------------------------------------
// Compare
// ---------------------------------------------------------------------------

function sha256(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

/** Return the 1-based line number of the first divergence between two strings. */
export function firstDivergingLine(a: string, b: string): number {
  const aLines = a.split('\n');
  const bLines = b.split('\n');
  const lim = Math.max(aLines.length, bLines.length);
  for (let i = 0; i < lim; i++) {
    if (aLines[i] !== bLines[i]) return i + 1;
  }
  return -1;
}

export type Violation = {
  vitestPath: string;
  denoPath: string;
  vitestHash: string;
  denoHash: string;
  firstDivergingLine: number;
  message: string;
};

export type RunOptions = {
  cwd: string;
  /** Override the discovered pair list — used by the self-test for synthetic pairs. */
  pairs?: ReadonlyArray<{ vitestRel: string; denoRel: string }>;
};

export async function runCheck(options: RunOptions): Promise<Violation[]> {
  const { cwd } = options;
  const pairs = options.pairs ?? (await discoverPairs(cwd));
  const violations: Violation[] = [];

  for (const { vitestRel, denoRel } of pairs) {
    let vitestRaw: string;
    let denoRaw: string;
    try {
      vitestRaw = await fs.readFile(path.join(cwd, vitestRel), 'utf8');
      denoRaw = await fs.readFile(path.join(cwd, denoRel), 'utf8');
    } catch (err) {
      throw new Error(`cannot read mirror pair ${vitestRel} / ${denoRel}: ${String(err)}`);
    }
    const vitestNorm = normalizeForCompare(vitestRaw);
    const denoNorm = normalizeForCompare(denoRaw);
    const vitestHash = sha256(vitestNorm);
    const denoHash = sha256(denoNorm);
    if (vitestHash === denoHash) continue;
    const lineNum = firstDivergingLine(vitestNorm, denoNorm);
    violations.push({
      vitestPath: vitestRel,
      denoPath: denoRel,
      vitestHash,
      denoHash,
      firstDivergingLine: lineNum,
      message: `mirror drift detected (first diverging line in normalized body: ${lineNum})`,
    });
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
    process.stdout.write(
      `${v.vitestPath} ↔ ${v.denoPath}  ${v.message}\n` +
        `  canonical sha256: ${v.vitestHash}\n` +
        `  mirror    sha256: ${v.denoHash}\n`,
    );
  }
  if (!args.silent) {
    if (violations.length === 0) {
      process.stdout.write('check-agent-mirror-parity: OK\n');
    } else {
      process.stderr.write(
        `check-agent-mirror-parity: FAILED with ${violations.length} drifted pair(s)\n`,
      );
    }
  }
  process.exit(violations.length === 0 ? 0 : 1);
}

const invokedDirectly =
  typeof process !== 'undefined' &&
  typeof process.argv[1] === 'string' &&
  process.argv[1].endsWith('check-agent-mirror-parity.ts');
if (invokedDirectly) {
  main().catch((e) => {
    process.stderr.write(`check-agent-mirror-parity: internal error — ${String(e)}\n`);
    process.exit(2);
  });
}
