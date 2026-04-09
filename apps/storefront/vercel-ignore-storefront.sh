#!/usr/bin/env bash
# Vercel "Ignored Build Step": exit 0 = skip build; exit 1 = run build.
# Project Root Directory must be apps/storefront — command runs with that folder as cwd, so diff -- .
set -uo pipefail

if [ -z "${VERCEL_GIT_PREVIOUS_SHA:-}" ]; then
  exit 1
fi

if git diff --quiet "$VERCEL_GIT_PREVIOUS_SHA" "$VERCEL_GIT_COMMIT_SHA" -- .; then
  exit 0
fi

exit 1
