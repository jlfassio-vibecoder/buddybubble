/**
 * Self-tests for `scripts/check-agent-mirror-parity.ts`.
 *
 * Three layers:
 *   1. Live-pairs baseline: the production mirror set must always exit clean.
 *      This codifies the snapshot at Phase 7a merge time as the floor.
 *   2. Pure-helper tests: `stripLeadingJsDoc`, `normalizeRelativeImports`,
 *      `firstDivergingLine`, `denoMirrorPathOf`, `normalizeForCompare`.
 *   3. End-to-end synthetic-pair tests: write temp files into a tmpdir and run
 *      the full pipeline against them, exercising drift detection, header
 *      tolerance, and import-extension/depth tolerance.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import {
  runCheck,
  denoMirrorPathOf,
  stripLeadingJsDoc,
  normalizeRelativeImports,
  normalizeForCompare,
  firstDivergingLine,
} from './check-agent-mirror-parity';

const REPO_ROOT = path.resolve(__dirname, '..');

describe('check-agent-mirror-parity — live pairs baseline', () => {
  it('passes with zero violations against the production mirror set', async () => {
    const violations = await runCheck({ cwd: REPO_ROOT });
    expect(violations).toEqual([]);
  });
});

describe('check-agent-mirror-parity — denoMirrorPathOf', () => {
  it('maps strategy-folder paths under `agents/`', () => {
    expect(denoMirrorPathOf('src/lib/agents/coach/parse.ts')).toBe(
      'supabase/functions/agents/coach/parse.ts',
    );
  });
  it('maps `_shared/` paths under `_shared/` (NOT under `agents/_shared/`)', () => {
    expect(denoMirrorPathOf('src/lib/agents/_shared/llm/types.ts')).toBe(
      'supabase/functions/_shared/llm/types.ts',
    );
    expect(denoMirrorPathOf('src/lib/agents/_shared/dispatch/types.ts')).toBe(
      'supabase/functions/_shared/dispatch/types.ts',
    );
  });
  it('returns null for paths outside `src/lib/agents/`', () => {
    expect(denoMirrorPathOf('src/components/Foo.tsx')).toBeNull();
  });
});

describe('check-agent-mirror-parity — stripLeadingJsDoc', () => {
  it('strips a leading `/** ... */` block plus trailing whitespace', () => {
    const src = '/**\n * Header doc.\n */\n\nexport const x = 1;\n';
    expect(stripLeadingJsDoc(src)).toBe('export const x = 1;\n');
  });
  it('does NOT strip if file does not start with `/**`', () => {
    const src = 'export const x = 1;\n';
    expect(stripLeadingJsDoc(src)).toBe('export const x = 1;\n');
  });
  it('only strips the FIRST `/** ... */` block, preserving subsequent JSDoc', () => {
    const src =
      '/**\n * Header.\n */\n\nexport const x = 1;\n\n/** Inline doc on y. */\nexport const y = 2;\n';
    expect(stripLeadingJsDoc(src)).toBe(
      'export const x = 1;\n\n/** Inline doc on y. */\nexport const y = 2;\n',
    );
  });
});

describe('check-agent-mirror-parity — normalizeRelativeImports', () => {
  it('strips `.ts` from relative imports', () => {
    expect(normalizeRelativeImports("import x from './foo.ts';")).toBe("import x from 'foo';");
  });
  it('strips `.ts` from relative type imports', () => {
    expect(normalizeRelativeImports("import type { X } from './foo.ts';")).toBe(
      "import type { X } from 'foo';",
    );
  });
  it('strips `.ts` from relative exports', () => {
    expect(normalizeRelativeImports("export { x } from './foo.ts';")).toBe(
      "export { x } from 'foo';",
    );
  });
  it('strips `.ts` from relative type exports', () => {
    expect(normalizeRelativeImports("export type { X } from './foo.ts';")).toBe(
      "export type { X } from 'foo';",
    );
  });
  it('strips leading `./` and `../` segments', () => {
    expect(normalizeRelativeImports("import x from '../foo';")).toBe("import x from 'foo';");
    expect(normalizeRelativeImports("import x from '../../bar/baz';")).toBe(
      "import x from 'bar/baz';",
    );
  });
  it('combines `../` stripping AND `.ts` stripping', () => {
    expect(normalizeRelativeImports("import x from '../../_shared/llm/types.ts';")).toBe(
      "import x from '_shared/llm/types';",
    );
  });
  it('normalizes multiline import declarations', () => {
    const src = "import {\n  A,\n  B,\n} from './foo.ts';";
    expect(normalizeRelativeImports(src)).toBe("import {\n  A,\n  B,\n} from 'foo';");
  });
  it('does NOT touch non-relative specifiers like `npm:` or bare modules', () => {
    expect(normalizeRelativeImports("import x from 'npm:foo@1.0.0';")).toBe(
      "import x from 'npm:foo@1.0.0';",
    );
    expect(normalizeRelativeImports("import x from 'react';")).toBe("import x from 'react';");
  });
  it('does NOT touch prompt/runtime strings that look like relative paths', () => {
    expect(normalizeRelativeImports("const prompt = 'Try ./next-steps.ts next';")).toBe(
      "const prompt = 'Try ./next-steps.ts next';",
    );
  });
});

describe('check-agent-mirror-parity — firstDivergingLine', () => {
  it('returns 1-based line number where the strings first differ', () => {
    expect(firstDivergingLine('a\nb\nc', 'a\nB\nc')).toBe(2);
  });
  it('returns -1 when strings are identical', () => {
    expect(firstDivergingLine('a\nb\nc', 'a\nb\nc')).toBe(-1);
  });
  it('handles unequal-length strings', () => {
    expect(firstDivergingLine('a\nb', 'a\nb\nc')).toBe(3);
  });
});

describe('check-agent-mirror-parity — normalizeForCompare', () => {
  it('normalizes CRLF to LF', () => {
    const out = normalizeForCompare('export const x = 1;\r\nexport const y = 2;\r\n');
    expect(out).toBe('export const x = 1;\nexport const y = 2;\n');
  });
  it('chains all three normalizations', () => {
    const src =
      "/**\n * Header.\n */\n\nimport x from '../../_shared/foo.ts';\r\nexport const y = 1;\r\n";
    const out = normalizeForCompare(src);
    expect(out).toBe("import x from '_shared/foo';\nexport const y = 1;\n");
  });
});

describe('check-agent-mirror-parity — synthetic pair scenarios', () => {
  let tmpRoot: string;

  beforeEach(async () => {
    tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'mirror-parity-test-'));
    await fs.mkdir(path.join(tmpRoot, 'src/lib/agents/mock'), { recursive: true });
    await fs.mkdir(path.join(tmpRoot, 'supabase/functions/agents/mock'), { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(tmpRoot, { recursive: true, force: true });
  });

  async function writePair(canonical: string, mirror: string) {
    await fs.writeFile(path.join(tmpRoot, 'src/lib/agents/mock/foo.ts'), canonical);
    await fs.writeFile(path.join(tmpRoot, 'supabase/functions/agents/mock/foo.ts'), mirror);
  }

  it('flags body drift (same JSDoc, different body)', async () => {
    await writePair(
      '/** Header. */\n\nexport const x = 1;\n',
      '/** Header. */\n\nexport const x = 2;\n',
    );
    const violations = await runCheck({
      cwd: tmpRoot,
      pairs: [
        {
          vitestRel: 'src/lib/agents/mock/foo.ts',
          denoRel: 'supabase/functions/agents/mock/foo.ts',
        },
      ],
    });
    expect(violations).toHaveLength(1);
    expect(violations[0]!.firstDivergingLine).toBeGreaterThan(0);
  });

  it('tolerates intentionally different JSDoc when body is identical', async () => {
    await writePair(
      '/**\n * Canonical header.\n */\n\nexport const x = 1;\n',
      '/**\n * MIRROR FILE — canonical lives at `src/lib/agents/mock/foo.ts`.\n */\n\nexport const x = 1;\n',
    );
    const violations = await runCheck({
      cwd: tmpRoot,
      pairs: [
        {
          vitestRel: 'src/lib/agents/mock/foo.ts',
          denoRel: 'supabase/functions/agents/mock/foo.ts',
        },
      ],
    });
    expect(violations).toEqual([]);
  });

  it("tolerates Deno's `.ts` import extensions when canonical omits them", async () => {
    await writePair(
      "/** Header. */\n\nimport x from './bar';\nexport const y = x;\n",
      "/** Header. */\n\nimport x from './bar.ts';\nexport const y = x;\n",
    );
    const violations = await runCheck({
      cwd: tmpRoot,
      pairs: [
        {
          vitestRel: 'src/lib/agents/mock/foo.ts',
          denoRel: 'supabase/functions/agents/mock/foo.ts',
        },
      ],
    });
    expect(violations).toEqual([]);
  });

  it('tolerates depth differences in `../_shared` imports between trees', async () => {
    await writePair(
      "/** Header. */\n\nimport t from '../_shared/llm/types';\nexport const u: typeof t = t;\n",
      "/** Header. */\n\nimport t from '../../_shared/llm/types.ts';\nexport const u: typeof t = t;\n",
    );
    const violations = await runCheck({
      cwd: tmpRoot,
      pairs: [
        {
          vitestRel: 'src/lib/agents/mock/foo.ts',
          denoRel: 'supabase/functions/agents/mock/foo.ts',
        },
      ],
    });
    expect(violations).toEqual([]);
  });
});
