// @ts-check
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { defineConfig } from 'astro/config';

import react from '@astrojs/react';
import vercel from '@astrojs/vercel';

import tailwindcss from '@tailwindcss/vite';

const storefrontDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(storefrontDir, '../..');
const crmSrc = path.join(repoRoot, 'src');
const supabaseShim = path.join(storefrontDir, 'src/lib/crm-supabase-client-shim.ts');

/** Shared alias map for Astro + Vite (monorepo CRM imports from storefront). */
const monorepoAliases = [
  { find: /^@\/(.*)$/, replacement: `${crmSrc}/$1` },
  { find: '@utils/supabase/client', replacement: supabaseShim },
];

// https://astro.build/config
export default defineConfig({
  output: 'server',
  adapter: vercel(),
  integrations: [react()],

  vite: {
    plugins: [tailwindcss()],
    resolve: {
      alias: monorepoAliases,
    },
    server: {
      fs: {
        allow: [repoRoot],
      },
    },
    ssr: {
      noExternal: ['zustand', 'motion'],
    },
  },
});
