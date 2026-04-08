# Pre-commit checklist

Run these before every commit (or open a PR) to avoid shipping TypeScript errors, formatting drift, or broken production builds.

## Automatic enforcement (default)

On every `git commit`, **Husky** runs:

1. **lint-staged** — formats staged files with **Prettier** (writes fixes and re-stages them).
2. **`npm run lint`** — full-project **TypeScript** check (`tsc --noEmit`).

If either step fails, the commit is aborted. Fix the reported issues and commit again.

**Not run in the hook:** `next build` (too slow for every commit). Use `npm run check` or CI before merging / releasing.

---

## One-command gate (manual / CI)

From the repo root:

```bash
npm run check
```

This runs, in order: **Prettier check** → **TypeScript (`tsc`)** → **Next.js production build** → **Astro check** (`apps/storefront`, `astro check`).

If `check` passes, you are in good shape for formatting, TS compliance, both production builds, and Astro diagnostics. Fix failures in order (formatting first, then types, then Next build, then storefront).

To run only the marketing storefront type/Astro diagnostics:

```bash
npm run check:storefront
```

---

## Step-by-step (same checks as the hook + build)

| Step | Command                    | What it catches                                                                             |
| ---- | -------------------------- | ------------------------------------------------------------------------------------------- |
| 1    | `npm run format:check`     | Files that are not formatted with **Prettier** (per `.prettierrc.json`).                    |
| 2    | `npm run lint`             | **TypeScript** errors and type mismatches (`tsc --noEmit`).                                 |
| 3    | `npm run build`            | Next.js compile errors, App Router issues, and other problems only visible in a full build. |
| 4    | `npm run check:storefront` | **Astro** diagnostics for `apps/storefront` (`astro check`).                                |

### Auto-fix formatting (whole repo)

If Prettier reports issues outside what lint-staged touched:

```bash
npm run format
```

Then re-run `npm run format:check`.

---

## Optional: stricter local workflow

- Run `npm run dev` and smoke-test the flows you touched (auth, workspace, dashboard).
- After pulling or rebasing, run `npm run check` again before pushing.

---

## New clones

After `npm install`, the `prepare` script registers Husky hooks automatically. If hooks ever do not run, run `npm run prepare` from the repo root.
