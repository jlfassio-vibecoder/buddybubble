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
    },
  },
  test: {
    // happy-dom provides File/Blob and other browser globals used by attachment tests (Node alone does not).
    environment: 'happy-dom',
    include: ['src/**/*.test.{ts,tsx}', 'scripts/**/*.test.ts'],
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
