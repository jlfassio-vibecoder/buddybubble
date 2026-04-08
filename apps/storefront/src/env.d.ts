/// <reference types="astro/client" />

interface ImportMetaEnv {
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
