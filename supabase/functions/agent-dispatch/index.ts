/**
 * Supabase Edge Function entry: consolidated agent dispatcher.
 *
 * This module is intentionally a thin wrapper. Every routing, parsing, and
 * persistence rule lives in `./handler.ts` so the same handler can be:
 *
 * 1. Registered with `Deno.serve(...)` here, in production.
 * 2. Imported and exercised by Deno integration tests
 *    (`./index.integration.test.ts`) without spinning up a server port.
 *
 * Do NOT wrap `Deno.serve(...)` in `import.meta.main` (or any other guard).
 * In Supabase's Edge runtime the entry module can be imported with
 * `import.meta.main = false` during the bundle/serve handshake; a guard would
 * silently leave the function with no registered handler in production.
 *
 * Secrets: see `docs/refactor/vertex-agent-dispatch-consolidation/secrets-matrix.md`.
 * Deploy with `verify_jwt = false` (already set in `supabase/config.toml` from Phase 1).
 */

import 'jsr:@supabase/functions-js/edge-runtime.d.ts';

import { handleDispatchRequest } from './handler.ts';

Deno.serve(handleDispatchRequest);
