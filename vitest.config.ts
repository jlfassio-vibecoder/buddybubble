import path from 'path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  esbuild: {
    // Align with Next/React 17+ JSX transform so `React` is not required in scope for tests.
    jsx: 'automatic',
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@utils': path.resolve(__dirname, './utils'),
      'server-only': path.resolve(__dirname, './vitest.server-only-stub.ts'),
    },
  },
  test: {
    /**
     * Fork pool, sequential. Forks accept `--max-old-space-size` (thread workers reject it as
     * execArgv). `minForks: 1` + `maxForks: 1` forces one test file at a time so heap from
     * earlier files is freed instead of stacking across parallel children — under the
     * GitHub-hosted runner (~7 GB) and the orchestrator's 4 GB cap, this is the difference
     * between OOM and clean runs. `--logHeapUsage` surfaces per-file heap so any future
     * regression points at the offending test.
     */
    pool: 'forks',
    poolOptions: {
      forks: {
        minForks: 1,
        maxForks: 1,
        execArgv: ['--max-old-space-size=4096'],
      },
    },
    // happy-dom provides File/Blob and other browser globals used by attachment tests (Node alone does not).
    environment: 'happy-dom',
    include: [
      'src/**/*.test.{ts,tsx}',
      'scripts/**/*.test.ts',
      'supabase/functions/_shared/**/*.test.ts',
    ],
    /** Deno-only tests (jsr: imports) run via `pnpm run test:deno-integration`. */
    exclude: [
      'supabase/functions/_shared/dispatch/llm-budget.test.ts',
      'supabase/functions/_shared/telemetry/workspace-ai-events.test.ts',
    ],
    coverage: {
      provider: 'v8',
      /** Scope: agent-routing pure modules (unit-tested). Widen as more areas get Vitest coverage. */
      include: ['src/lib/agents/**/*.ts'],
      exclude: ['**/*.test.ts', '**/*.test.tsx'],
      reportOnFailure: true,
      thresholds: {
        statements: 80,
        branches: 80,
        functions: 80,
        lines: 80,
      },
    },
  },
});
