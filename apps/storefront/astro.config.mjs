// @ts-check
import { defineConfig } from 'astro/config';

import react from '@astrojs/react';
import vercel from '@astrojs/vercel';

import tailwindcss from '@tailwindcss/vite';

// https://astro.build/config
export default defineConfig({
  output: 'server',
  adapter: vercel(),
  integrations: [react()],

  vite: {
    plugins: [
      // @ts-expect-error - Astro/Vite plugin type mismatch in monorepo (@tailwindcss/vite vs Astro's nested Vite)
      tailwindcss(),
    ],
  },
});
