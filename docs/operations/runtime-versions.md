# Runtime versions (Node.js)

This repo uses a **single Node.js floor** for local development, CI, and dependency resolution.

## Source of truth

- **`.nvmrc`** at the repository root declares the minimum Node version (currently `22.12.0`). Use `nvm use` (or your version manager’s equivalent) from the repo root before `pnpm install`.
- **GitHub Actions** reads `.nvmrc` via `actions/setup-node` `node-version-file` in [`.github/workflows/ci.yml`](../../.github/workflows/ci.yml).

## `engines` and `engine-strict`

- Root [`package.json`](../../package.json) and [`apps/storefront/package.json`](../../apps/storefront/package.json) set `"engines": { "node": ">=22.12.0" }` to match the real toolchain (including transitive requirements such as `@astrojs/react@5`).
- [`.npmrc`](../../.npmrc) sets `engine-strict=true` so `pnpm install` **fails** when the active Node version does not satisfy declared engines. This is intentional: it surfaces mismatches early instead of at runtime.

## Vercel (operator action)

Vercel **does not** read `.nvmrc` or `package.json` `engines` for the deployed Node runtime. You must set **Project → Settings → General → Node.js Version** to **22.x** for:

- The **CRM** (Next.js) project
- The **storefront** (Astro) project

[`vercel.json`](../../vercel.json) and [`apps/storefront/vercel.json`](../../apps/storefront/vercel.json) intentionally omit a Node version; the Vercel project setting is the authority.

Until both projects use Node 22, production installs can fail the same way CI did under Node 20 with strict engines.

## Related docs

- [Next.js 16 migration epic](../epics/next16-migration.md) — platform upgrade context.
