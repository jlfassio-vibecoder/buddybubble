/**
 * Read PUBLIC_* vars for server/middleware code.
 * Astro/Vite inlines `import.meta.env.PUBLIC_*` at build time; if those are missing during
 * `astro build` (common when only a local `.env` exists), the client bundle gets empty strings.
 * Vercel and other hosts inject the same names on `process.env` at build + runtime — merge both
 * so production works when env is configured in the dashboard.
 */
export type StorefrontPublicEnvKey =
  | 'PUBLIC_SUPABASE_URL'
  | 'PUBLIC_SUPABASE_ANON_KEY'
  | 'PUBLIC_APP_ORIGIN'
  | 'PUBLIC_DEMO_WORKSPACE_ID';

export function getPublicEnv(key: StorefrontPublicEnvKey): string | undefined {
  const fromMeta = (import.meta.env as Record<string, string | undefined>)[key];
  const fromProcess = typeof process !== 'undefined' && process.env ? process.env[key] : undefined;
  const v = (fromMeta ?? fromProcess)?.trim();
  return v || undefined;
}
