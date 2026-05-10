# Next.js 16 — `middleware` → `proxy` rename

## File placement (required)

When the App Router lives under **`src/app/`**, the root proxy entry file **`proxy.ts` MUST live inside the `src/` directory** (e.g. `src/proxy.ts`), **not** at the repository root.

Next.js 16 resolves dev Turbopack middleware/proxy candidates from `getPossibleMiddlewareFilenames(path.join(appDir, '..'), …)`, which is the parent of `src/app` — i.e. **`src/`**. Only `src/middleware.*` and `src/proxy.*` are registered. A `proxy.ts` at the repo root is ignored in `pnpm dev`, so session refresh and auth gates never run.

If you use **`app/` at the project root** (no `src/` segment), follow the official convention for that layout instead (typically `proxy.ts` next to the root `app/` folder).

## Related files

- Supabase session helper: `utils/supabase/proxy.ts` (`updateSession`, cookie rotation).
- Pre-commit checklist: when editing `proxy.ts`, run the auth E2E flow.
