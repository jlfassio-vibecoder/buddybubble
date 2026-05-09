# Pre-commit checklist

Run these before every commit (or open a PR) to avoid shipping TypeScript errors, formatting drift, or broken production builds.

This repo uses **pnpm** (enforced by `preinstall`). Use `pnpm run …` from the repo root unless noted.

## Automatic enforcement (default)

On every `git commit`, **Husky** runs:

1. **lint-staged** — formats staged files with **Prettier** (writes fixes and re-stages them).
2. **`pnpm run lint`** — full-project **TypeScript** check (`tsc --noEmit`) for the **Next.js** app at the repo root.

If either step fails, the commit is aborted. Fix the reported issues and commit again.

**Not run in the hook:** `next build`, **Astro** `astro check`, or **`astro build`** (too slow or not wired into Husky). Use `pnpm run check` or CI before merging / releasing.

---

## One-command gate (manual / CI)

From the repo root:

```bash
pnpm run check
```

This runs, in order: **Prettier check** → **TypeScript (`tsc`)** → **Next.js production build** → **Astro diagnostics** for `apps/storefront` (`astro check` via `pnpm run check:storefront`).

If `check` passes, you are in good shape for formatting, TS on the CRM, the Next production build, and Astro/static analysis on the storefront. Fix failures in order (formatting first, then types, then Next build, then storefront).

**Note:** `pnpm run check` does **not** run **`astro build`**. The full Astro compile is intentionally **local** when you touch the storefront (see below). On **Vercel**, the storefront project uses an **ignored build step** so **`astro build` is skipped** when no files under `apps/storefront/` changed—CRM-only pushes do not rebuild the marketing site.

### Before you push (if `apps/storefront/` changed)

Run a full Astro verification (diagnostics + production build) from the repo root:

```bash
pnpm run verify:storefront
```

This runs **`astro check`** then **`astro build`** for `apps/storefront`. Use it after editing storefront pages, config, or dependencies so broken builds are caught **before** git, without relying on a Vercel build on every push.

### Storefront-only (Astro)

```bash
pnpm run check:storefront
```

Equivalent from `apps/storefront`:

```bash
cd apps/storefront && pnpm run astro:check
```

---

## Step-by-step (same checks as the hook + build + Astro)

| Step | Command                     | What it catches                                                                                          |
| ---- | --------------------------- | -------------------------------------------------------------------------------------------------------- |
| 1    | `pnpm run format:check`     | Files that are not formatted with **Prettier** (per `.prettierrc.json`).                                 |
| 2    | `pnpm run lint`             | **TypeScript** errors and type mismatches in the Next.js app (`tsc --noEmit`).                           |
| 3    | `pnpm run build`            | Next.js compile errors, App Router issues, and other problems only visible in a full CRM build.          |
| 4    | `pnpm run check:storefront` | **Astro** diagnostics for `apps/storefront`: `astro check` (`.astro` files, frontmatter, TS in scripts). |

### Storefront (Astro)

| Goal                             | Command (repo root)                    | Command (`apps/storefront`)              | What it does                                                                                                                                      |
| -------------------------------- | -------------------------------------- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Type + Astro diagnostics         | `pnpm run check:storefront`            | `pnpm run astro:check`                   | Runs **`astro check`** (`@astrojs/check`): Astro component issues, AOT hints, and TypeScript inside `.astro` / project `tsconfig` for storefront. |
| Verify before push (recommended) | `pnpm run verify:storefront`           | `pnpm run astro:check && pnpm run build` | **`astro check`** + **`astro build`** when you changed the storefront.                                                                            |
| Production build (marketing)     | `pnpm run build:storefront`            | `pnpm run build`                         | **`astro build`** only — bundling, adapter (e.g. Vercel), imports not caught by `astro check` alone.                                              |
| Local dev                        | —                                      | `pnpm run dev`                           | **`astro dev`** — smoke-test pages you changed (port is Astro’s default unless configured).                                                       |
| Preview production output        | `pnpm --filter storefront run preview` | `pnpm run preview`                       | Serves the last **`astro build`** output locally.                                                                                                 |

Run **`pnpm run verify:storefront`** (or at least **`astro build`**) before pushing whenever **`apps/storefront/`** was part of your work—especially **`astro.config.*`**, adapters, or env-driven URLs.

### Vercel (storefront project)

The storefront **`vercel.json`** sets **`ignoreCommand`** to `bash vercel-ignore-storefront.sh` (run from **Root Directory** **`apps/storefront`**). The script runs `git diff … -- .` against the previous deployment commit; if **nothing changed** in that directory, the deployment is **skipped** (no `astro build` on Vercel). If the storefront **did** change, Vercel runs a normal Astro build.

### Auto-fix formatting (whole repo)

If Prettier reports issues outside what lint-staged touched:

```bash
pnpm run format
```

Then re-run `pnpm run format:check`.

---

## Optional: stricter local workflow

- Run `pnpm run dev` and smoke-test the CRM flows you touched (auth, workspace, dashboard).
- Run `pnpm run dev` from **`apps/storefront`** (or your usual storefront command) and smoke-test marketing pages you touched.
- If those files are in **`apps/storefront/`**, run **`pnpm run verify:storefront`** before **`git push`**.
- After pulling or rebasing, run `pnpm run check` again before pushing.

---

## New clones

After `pnpm install`, the `prepare` script registers Husky hooks automatically. If hooks ever do not run, run `pnpm run prepare` from the repo root.
