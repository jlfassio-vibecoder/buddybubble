import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

/** Mirrors legacy `.eslintrc.json` extends: `next/core-web-vitals` (flat config). */
const eslintConfig = [
  ...require('eslint-config-next/core-web-vitals'),
  {
    ignores: ['supabase/**', 'apps/storefront/**', 'coverage/**', 'dist/**', 'mocks/**', 'e2e/**'],
  },
  // Phase 1 (Next 16 migration): preserve the legacy warn severity
  // for rules that already produced warnings on main. See docs/epics/next16-migration.md
  // Phase 5 cleanup ticket: pending.
  {
    rules: {
      '@next/next/no-img-element': 'warn',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
  // eslint-config-next 16 / react-hooks v7: additional rules are error by default and
  // fail across the app without source edits. Downgrade to `warn` for Phase 1 tooling-only scope;
  // treat cleanup as Phase 5 (same as the two-rule backlog called out in the migration doc).
  {
    rules: {
      'react-hooks/purity': 'warn',
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/refs': 'warn',
      'react-hooks/preserve-manual-memoization': 'warn',
    },
  },
];

export default eslintConfig;
