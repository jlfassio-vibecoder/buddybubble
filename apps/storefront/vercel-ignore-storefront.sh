#!/usr/bin/env bash
# Vercel "Ignored Build Step": exit 0 = skip this deployment's build; exit 1 = run build.
# Skips Astro production builds when nothing under apps/storefront changed (typical CRM-only pushes).
# Runs from the Git repo root (see https://vercel.com/docs/project-configuration/git-settings#ignored-build-step).
set -uo pipefail

if [ -z "${VERCEL_GIT_PREVIOUS_SHA:-}" ]; then
  exit 1
fi

if git diff "$VERCEL_GIT_PREVIOUS_SHA" "$VERCEL_GIT_COMMIT_SHA" --quiet -- apps/storefront/; then
  exit 0
fi

exit 1
