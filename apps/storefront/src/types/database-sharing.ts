/**
 * Supabase `Database` types for BuddyBubble live at the repo root:
 * `src/types/database.ts` (kept in sync with `supabase/migrations`).
 *
 * Sharing strategy (pick one when the storefront needs typed queries):
 * - Add a workspace package (e.g. `packages/database`) that re-exports `Database` and helpers.
 * - Or add a TS path + Vite `resolve.alias` (e.g. `@buddybubble/database` → `../../../src/types/database.ts`).
 * Avoid duplicating schema types in this app so a single source of truth remains.
 */

export {};
