/**
 * Isolate PostCSS from the repo root. Root postcss.config.mjs targets Next.js and
 * pulls in @tailwindcss/postcss (root devDependency). Astro discovers config by
 * walking up the tree; without this file, Vercel/production installs can fail
 * with "Cannot find module '@tailwindcss/postcss'" when building the storefront.
 *
 * Tailwind here is handled by @tailwindcss/vite in astro.config.mjs.
 */
/** @type {import('postcss-load-config').Config} */
const config = {
  plugins: {},
};

export default config;
