/// <reference types="astro/client" />

interface ImportMetaEnv {
  /** Vite / Astro dev server flag (available at build time in client bundles). */
  readonly DEV: boolean;
  readonly PROD: boolean;
  readonly MODE: string;
  readonly BASE_URL: string;
  readonly SSR: boolean;

  readonly PUBLIC_SUPABASE_URL: string;
  readonly PUBLIC_SUPABASE_ANON_KEY: string;
  /** CRM app origin (no trailing slash). Used after sign-in to hand off the session. */
  readonly PUBLIC_APP_ORIGIN?: string;
  /** Workspace UUID for the live CRM iframe (`/demo?workspace=…`). Must be allowed by CRM DEMO_WORKSPACE_IDS. */
  readonly PUBLIC_DEMO_WORKSPACE_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
